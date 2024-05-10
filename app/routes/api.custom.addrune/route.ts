import { ActionFunction, json } from "@remix-run/node";
import axios from "axios";

import RedisInstance from "@/lib/server/redis.server";
import { ValidAddressRuneAsset } from "@/lib/types/rune";

export const action: ActionFunction = async ({ request }) => {
  const data: {
    address: string;
    runeName: string;
    apikey: string;
  } = await request.json();

  if (
    data.apikey !==
    "1b72baedc79a3c5d85a86a50dd9be0f94d55c60e9d9cf5e5cb94b9c4d62fd58a"
  ) {
    return json({
      error: "Forbidden",
    });
  }

  const runes = await axios.get<{
    data: {
      list: {
        rune: string;
        runeid: string;
        spacedRune: string;
        amount: string;
        symbol: string;
        divisibility: number;
      }[];
    };
  }>("https://wallet-api.unisat.io/v5/runes/list", {
    params: {
      address: data.address,
      cursor: 0,
      size: 100,
    },
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  const matchedRune = runes.data.data.list.find(
    (rune) => rune.spacedRune === data.runeName,
  );

  if (matchedRune) {
    const utxo = await axios.get<{
      data: {
        satoshis: number;
        txid: string;
        vout: number;
        runes: {
          rune: string;
          runeid: string;
          spacedRune: string;
          amount: string;
          symbol: string;
          divisibility: number;
        }[];
      }[];
    }>("https://wallet-api.unisat.io/v5/runes/utxos", {
      params: {
        address: data.address,
        runeid: matchedRune.runeid,
      },
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    if (!utxo.data.data || utxo.data.data.length !== 1) {
      return json({
        error: "Not a collection",
      });
    }

    const u = utxo.data.data[0];

    if (u.runes.length !== 1) {
      return json({
        error: "Merged rune",
      });
    }

    const waitSaveRune: Omit<ValidAddressRuneAsset, "type" | "inscription"> = {
      txid: u.txid,
      vout: u.vout,
      value: u.satoshis,
      amount: (
        parseFloat(matchedRune.amount) /
        10 ** matchedRune.divisibility
      ).toString(),
      runeId: matchedRune.runeid,
      rune: matchedRune.rune,
      spacedRune: matchedRune.spacedRune,
      symbol: matchedRune.symbol,
      divisibility: matchedRune.divisibility,
    };

    await RedisInstance.hsetnx(
      `address:${data.address}:validrunes`,
      waitSaveRune.spacedRune,
      JSON.stringify(waitSaveRune),
    );

    return json({
      success: true,
      data: waitSaveRune,
    });
  }

  return json({
    error: "Not Found",
  });
};
