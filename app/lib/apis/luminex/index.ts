import axios from "axios";
import { Network, networks } from "bitcoinjs-lib";

import { LuminexRuneBalance } from "./type";

const BaseUrl = (network: Network) =>
  network === networks.testnet
    ? "https://brc20-api.luminex.io"
    : "https://brc20-api.luminex.io";

const AxiosInstance = axios.create({
  timeout: 1000 * 20,
  headers: {
    Accept: "application/json",
    Referer: "https://luminex.io/",
    "User-Agent": "Thunder Client (https://www.thunderclient.com)",
  },
});

export const getAddressRuneBalance = async (
  network: Network,
  address: string,
) => {
  const resp = await AxiosInstance.get<{
    data: LuminexRuneBalance[];
  }>(`${BaseUrl(network)}/runes/balances`, {
    params: {
      address,
    },
  });

  return resp.data.data;
};
