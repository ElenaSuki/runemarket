import { ActionFunction, json } from "@remix-run/node";
import { networks } from "bitcoinjs-lib";
import { z } from "zod";

import { getAddressRuneWithLocation } from "@/lib/apis/indexer/api";
import {
  getAddressInscriptions,
  getAddressRuneBalanceList,
} from "@/lib/apis/unisat/api";
import { getAddressUTXOs } from "@/lib/apis/wizz";
import { SUPPORT_TESTNET } from "@/lib/config";
import DatabaseInstance from "@/lib/server/prisma.server";
import RedisInstance from "@/lib/server/redis.server";
import { ValidAddressRuneAsset } from "@/lib/types/rune";
import { detectAddressTypeToScripthash } from "@/lib/utils/address-helpers";
import { errorResponse } from "@/lib/utils/error-helpers";

const RequestSchema = z.object({
  address: z.string().min(1),
  network: z.enum(["bitcoin", "testnet"]),
});

type RequestSchemaType = z.infer<typeof RequestSchema>;

export const action: ActionFunction = async ({ request }) => {
  try {
    const data: RequestSchemaType = await request.json();

    try {
      RequestSchema.parse(data);
    } catch (e) {
      return json(errorResponse(10001));
    }

    if (data.network === "testnet" && !SUPPORT_TESTNET) {
      return json(errorResponse(20002));
    }

    const cache = await RedisInstance.get(`address:balance:${data.address}`);

    if (cache) {
      return json({
        code: 0,
        error: false,
        data: JSON.parse(cache),
      });
    }

    const network =
      data.network === "bitcoin" ? networks.bitcoin : networks.testnet;

    const { scripthash } = detectAddressTypeToScripthash(data.address);

    const [balance, runelocations, utxos] = await Promise.all([
      getAddressRuneBalanceList(network, data.address),
      getAddressRuneWithLocation(data.address),
      getAddressUTXOs(network, scripthash),
    ]);

    const validRunes: Map<
      string,
      Omit<ValidAddressRuneAsset, "type" | "inscription">
    > = new Map();

    for (const rune of balance) {
      const existLocation = runelocations.data.find(
        (item) => item.rune_id === rune.runeid,
      );

      if (!existLocation) continue;

      const utxo = utxos.find(
        (item) =>
          item.txid === existLocation.location_txid &&
          item.vout === existLocation.location_vout,
      );

      if (!utxo) continue;

      validRunes.set(
        `${existLocation.location_txid}:${existLocation.location_vout}`,
        {
          txid: utxo.txid,
          vout: utxo.vout,
          value: utxo.value,
          amount: rune.amount,
          runeId: rune.runeid,
          rune: rune.rune,
          spacedRune: rune.spacedRune,
          symbol: rune.symbol,
          divisibility: rune.divisibility,
        },
      );
    }

    const validRunesArray = Array.from(validRunes.values());

    const nftItems = await DatabaseInstance.rune_collection_item.findMany({
      select: {
        rune_spaced_name: true,
        etch_tx_hash: true,
      },
      where: {
        valid: 1,
        rune_spaced_name: {
          in: validRunesArray.map((rune) => rune.spacedRune),
        },
      },
    });

    const inscriptions = await getAddressInscriptions(network, data.address);

    const formatRunes: ValidAddressRuneAsset[] = validRunesArray.map((item) => {
      const nftMatch = nftItems.find(
        (nft) => nft.rune_spaced_name === item.spacedRune,
      );

      if (nftMatch) {
        const inscription = inscriptions.find(
          (insc) => insc.inscriptionId.split("i")[0] === nftMatch.etch_tx_hash,
        );

        if (inscription) {
          return {
            ...item,
            type: "nft",
            inscription: {
              inscriptionId: inscription.inscriptionId,
              txid: inscription.utxo.txid,
              vout: inscription.utxo.vout,
              value: inscription.utxo.satoshi,
            },
          };
        } else {
          return {
            ...item,
            type: "token",
          };
        }
      } else {
        return {
          ...item,
          type: "token",
        };
      }
    });

    await RedisInstance.set(
      `address:balance:${data.address}`,
      JSON.stringify(formatRunes),
      "EX",
      60 * 1,
      "NX",
    );

    return json({
      code: 0,
      error: false,
      data: formatRunes,
    });
  } catch (e) {
    console.log(e);
    return json(errorResponse(20001));
  }
};
