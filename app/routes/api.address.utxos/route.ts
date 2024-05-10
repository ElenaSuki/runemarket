import { ActionFunction, json } from "@remix-run/node";
import { networks } from "bitcoinjs-lib";
import { z } from "zod";

import { getLastBlockHeight } from "@/lib/apis/mempool";
import { getBTCUTXOs } from "@/lib/apis/unisat/api";
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

    const network =
      data.network === "bitcoin" ? networks.bitcoin : networks.testnet;

    const [utxos, blockHeight] = await Promise.all([
      getBTCUTXOs(network, data.address),
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

    return json({
      code: 0,
      error: false,
      data: validUTXOs.map((utxo) => ({
        txid: utxo.txid,
        vout: utxo.vout,
        value: utxo.satoshi,
      })),
    });
  } catch (e) {
    console.log(e);
    return json(errorResponse(20001));
  }
};
