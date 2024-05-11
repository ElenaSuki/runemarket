import { ActionFunction, json } from "@remix-run/node";
import { networks } from "bitcoinjs-lib";
import { z } from "zod";

import { getLastBlockHeight } from "@/lib/apis/mempool";
import { getBTCUTXOs } from "@/lib/apis/unisat/api";
import { getAddressUTXOs } from "@/lib/apis/wizz";
import RedisInstance from "@/lib/server/redis.server";
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

    const { scripthash } = detectAddressTypeToScripthash(data.address);

    const [utxos, blockHeight] = await Promise.all([
      getAddressUTXOs(network, scripthash),
      getLastBlockHeight(network),
      // getAddressRuneBalance(network, data.address),
    ]);

    const runeUTXOs: {
      tx: string;
      vout: number;
    }[] = [];

    // runeBalance.forEach((rune) => {
    //   rune.utxos.forEach((utxo) => {
    //     runeUTXOs.push({
    //       tx: utxo.tx_id,
    //       vout: utxo.vout,
    //     });
    //   });
    // });

    const validUTXOs = utxos.filter((utxo) => {
      if (utxo.height > blockHeight) return false;

      if (
        runeUTXOs.some(
          (runeUTXO) =>
            runeUTXO.tx === utxo.txid && runeUTXO.vout === utxo.vout,
        )
      )
        return false;

      return true;
    });

    await RedisInstance.set(
      `address:utxos:${data.address}`,
      JSON.stringify(
        validUTXOs.map((utxo) => ({
          txid: utxo.txid,
          vout: utxo.vout,
          value: utxo.value,
        })),
      ),
      "EX",
      30,
      "NX",
    );

    return json({
      code: 0,
      error: false,
      data: validUTXOs.map((utxo) => ({
        txid: utxo.txid,
        vout: utxo.vout,
        value: utxo.value,
      })),
    });
  } catch (e) {
    console.log(e);
    return json(errorResponse(20001));
  }
};
