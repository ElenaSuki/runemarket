import { ActionFunction, json } from "@remix-run/node";
import dayjs from "dayjs";
import { z } from "zod";

import DatabaseInstance from "@/lib/server/prisma.server";
import { errorResponse } from "@/lib/utils/error-helpers";

const RequestSchema = z.object({
  ids: z.array(z.number().int().min(0)).min(1),
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

    for (const id of data.ids) {
      try {
        await DatabaseInstance.offers.updateMany({
          where: {
            id,
          },
          data: {
            status: 2,
            update_at: dayjs().unix(),
          },
        });
      } catch (e) {
        continue;
      }
    }

    return json({
      code: 0,
      error: false,
      data: null,
    });
  } catch (e) {
    console.log(e);
    return json(errorResponse(20001));
  }
};
