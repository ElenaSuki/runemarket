import { ActionFunction, json } from "@remix-run/node";
import { z } from "zod";

import DatabaseInstance from "@/lib/server/prisma.server";
import { errorResponse } from "@/lib/utils/error-helpers";

const RequestSchema = z.object({
  collection_name: z.string(),
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

    const [offer, orders] = await DatabaseInstance.$transaction([
      DatabaseInstance.offers.findFirst({
        select: {
          unit_price: true,
        },
        where: {
          status: 1,
          collection_name: data.collection_name,
        },
        orderBy: [
          {
            unit_price: "asc",
          },
        ],
        take: 1,
      }),
      DatabaseInstance.orders.findMany({
        select: { unit_price: true },
        where: {
          collection_name: data.collection_name,
        },
        orderBy: [
          {
            create_at: "desc",
          },
        ],
        take: 3,
      }),
    ]);

    const response: {
      floorPrice: string;
      avgSalePrice: string;
    } = {
      floorPrice: "0",
      avgSalePrice: "0",
    };

    if (offer) {
      response.floorPrice = offer.unit_price.toString();
    }

    if (orders.length > 0) {
      const avgPrice =
        orders.reduce((acc, cur) => acc + cur.unit_price, 0) / orders.length;
      response.avgSalePrice = avgPrice.toString();
    }

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
