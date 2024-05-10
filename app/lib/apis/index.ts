import { Network } from "bitcoinjs-lib";

import { ValidAddressRuneAsset } from "../types/rune";
import { sleep } from "../utils";
import { getAddressRuneBalance } from "./luminex";
import {
  getAddressRuneBalanceList,
  getAddressRuneUTXOs,
  getAddressRunes,
} from "./unisat/api";

export const formatAddressRuneBalance = async (
  address: string,
  network: Network,
  endpoint: "unisat" | "luminex",
) => {
  const validRunes: Omit<ValidAddressRuneAsset, "type">[] = [];

  const balance = await getAddressRuneBalance(network, address);

  if (endpoint === "unisat") {
    const balance = await getAddressRunes(network, address);

    const notMergedRunes = balance.filter((rune) => rune.runes.length === 1);

    validRunes.push(
      ...notMergedRunes.map((item) => {
        const rune = item.runes[0];

        return {
          txid: item.txid,
          vout: item.vout,
          value: item.value,
          amount: rune.amount,
          runeId: rune.runeId,
          rune: rune.rune,
          spacedRune: rune.spacedRune,
          symbol: rune.symbol,
          divisibility: rune.divisibility,
        };
      }),
    );
  } else if (endpoint === "luminex") {
    const balance = await getAddressRuneBalance(network, address);
  }

  return validRunes;
};
