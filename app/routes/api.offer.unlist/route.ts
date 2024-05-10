import { ActionFunction, json } from "@remix-run/node";
import { verifyMessage } from "@unisat/wallet-utils";
import { Verifier } from "bip322-js";
import dayjs from "dayjs";
import { z } from "zod";

import DatabaseInstance from "@/lib/server/prisma.server";
import { errorResponse } from "@/lib/utils/error-helpers";

const RequestSchema = z.object({
  signature: z.string().min(1),
  address: z.string().min(1),
  pubkey: z.string().min(1),
  address_type: z.string().min(1),
  offers: z.array(z.number().int()),
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

    const message = `unlist offers ${data.offers.join(",")} by ${data.address}`;

    if (data.address_type === "p2tr") {
      const validity = Verifier.verifySignature(
        data.address,
        message,
        data.signature,
      );
      if (!validity) {
        return json(errorResponse(30007));
      }
    } else {
      const result = verifyMessage(data.pubkey, message, data.signature);
      if (!result) {
        return json(errorResponse(30007));
      }
    }

    await DatabaseInstance.$transaction(async () => {
      const offers = await DatabaseInstance.offers.findMany({
        where: {
          id: {
            in: data.offers,
          },
        },
      });

      await DatabaseInstance.activities.createMany({
        data: offers.map((item) => {
          return {
            rune_id: item.rune_id,
            rune_name: item.rune_name,
            rune_spaced_name: item.rune_spaced_name,
            collection_name: item.collection_name,
            inscription_id: item.inscription_id,
            item_lister: item.lister,
            symbol: item.symbol,
            amount: item.amount,
            unit_price: item.unit_price,
            total_price: item.total_price,
            type: "unlist",
            timestamp: dayjs().unix(),
          };
        }),
      });

      await DatabaseInstance.offers.updateMany({
        where: {
          id: {
            in: data.offers,
          },
        },
        data: {
          status: 2,
          update_at: dayjs().unix(),
        },
      });
    });

    return json({
      data: null,
      code: 0,
      error: false,
    });
  } catch (e) {
    console.log(e);
    return json(errorResponse(20001));
  }
};
