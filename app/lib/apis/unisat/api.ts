import axios, { isAxiosError } from "axios";
import { Network, networks } from "bitcoinjs-lib";

import RedisInstance from "@/lib/server/redis.server";
import { AddressRuneAsset } from "@/lib/types/rune";

import {
  AddressRunesBalanceReq,
  AddressRunesUTXOReq,
  RunesInfoReq,
  UnisatInscriptionInfoType,
} from "./type";

const API_KEY_LIST = [
  "59847a3e55dce7fe73c80877ae2b2bc5e9eb2e797de9e5c4f6d602dc996cf706",
  "129ba06ce6cc2ba1bd771c6444ad632e8480b0d31fb87a326a2592fd8e0b958e",
  "55a80b1b4eec7afd00d00d955681b87014796c34856ff749a052695d05f17a5e",
];

const BaseUrl = (network: Network) =>
  network === networks.testnet
    ? "https://open-api-testnet.unisat.io"
    : "https://open-api.unisat.io";

export const tryWithApiKey = async <T>(
  network: Network,
  url: string,
  params?: any,
) => {
  for (const key of API_KEY_LIST) {
    try {
      const resp = await axios.get<{
        code: number;
        msg: string;
        data: T;
      }>(`${BaseUrl(network)}${url}`, {
        headers: {
          Authorization: `Bearer ${key}`,
        },
        params,
      });

      if (resp.data.code !== 0) {
        throw new Error(resp.data.msg);
      }

      return resp.data.data;
    } catch (e) {
      console.log(e);

      if (isAxiosError(e) && e.response?.status === 403) {
        throw new Error(e.response?.data?.data?.msg || "Unknow error");
      }
    }
  }

  throw new Error("All API keys are failed");
};

export const getRuneInfo = async (
  network: Network,
  runeId: string,
): Promise<RunesInfoReq> => {
  const cache = await RedisInstance.get(`unisat:rune:info:${runeId}`);

  if (cache) {
    return JSON.parse(cache);
  }

  const data = await tryWithApiKey<RunesInfoReq | null>(
    network,
    `/v1/indexer/runes/${runeId}/info`,
  );

  if (!data) {
    throw new Error("Rune not found");
  }

  await RedisInstance.set(
    `unisat:rune:info:${runeId}`,
    JSON.stringify(data),
    "EX",
    60 * 60,
    "NX",
  );

  return data;
};

export const getAddressRuneBalanceList = async (
  network: Network,
  address: string,
): Promise<AddressRunesBalanceReq[]> => {
  const cache = await RedisInstance.get(
    `unisat:address:rune:balance:${address}`,
  );

  if (cache) {
    return JSON.parse(cache);
  }

  const data = await tryWithApiKey<{
    detail: AddressRunesBalanceReq[];
    start: number;
    total: number;
  }>(network, `/v1/indexer/address/${address}/runes/balance-list`, {
    start: 0,
    limit: 500,
  });

  await RedisInstance.set(
    `unisat:address:rune:balance:${address}`,
    JSON.stringify(data.detail),
    "EX",
    60 * 2,
    "NX",
  );

  return data.detail;
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

  const data = await tryWithApiKey<{
    utxo: AddressRunesUTXOReq[];
    start: number;
    total: number;
  }>(network, `/v1/indexer/address/${address}/runes/${runeId}/utxo`, {
    start: 0,
    limit: 500,
  });

  const array = data.utxo.map((utxo) => ({
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
  const data = await tryWithApiKey<{
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
  }>(network, `/v1/indexer/address/${address}/utxo-data`, {
    cursor: 0,
    size: 1000,
  });

  return data.utxo;
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

  const data = await tryWithApiKey<{
    inscription: {
      utxo: {
        txid: string;
        vout: number;
        satoshi: number;
        isSpent: boolean;
      };
      inscriptionId: string;
    }[];
  }>(network, `/v1/indexer/address/${address}/inscription-data`, {
    cursor: 0,
    size: 1000,
  });

  const array = data.inscription.filter(
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
  const cache = await RedisInstance.get(
    `unisat:inscription:info:${inscriptionId}`,
  );

  if (cache) {
    return JSON.parse(cache);
  }

  const data = await tryWithApiKey<UnisatInscriptionInfoType | null>(
    network,
    `/v1/indexer/inscription/info/${inscriptionId}`,
  );

  if (!data) {
    throw new Error("Inscription not found");
  }

  await RedisInstance.set(
    `unisat:inscription:info:${inscriptionId}`,
    JSON.stringify(data),
    "EX",
    60 * 5,
    "NX",
  );

  return data;
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

  const data = await tryWithApiKey<{
    detail: {
      address: string;
      amount: string;
    }[];
  }>(network, `/v1/indexer/runes/${runeId}/holders`, {
    start: 0,
    limit: 50,
  });

  const array = data.detail;

  await RedisInstance.set(
    `unisat:rune:holders:${runeId}`,
    JSON.stringify(array),
    "EX",
    60 * 5,
    "NX",
  );

  return array;
};
