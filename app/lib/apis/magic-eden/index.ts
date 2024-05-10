import axios from "axios";
import { Network, networks } from "bitcoinjs-lib";

import { MagicEdenRuneUTXOType } from "./type";

const API_KEY = "97031496-92f2-41b5-830f-beae6561dfc6";

const BaseUrl = (network: Network) =>
  network === networks.testnet
    ? "https://api-mainnet.magiceden.dev"
    : "https://api-mainnet.magiceden.dev";

const AxiosInstance = axios.create({
  timeout: 1000 * 20,
  headers: {
    Authorization: `Bearer ${API_KEY}`,
  },
});

export const getAddressRuneUTXOs = async (
  network: Network,
  address: string,
  rune: string,
) => {
  const resp = await AxiosInstance.get<{
    utxos: MagicEdenRuneUTXOType[];
  }>(`${BaseUrl(network)}/v2/ord/btc/runes/utxos/wallet/${address}`, {
    params: {
      rune,
    },
  });

  return resp.data.utxos;
};
