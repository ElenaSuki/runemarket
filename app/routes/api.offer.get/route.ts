import { Prisma } from "@prisma/client";
import { ActionFunction, json } from "@remix-run/node";
import { z } from "zod";

import DatabaseInstance from "@/lib/server/prisma.server";
import { RuneOfferType } from "@/lib/types/market";
import { errorResponse } from "@/lib/utils/error-helpers";

const RequestSchema = z.object({
  collection: z.string().optional(),
  order: z.enum(["price:asc", "price:desc", "id:asc", "id:desc"]),
  limit: z.number().min(1).max(100),
  offset: z.number().min(0),
  filters: z.string().optional(),
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

    const orderBy: Prisma.offersOrderByWithRelationAndSearchRelevanceInput[] =
      [];

    switch (data.order) {
      case "price:asc":
        orderBy.push({ unit_price: "asc" }, { id: "desc" });
        break;
      case "price:desc":
        orderBy.push({ unit_price: "desc" }, { id: "desc" });
        break;
      case "id:asc":
        orderBy.push({ id: "asc" });
        break;
      case "id:desc":
        orderBy.push({ id: "desc" });
        break;
    }

    const [offers, count] = await DatabaseInstance.$transaction([
      DatabaseInstance.offers.findMany({
        select: {
          id: true,
          bid: true,
          rune_spaced_name: true,
          funding_receiver: true,
          rune_id: true,
          symbol: true,
          unit_price: true,
          total_price: true,
          amount: true,
          unsigned_psbt: true,
          lister: true,
          location_txid: true,
          location_vout: true,
          divisibility: true,
          inscription_id: true,
          inscription_txid: true,
          inscription_vout: true,
        },
        where: {
          status: 1,
          rune_spaced_name: data.filters
            ? {
                contains: data.filters,
              }
            : undefined,
          collection_name: data.collection,
        },
        orderBy,
        take: data.limit,
        skip: data.offset,
      }),
      DatabaseInstance.offers.count({
        where: {
          status: 1,
          collection_name: data.collection,
        },
      }),
    ]);

    const response: {
      offers: RuneOfferType[];
      count: number;
    } = {
      count,
      offers: offers.map((offer) => ({
        id: offer.id,
        bid: offer.bid,
        spacedName: offer.rune_spaced_name,
        symbol: offer.symbol,
        unitPrice: offer.unit_price.toString(),
        totalPrice: offer.total_price.toString(),
        amount: offer.amount,
        fundingReceiver: offer.funding_receiver,
        unsignedPsbt: offer.unsigned_psbt,
        lister: offer.lister,
        txid: offer.location_txid,
        vout: offer.location_vout,
        runeId: offer.rune_id,
        divisibility: offer.divisibility,
        inscriptionId: offer.inscription_id || "",
        inscriptionTxid: offer.inscription_txid ?? undefined,
        inscriptionVout: offer.inscription_vout ?? undefined,
      })),
    };

    return json({
      code: 0,
      error: false,
      data: response,
    });
  } catch (e) {
    console.log(e);
    return json(errorResponse(20001));
  }
};
