import axios from "axios";
import { Network, networks } from "bitcoinjs-lib";

import { AddressRuneAsset } from "@/lib/types/rune";
import { sleep } from "@/lib/utils";

import {
  AddressRunesBalanceReq,
  AddressRunesUTXOReq,
  RunesInfoReq,
  UnisatInscriptionInfoType,
} from "./type";

const API_KEY =
  "e9917a0a1c8d959edd453c76d743aa10adf64c87d1ea06790c7b9fe430de75f7";

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
  const resp = await AxiosInstance.get<{
    code: number;
    message: string;
    data: RunesInfoReq | null;
  }>(`${BaseUrl(network)}/v1/indexer/runes/${runeId}/info`);

  return resp.data.data;
};

export const getRuneInfoList = async (network: Network, start: number) => {
  const resp = await AxiosInstance.get<{
    code: number;
    message: string;
    data: {
      total: number;
      detail: RunesInfoReq[];
    };
  }>(`${BaseUrl(network)}/v1/indexer/runes/info-list`, {
    params: {
      start,
      limit: 500,
    },
  });

  return resp.data.data.detail;
};

export const getAddressRuneUTXOs = async (
  network: Network,
  address: string,
  runeId: string,
): Promise<AddressRuneAsset[]> => {
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

  return resp.data.data.utxo.map((utxo) => ({
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
};

export const getAddressRuneBalanceList = async (
  network: Network,
  address: string,
) => {
  const resp = await AxiosInstance.get<{
    code: number;
    message: string;
    data: {
      start: number;
      total: number;
      detail: AddressRunesBalanceReq[];
    };
  }>(`${BaseUrl(network)}/v1/indexer/address/${address}/runes/balance-list`, {
    params: {
      start: 0,
      limit: 500,
    },
  });

  return resp.data.data.detail.map((rune) => ({
    runeId: rune.runeid,
    rune: rune.rune,
    symbol: rune.symbol,
    spacedRune: rune.spacedRune,
    amount: (BigInt(rune.amount) / 10n ** BigInt(rune.divisibility)).toString(),
    divisibility: rune.divisibility,
  }));
};

export const getAddressRunes = async (
  network: Network,
  address: string,
): Promise<AddressRuneAsset[]> => {
  const balance = await getAddressRuneBalanceList(network, address);

  const chunks: {
    runeId: string;
    rune: string;
    symbol: string;
    spacedRune: string;
    amount: string;
    divisibility: number;
  }[][] = [];

  for (let i = 0; i < balance.length; i += 5) {
    chunks.push(balance.slice(i, i + 5));
  }

  const utxos: AddressRuneAsset[] = [];

  for (const chunk of chunks) {
    const assets = await Promise.all(
      chunk.map((rune) => getAddressRuneUTXOs(network, address, rune.runeId)),
    );

    assets.flat().forEach((utxo) => {
      utxos.push(utxo);
    });

    await sleep(500);
  }

  return utxos;
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
) => {
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

  return resp.data.data.map((rune) => ({
    runeId: rune.runeid,
    rune: rune.rune,
    symbol: rune.symbol,
    spacedRune: rune.spacedRune,
    amount: rune.amount,
    divisibility: rune.divisibility,
  }));
};

export const getAddressInscriptions = async (
  network: Network,
  address: string,
) => {
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

  return resp.data.data.inscription.filter(
    (inscription) => !inscription.utxo.isSpent,
  );
};

export const getInscriptionInfo = async (
  network: Network,
  inscriptionId: string,
) => {
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

export const getRuneHolders = async (network: Network, runeId: string) => {
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

  return resp.data.data.detail;
};
