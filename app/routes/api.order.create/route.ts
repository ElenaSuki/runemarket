import { ActionFunction, json } from "@remix-run/node";
import { Psbt, networks } from "bitcoinjs-lib";
import dayjs from "dayjs";
import { z } from "zod";

import { pushTx } from "@/lib/apis/mempool";
import DatabaseInstance from "@/lib/server/prisma.server";
import RedisInstance from "@/lib/server/redis.server";
import { isTestnetAddress, reverseBuffer } from "@/lib/utils/address-helpers";
import { validateInputSignature } from "@/lib/utils/bitcoin-utils";
import { errorResponse, formatError } from "@/lib/utils/error-helpers";

const RequestSchema = z.object({
  psbt: z.string().min(1),
  buyer: z.string().min(1),
  item_receiver: z.string().min(1),
  sign_indexs: z.array(z.number().int()).min(1),
  offer_ids: z.array(z.number().int()).min(1),
  padding_count: z.number().int().min(0),
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

    const psbt = Psbt.fromHex(data.psbt);

    if (psbt.txInputs.length === 0 || psbt.txOutputs.length === 0) {
      return json(errorResponse(30001));
    }

    // check psbt input signature
    for (let i = 0; i < psbt.txInputs.length; i++) {
      if (data.sign_indexs.includes(i)) {
        const psbtValid = validateInputSignature(psbt, i);

        if (!psbtValid) {
          return json(errorResponse(30008));
        }

        psbt.finalizeInput(i);
      }
    }

    const offers = await DatabaseInstance.offers.findMany({
      where: {
        id: {
          in: data.offer_ids,
        },
        status: 1,
      },
    });

    const isCollection = offers.some((offer) => offer.inscription_id);

    for (let i = 0; i < offers.length; i++) {
      try {
        const txInput = psbt.txInputs[i + 1];

        const txid = reverseBuffer(txInput.hash).toString("hex");
        const index = txInput.index;

        const offer = isCollection
          ? offers[0]
          : offers.find(
              (offer) =>
                offer.location_txid === txid && offer.location_vout === index,
            );

        if (!offer) {
          throw new Error("Not found offer");
        }

        const offerPsbt = Psbt.fromHex(offer.psbt);

        for (let j = 0; j < offerPsbt.data.inputs.length; j++) {
          if (
            !offerPsbt.data.inputs[j].finalScriptWitness &&
            !offerPsbt.data.inputs[j].finalScriptSig
          ) {
            offerPsbt.finalizeInput(j);
          }

          if (offerPsbt.data.inputs[j].finalScriptSig) {
            psbt.updateInput(data.padding_count + i + j + 1, {
              finalScriptSig: offerPsbt.data.inputs[j].finalScriptSig,
            });
          } else if (offerPsbt.data.inputs[j].finalScriptWitness) {
            psbt.updateInput(data.padding_count + i + j + 1, {
              finalScriptWitness: offerPsbt.data.inputs[j].finalScriptWitness,
            });
          }
        }
      } catch (e) {
        console.log(e);
        return json(errorResponse(30010));
      }
    }

    const tx = psbt.extractTransaction();

    const txid = tx.getId();
    const rawTx = tx.toHex();

    try {
      try {
        await pushTx(
          isTestnetAddress(data.buyer) ? networks.testnet : networks.bitcoin,
          rawTx,
        );
      } catch (e) {
        const message = formatError(e);

        if (message === "bad-txns-inputs-missingorspent") {
          await DatabaseInstance.offers.updateMany({
            where: {
              id: {
                in: data.offer_ids,
              },
            },
            data: {
              status: 2,
            },
          });

          return json(errorResponse(30016));
        }
      }

      await DatabaseInstance.$transaction(async () => {
        await Promise.all(
          offers.map((offer) => {
            return RedisInstance.hdel(
              `address:${offer.lister}:validrunes`,
              `${offer.rune_spaced_name}`,
            );
          }),
        );
        await DatabaseInstance.activities.createMany({
          data: offers.map((offer) => {
            return {
              rune_id: offer.rune_id,
              rune_name: offer.rune_name,
              rune_spaced_name: offer.rune_spaced_name,
              collection_name: offer.collection_name,
              inscription_id: offer.inscription_id,
              item_lister: offer.lister,
              item_receiver: data.item_receiver,
              symbol: offer.symbol,
              amount: offer.amount,
              unit_price: offer.unit_price,
              total_price: offer.total_price,
              type: "buy",
              tx_id: txid,
              timestamp: dayjs().unix(),
            };
          }),
        });
        await DatabaseInstance.orders.createMany({
          data: offers.map((offer) => ({
            bid: offer.bid,
            rune_id: offer.rune_id,
            rune_name: offer.rune_name,
            unit_price: offer.unit_price,
            total_price: offer.total_price,
            amount: offer.amount,
            lister: offer.lister,
            buyer: data.buyer,
            item_receiver: data.item_receiver,
            psbt: psbt.toHex(),
            tx_id: txid,
            create_at: dayjs().unix(),
            collection_name: offer.collection_name,
          })),
        });
        await DatabaseInstance.offers.updateMany({
          where: {
            id: {
              in: data.offer_ids,
            },
          },
          data: {
            status: 3,
          },
        });
      });

      return json({
        code: 0,
        error: false,
        data: {
          txid,
        },
      });
    } catch (e) {
      console.log(e);
      console.log(`offer ids: ${offers.map((offer) => offer.id).join(", ")}`);

      return json(errorResponse(20001));
    }
  } catch (e) {
    console.log(e);
    return json(errorResponse(20001));
  }
};
