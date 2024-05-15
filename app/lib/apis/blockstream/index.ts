import axios from "axios";
import { Network, networks } from "bitcoinjs-lib";

const BaseUrl = (network: Network) =>
  network === networks.testnet
    ? "https://blockstream.info/testnet/api"
    : "https://blockstream.info/api";

export const getTransactionOutspent = async (
  network: Network,
  txid: string,
  vout: number,
) => {
  const resp = await axios.get<{
    spent: boolean;
  }>(`${BaseUrl(network)}/tx/${txid}/outspend/${vout}`);

  return resp.data.spent;
};
