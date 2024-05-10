import axios from "axios";
import { Network } from "bitcoinjs-lib";

export const getAddressUTXOs = async (network: Network, scriptHash: string) => {
  const resp = await axios.get<{
    response: {
      atomicals: string[];
      height: number;
      index: number;
      tx_hash: string;
      tx_pos: number;
      txid: string;
      value: number;
      vout: number;
    }[];
  }>(`https://ep.wizz.cash/proxy/blockchain.scripthash.listunspent`, {
    params: {
      params: `["${scriptHash}"]`,
    },
  });

  return resp.data.response.filter((item) => item.atomicals.length === 0);
};

export const pushTransaction = async (network: Network, txHex: string) => {
  const resp = await axios.post<{
    response: string;
  }>(`https://ep.wizz.cash/proxy/blockchain.transaction.broadcast`, {
    params: [txHex],
  });

  return resp.data.response;
};
