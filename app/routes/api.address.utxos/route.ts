import { ActionFunction, json } from "@remix-run/node";
import { networks } from "bitcoinjs-lib";
import { z } from "zod";

import { getLastBlockHeight } from "@/lib/apis/mempool";
import { getBTCUTXOs } from "@/lib/apis/unisat/api";
import { SUPPORT_TESTNET } from "@/lib/config";
import RedisInstance from "@/lib/server/redis.server";
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

    const cache = await RedisInstance.get(`address:utxos:${data.address}`);

    if (cache) {
      return json({
        code: 0,
        error: false,
        data: JSON.parse(cache),
      });
    }

    const network =
      data.network === "bitcoin" ? networks.bitcoin : networks.testnet;

    const [utxos, blockHeight] = await Promise.all([
      getBTCUTXOs(network, data.address),
      getLastBlockHeight(network),
    ]);

    const validUTXOs = utxos.filter((utxo) => {
      if (utxo.height > blockHeight) return false;

      if (utxo.satoshi <= 546) return false;

      return true;
    });

    const array = validUTXOs.map((utxo) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.satoshi,
    }));

    await RedisInstance.set(
      `address:utxos:${data.address}`,
      JSON.stringify(array),
      "EX",
      60,
      "NX",
    );

    return json({
      code: 0,
      error: false,
      data: array,
    });
  } catch (e) {
    console.log(e);
    return json(errorResponse(20001));
  }
};
