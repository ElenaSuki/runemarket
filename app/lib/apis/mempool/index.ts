import { Network, networks } from "bitcoinjs-lib";

import AxiosInstance from "@/lib/axios";
import { UTXO } from "@/lib/types";

import { pushTransaction } from "../wizz";

const BaseUrl = (network: Network) =>
  network === networks.testnet
    ? "https://mempool.space/testnet/api"
    : "https://mempool.space/api";

export const getAddressBalance = async (address: string, network: Network) => {
  const { data } = await AxiosInstance.get<{
    address: string;
    chain_stats: {
      funded_txo_count: number;
      funded_txo_sum: number;
      spent_txo_count: number;
      spent_txo_sum: number;
      tx_count: number;
    };
    mempool_stats: {
      funded_txo_count: number;
      funded_txo_sum: number;
      spent_txo_count: number;
      spent_txo_sum: number;
      tx_count: number;
    };
  }>(`${BaseUrl(network)}/address/${address}`);

  const { chain_stats, mempool_stats } = data;

  const availableBalance =
    chain_stats.funded_txo_sum +
    mempool_stats.funded_txo_sum -
    chain_stats.spent_txo_sum -
    mempool_stats.spent_txo_sum;

  return {
    availableBalance,
  };
};

export const getBtcPrice = async () => {
  const { data } = await AxiosInstance.get<{
    time: number;
    USD: number;
  }>("https://mempool.space/api/v1/prices");

  return data.USD;
};

export const getUTXOsInMempool = async (address: string, network: Network) => {
  const { data } = await AxiosInstance.get<
    {
      txid: string;
      version: number;
      locktime: number;
      vin: {
        txid: string;
        vout: number;
        prevout: {
          scriptpubkey: string;
          scriptpubkey_asm: string;
          scriptpubkey_type: string;
          scriptpubkey_address: string;
          value: number;
        };
      }[];
      vout: {
        scriptpubkey: string;
        scriptpubkey_asm: string;
        scriptpubkey_type: string;
        scriptpubkey_address: string;
        value: number;
      }[];
      size: number;
      weight: number;
      fee: number;
      status: {
        confirmed: boolean;
      };
    }[]
  >(`${BaseUrl(network)}/address/${address}/txs/mempool`);

  const receiveUTXOs: UTXO[] = [];
  const spentUTXOs: UTXO[] = [];
  for (const tx of data) {
    if (tx.status.confirmed) {
      continue;
    }

    tx.vin.forEach((vin) => {
      if (vin.prevout.scriptpubkey_address === address) {
        spentUTXOs.push({
          txid: vin.txid,
          vout: vin.vout,
          value: vin.prevout.value,
        });
      }
    });

    tx.vout.forEach((vout, index) => {
      if (vout.scriptpubkey_address === address) {
        receiveUTXOs.push({
          txid: tx.txid,
          vout: index,
          value: vout.value,
        });
      }
    });
  }
  return {
    receive: receiveUTXOs,
    spent: spentUTXOs,
  };
};

export const getRecommendedFees = async (network: Network) => {
  const resp = await AxiosInstance.get<{
    fastestFee: number;
    halfHourFee: number;
    hourFee: number;
    economyFee: number;
    minimumFee: number;
  }>(`${BaseUrl(network)}/v1/fees/recommended`);

  const data = resp.data;

  return [
    {
      title: "Low Priority",
      description: "~1 hour",
      value: data.hourFee,
    },
    {
      title: "Medium Priority",
      description: "~30 mins",
      value: data.halfHourFee,
    },
    {
      title: "High Priority",
      description: "~10 mins",
      value: data.fastestFee,
    },
  ];
};

export const getTransaction = async (txid: string, network: Network) => {
  const resp = await AxiosInstance.get<{
    txid: string;
    version: number;
    locktime: number;
    size: number;
    weight: number;
    fee: number;
    vin: {
      txid: string;
      vout: number;
      witness: string[];
      prevout: {
        scriptpubkey: string;
        scriptpubkey_asm: string;
        scriptpubkey_type: string;
        scriptpubkey_address: string;
        value: number;
      };
    }[];
    vout: {
      scriptpubkey: string;
      scriptpubkey_asm: string;
      scriptpubkey_type: string;
      scriptpubkey_address: string;
      value: number;
    }[];
    status: {
      confirmed: boolean;
    };
  }>(`${BaseUrl(network)}/tx/${txid}`);

  return resp.data;
};

export const pushTx = async (network: Network, rawTx: string) => {
  const tryMempoolSpace = async () => {
    const resp = await AxiosInstance.post<string>(
      `${BaseUrl(network)}/tx`,
      rawTx,
    );
    const txId = resp.data;
    return txId;
  };

  const tryWizz = async () => {
    const txid = await pushTransaction(network, rawTx);
    return txid;
  };

  const tryList = [tryWizz, tryMempoolSpace];

  for (const tryFunc of tryList) {
    try {
      const txId: string = await tryFunc();
      return txId;
    } catch (e) {
      console.log(e);
    }
  }

  throw new Error("Failed to push transaction");
};

export const getLastBlockHeight = async (network: Network) => {
  const resp = await AxiosInstance.get<number>(
    `${BaseUrl(network)}/blocks/tip/height`,
  );
  return resp.data;
};

export const getTransactionRawHex = async (network: Network, txid: string) => {
  const resp = await AxiosInstance.get<string>(
    `${BaseUrl(network)}/tx/${txid}/hex`,
  );

  return resp.data;
};

export const getTransactionsOutspent = async (
  network: Network,
  txid: string,
) => {
  const resp = await AxiosInstance.get<
    {
      spent: boolean;
      txid: string;
      vin: number;
      status: {
        confirmed: boolean;
      };
    }[]
  >(`${BaseUrl(network)}/tx/${txid}/outspends`);

  return resp.data;
};
