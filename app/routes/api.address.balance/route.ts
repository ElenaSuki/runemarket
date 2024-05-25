import { ActionFunction, json } from "@remix-run/node";
import { networks } from "bitcoinjs-lib";
import { z } from "zod";

import { getAddressRuneWithLocation } from "@/lib/apis/indexer/api";
import { getAddressInscriptions } from "@/lib/apis/unisat/api";
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

    const [balance, utxos] = await Promise.all([
      getAddressRuneWithLocation(data.address),
      getAddressUTXOs(network, scripthash),
    ]);

    const validRunes: Map<
      string,
      Omit<ValidAddressRuneAsset, "merged" | "inscription">
    > = new Map();

    for (const rune of balance.data) {
      const utxo = utxos.find(
        (item) =>
          item.txid === rune.location_txid && item.vout === rune.location_vout,
      );

      if (!utxo) continue;

      validRunes.set(`${rune.location_txid}:${rune.location_vout}`, {
        name: rune.rune_name,
        runeId: rune.rune_id,
        rune: {
          txid: utxo.txid,
          vout: utxo.vout,
          value: utxo.value,
        },
      });
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
          in: validRunesArray.map((rune) => rune.name),
        },
      },
    });

    const inscriptions = await getAddressInscriptions(network, data.address);

    const formatRunes: ValidAddressRuneAsset[] = validRunesArray.map((item) => {
      const nftMatch = nftItems.find(
        (nft) => nft.rune_spaced_name === item.name,
      );

      if (nftMatch) {
        const inscription = inscriptions.find(
          (insc) => insc.inscriptionId.split("i")[0] === nftMatch.etch_tx_hash,
        );

        if (inscription) {
          return {
            ...item,
            merged:
              inscription.utxo.txid === item.rune.txid &&
              inscription.utxo.vout === item.rune.vout
                ? true
                : false,
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
            merged: false,
          };
        }
      } else {
        return {
          ...item,
          merged: false,
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
