import { ActionFunction, json } from "@remix-run/node";
import { networks } from "bitcoinjs-lib";
import { z } from "zod";

import { getAddressRuneBalance } from "@/lib/apis/luminex";
import { getAddressRuneUTXOs } from "@/lib/apis/magic-eden";
import { getAddressInscriptions } from "@/lib/apis/unisat/api";
import { getAddressUTXOs } from "@/lib/apis/wizz";
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

    const [utxos, balance] = await Promise.all([
      getAddressUTXOs(network, scripthash),
      getAddressRuneBalance(network, data.address),
    ]);

    const runeNames = balance.map((item) => item.rune_text.replaceAll("•", ""));

    const chunks: string[][] = [];

    for (let i = 0; i < runeNames.length; i += 5) {
      const chunk = runeNames.slice(i, i + 5);
      chunks.push(chunk);
    }

    const validRunes: Map<
      string,
      Omit<ValidAddressRuneAsset, "type" | "inscription">
    > = new Map();

    for (const chunk of chunks) {
      const results = await Promise.all(
        chunk.map((rune) => getAddressRuneUTXOs(network, data.address, rune)),
      );

      results.forEach((result) => {
        result.forEach((runeUTXO) => {
          if (runeUTXO.spent) return;

          const [txid, vout] = runeUTXO.location.split(":");

          const value =
            utxos.find(
              (utxo) => utxo.txid === txid && utxo.vout === parseInt(vout),
            )?.value || 0;
          const runeData = balance.find(
            (b) => b.rune_text.replaceAll("•", "") === runeUTXO.rune,
          );

          if (!runeData || value === 0) return;

          validRunes.set(`${runeUTXO.location}`, {
            txid,
            vout: parseInt(vout),
            value,
            amount: (
              parseFloat(runeData.balance) /
              10 ** runeData.divisibility
            ).toString(),
            runeId: `${runeData.rune_block}:${runeData.rune_tx}`,
            rune: runeData.rune_text.replaceAll("•", ""),
            spacedRune: runeData.rune_text,
            symbol: runeData.symbol,
            divisibility: runeData.divisibility,
          });
        });
      });
    }

    const redisRune = await RedisInstance.hvals(
      `address:${data.address}:validrunes`,
    );

    redisRune.forEach((rune) => {
      const obj: Omit<ValidAddressRuneAsset, "type" | "inscription"> =
        JSON.parse(rune);

      validRunes.set(`${obj.txid}:${obj.vout}`, obj);
    });

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

    const validCollectionRunes: ValidAddressRuneAsset[] = validRunesArray.map(
      (item) => {
        const nftMatch = nftItems.find(
          (nft) => nft.rune_spaced_name === item.spacedRune,
        );

        if (nftMatch) {
          const inscription = inscriptions.find(
            (insc) =>
              insc.inscriptionId.split("i")[0] === nftMatch.etch_tx_hash,
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
      },
    );

    RedisInstance.set(
      `address:balance:${data.address}`,
      JSON.stringify(
        validCollectionRunes.filter(
          (item) => item.type === "nft" && item.inscription,
        ),
      ),
      "EX",
      60 * 1,
      "NX",
    );

    return json({
      code: 0,
      error: false,
      data: validCollectionRunes.filter(
        (item) => item.type === "nft" && item.inscription,
      ),
    });
  } catch (e) {
    console.log(e);
    return json(errorResponse(20001));
  }
};
