import axios from "axios";
import { Network, networks } from "bitcoinjs-lib";

import RedisInstance from "@/lib/server/redis.server";
import { AddressRuneAsset } from "@/lib/types/rune";

import {
  AddressRunesUTXOReq,
  RunesInfoReq,
  UnisatInscriptionInfoType,
} from "./type";

const API_KEY =
  "59847a3e55dce7fe73c80877ae2b2bc5e9eb2e797de9e5c4f6d602dc996cf706";

const BaseUrl = (network: Network) =>
  network === networks.testnet
    ? "https://open-api-testnet.unisat.io"
    : "https://open-api.unisat.io";

const AxiosInstance = axios.create({
  timeout: 1000 * 20,
  headers: {
    Authorization: `Bearer ${API_KEY}`,
  },
});

export const getRuneInfo = async (network: Network, runeId: string) => {
  const cache = await RedisInstance.get(`unisat:rune:info:${runeId}`);

  if (cache) {
    return JSON.parse(cache);
  }

  const resp = await AxiosInstance.get<{
    code: number;
    message: string;
    data: RunesInfoReq | null;
  }>(`${BaseUrl(network)}/v1/indexer/runes/${runeId}/info`);

  if (!resp.data.data) {
    throw new Error("Rune not found");
  }

  await RedisInstance.set(
    `unisat:rune:info:${runeId}`,
    JSON.stringify(resp.data.data),
    "EX",
    60 * 60,
    "NX",
  );

  return resp.data.data;
};

export const getAddressRuneUTXOsByUnisat = async (
  network: Network,
  address: string,
  runeId: string,
): Promise<AddressRuneAsset[]> => {
  const cache = await RedisInstance.get(
    `unisat:address:rune:utxo:${address}:${runeId}`,
  );

  if (cache) {
    return JSON.parse(cache);
  }

  const resp = await AxiosInstance.get<{
    code: number;
    message: string;
    data: {
      start: number;
      total: number;
      utxo: AddressRunesUTXOReq[];
    };
  }>(`${BaseUrl(network)}/v1/indexer/address/${address}/runes/${runeId}/utxo`, {
    params: {
      start: 0,
      limit: 500,
    },
  });

  const array = resp.data.data.utxo.map((utxo) => ({
    txid: utxo.txid,
    vout: utxo.vout,
    value: utxo.satoshi,
    runes: utxo.runes.map((rune) => ({
      amount: (
        BigInt(rune.amount) /
        10n ** BigInt(rune.divisibility)
      ).toString(),
      runeId: rune.runeid,
      rune: rune.rune,
      spacedRune: rune.spacedRune,
      symbol: rune.symbol,
      divisibility: rune.divisibility,
    })),
  }));

  await RedisInstance.set(
    `unisat:address:rune:utxo:${address}:${runeId}`,
    JSON.stringify(array),
    "EX",
    60 * 1,
    "NX",
  );

  return array;
};

export const getBTCUTXOs = async (network: Network, address: string) => {
  const resp = await AxiosInstance.get<{
    code: number;
    message: string;
    data: {
      utxo: {
        txid: string;
        vout: number;
        satoshi: number;
        scriptType: string;
        scriptPk: string;
        codeType: number;
        address: string;
        height: number;
        idx: number;
        isOpInRBF: boolean;
        isSpent: boolean;
        inscriptions: {
          inscriptionId: string;
          isBRC20: boolean;
          moved: boolean;
        }[];
      }[];
    };
  }>(`${BaseUrl(network)}/v1/indexer/address/${address}/utxo-data`, {
    params: {
      cursor: 0,
      size: 1000,
    },
  });

  return resp.data.data.utxo;
};

export const checkUTXOBalance = async (
  network: Network,
  txid: string,
  index: number,
): Promise<
  {
    runeId: string;
    rune: string;
    symbol: string;
    spacedRune: string;
    amount: string;
    divisibility: number;
  }[]
> => {
  const resp = await AxiosInstance.get<{
    code: number;
    message: string;
    data: {
      rune: string;
      runeid: string;
      amount: string;
      divisibility: number;
      symbol: string;
      spacedRune: string;
    }[];
  }>(`${BaseUrl(network)}/v1/indexer/runes/utxo/${txid}/${index}/balance`);

  if (resp.data.data.length === 0) return [];

  const array = resp.data.data.map((rune) => ({
    runeId: rune.runeid,
    rune: rune.rune,
    symbol: rune.symbol,
    spacedRune: rune.spacedRune,
    amount: rune.amount,
    divisibility: rune.divisibility,
  }));

  return array;
};

export const getAddressInscriptions = async (
  network: Network,
  address: string,
): Promise<
  {
    utxo: {
      txid: string;
      vout: number;
      satoshi: number;
      isSpent: boolean;
    };
    inscriptionId: string;
  }[]
> => {
  const cache = await RedisInstance.get(
    `unisat:address:inscription:${address}`,
  );

  if (cache) {
    return JSON.parse(cache);
  }

  const resp = await AxiosInstance.get<{
    data: {
      inscription: {
        utxo: {
          txid: string;
          vout: number;
          satoshi: number;
          isSpent: boolean;
        };
        inscriptionId: string;
      }[];
    };
  }>(`${BaseUrl(network)}/v1/indexer/address/${address}/inscription-data`, {
    params: {
      cursor: 0,
      size: 1000,
    },
  });

  const array = resp.data.data.inscription.filter(
    (inscription) => !inscription.utxo.isSpent,
  );

  await RedisInstance.set(
    `unisat:address:inscription:${address}`,
    JSON.stringify(array),
    "EX",
    60 * 2,
    "NX",
  );

  return array;
};

export const getInscriptionInfo = async (
  network: Network,
  inscriptionId: string,
): Promise<UnisatInscriptionInfoType> => {
  const resp = await AxiosInstance.get<{
    code: number;
    message: string;
    data: UnisatInscriptionInfoType;
  }>(`${BaseUrl(network)}/v1/indexer/inscription/info/${inscriptionId}`);

  if (!resp.data.data) {
    throw new Error("Inscription not found");
  }

  return resp.data.data;
};

export const getRuneHolders = async (
  network: Network,
  runeId: string,
): Promise<
  {
    address: string;
    amount: string;
  }[]
> => {
  const cache = await RedisInstance.get(`unisat:rune:holders:${runeId}`);

  if (cache) {
    return JSON.parse(cache);
  }

  const resp = await AxiosInstance.get<{
    code: number;
    message: string;
    data: {
      detail: {
        address: string;
        amount: string;
      }[];
    };
  }>(`${BaseUrl(network)}/v1/indexer/runes/${runeId}/holders`, {
    params: {
      start: 0,
      limit: 50,
    },
  });

  const array = resp.data.data.detail;

  await RedisInstance.set(
    `unisat:rune:holders:${runeId}`,
    JSON.stringify(array),
    "EX",
    60 * 5,
    "NX",
  );

  return array;
};
