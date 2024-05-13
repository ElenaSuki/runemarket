import { ActionFunction, json } from "@remix-run/node";
import { networks } from "bitcoinjs-lib";
import { z } from "zod";

import { checkUTXOBalance, getInscriptionInfo } from "@/lib/apis/unisat/api";
import DatabaseInstance from "@/lib/server/prisma.server";
import RedisInstance from "@/lib/server/redis.server";
import { errorResponse } from "@/lib/utils/error-helpers";

const RequestSchema = z.object({
  ids: z.array(z.number().int().min(1)),
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

    const offers = await DatabaseInstance.offers.findMany({
      select: {
        id: true,
        location_txid: true,
        location_vout: true,
        rune_id: true,
        inscription_id: true,
        inscription_txid: true,
        inscription_vout: true,
        lister: true,
      },
      where: {
        id: {
          in: data.ids,
        },
        status: 1,
      },
    });

    const validOfferIds: number[] = [];

    if (offers.length === 0) {
      return json({ code: 0, error: false, data: validOfferIds });
    }

    for (const offer of offers) {
      try {
        const cache = await RedisInstance.get(`offer:${offer.id}:valid`);

        if (cache) {
          validOfferIds.push(offer.id);
          continue;
        }

        const runeValidateResult = await checkUTXOBalance(
          networks.bitcoin,
          offer.location_txid,
          offer.location_vout,
        );

        if (!runeValidateResult || runeValidateResult.length === 0) {
          continue;
        }

        const rune = runeValidateResult[0];

        if (rune.runeId !== offer.rune_id) {
          continue;
        }

        if (
          !offer.inscription_id ||
          !offer.inscription_txid ||
          offer.inscription_vout === null
        ) {
          continue;
        }

        const inscriptionValidateResult = await getInscriptionInfo(
          networks.bitcoin,
          offer.inscription_id,
        );

        if (!inscriptionValidateResult || !inscriptionValidateResult.utxo) {
          continue;
        }

        if (
          inscriptionValidateResult.address !== offer.lister ||
          inscriptionValidateResult.utxo.txid !== offer.inscription_txid ||
          inscriptionValidateResult.utxo.vout !== offer.inscription_vout
        ) {
          continue;
        }

        await RedisInstance.set(
          `offer:${offer.id}:valid`,
          "true",
          "EX",
          60 * 3,
          "NX",
        );

        validOfferIds.push(offer.id);
      } catch (e) {
        continue;
      }
    }

    return json({ code: 0, error: false, data: validOfferIds });
  } catch (e) {
    return json(errorResponse(20001));
  }
};
