import { ActionFunction, json } from "@remix-run/node";
import { z } from "zod";

import DatabaseInstance from "@/lib/server/prisma.server";
import { errorResponse } from "@/lib/utils/error-helpers";

const RequestSchema = z.object({
  address: z.string().min(1),
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
        rune_id: true,
        unit_price: true,
        total_price: true,
        funding_receiver: true,
        location_txid: true,
        location_vout: true,
        inscription_id: true,
      },
      where: {
        status: 1,
        lister: data.address,
      },
      orderBy: [
        {
          id: "desc",
        },
      ],
    });

    return json({
      code: 0,
      error: false,
      data: offers.map((offer) => ({
        id: offer.id,
        runeId: offer.rune_id,
        unitPrice: offer.unit_price.toString(),
        totalPrice: offer.total_price.toString(),
        fundingReceiver: offer.funding_receiver,
        txid: offer.location_txid,
        vout: offer.location_vout,
        inscriptionId: offer.inscription_id || "",
      })),
    });
  } catch (e) {
    console.log(e);
    return json(errorResponse(20001));
  }
};
