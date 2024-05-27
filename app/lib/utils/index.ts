import { Network } from "bitcoinjs-lib";
import { type ClassValue, clsx } from "clsx";
import dayjs from "dayjs";
import { twMerge } from "tailwind-merge";

import { getTransaction, getTransactionsOutspent } from "../apis/mempool";

export const cn = (...inputs: ClassValue[]) => {
  return twMerge(clsx(inputs));
};

export const formatAddress = (address: string, digist = 4) => {
  return `${address.slice(0, digist)}...${address.slice(-digist)}`;
};

export const sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const satsToBTC = (
  sats: number,
  options?: { digits?: number; keepTrailingZeros?: boolean },
) => {
  const { digits = 8, keepTrailingZeros = false } = options || {};
  const result = (sats / 10 ** 8).toFixed(digits);
  return keepTrailingZeros ? result : parseFloat(result).toString();
};

export const formatNumber = (
  value: number,
  options?: { precision?: number },
): string => {
  const { precision = 2 } = options || {};

  let formatted = value.toFixed(precision);
  formatted = parseFloat(formatted).toString();

  const [integerPart, decimalPart] = formatted.split(".");
  const integerFormatted = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return decimalPart ? `${integerFormatted}.${decimalPart}` : integerFormatted;
};

export const getFileExtension = (filename: string) => {
  const reversedFilename = filename.split("").reverse().join("");

  const extension = reversedFilename.substring(
    0,
    reversedFilename.indexOf("."),
  );

  return extension.split("").reverse().join("");
};

export const readFile = (file: File) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result);
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

export const basename = (path: string) => {
  return path.split("/").reverse()[0];
};

export const readableBytes = (bytes: number, decimals?: number) => {
  if (bytes == 0) return "0 Bytes";
  const k = 1024,
    dm = decimals || 2,
    sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"],
    i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};

export const calculateTotalFee = async (
  network: Network,
  txid: string,
  initialFee: number = 0,
): Promise<number> => {
  let totalFee = initialFee;

  const transaction = await getTransaction(txid, network);

  if (!transaction) return totalFee;

  totalFee += transaction.fee;

  const outspends = await getTransactionsOutspent(network, txid);

  for (const outspend of outspends) {
    if (!outspend.spent || outspend.status.confirmed) continue;

    await sleep(300);
    totalFee = await calculateTotalFee(network, outspend.txid, totalFee);
  }

  return totalFee;
};

export const fillMissingData = (
  data: {
    block_hour: string;
    avg_price: number;
    volume: string;
  }[],
) => {
  const filledData: {
    block_hour: string;
    avg_price: number;
    volume: string;
  }[] = [];
  const oneHour = 60 * 60;

  for (let i = 0; i < data.length; i++) {
    filledData.push(data[i]);

    if (i < data.length - 1) {
      const currentDataBlockHour = dayjs.utc(data[i].block_hour).unix();
      const nextDataBlockHour = dayjs.utc(data[i + 1].block_hour).unix();
      let timestampToFill = currentDataBlockHour + oneHour;
      while (timestampToFill < nextDataBlockHour) {
        filledData.push({
          block_hour: dayjs
            .unix(timestampToFill)
            .utc()
            .format("YYYY-MM-DD HH:mm:ss"),
          avg_price: data[i].avg_price,
          volume: "0",
        });
        timestampToFill += oneHour;
      }
    }
  }

  const currentBlockHour = dayjs.utc().startOf("hour").unix();
  let timestampToFill =
    filledData.length > 0
      ? dayjs.utc(filledData[filledData.length - 1].block_hour).unix() + oneHour
      : currentBlockHour;
  while (timestampToFill <= currentBlockHour) {
    filledData.push({
      block_hour: dayjs
        .unix(timestampToFill)
        .utc()
        .format("YYYY-MM-DD HH:mm:ss"),
      avg_price: filledData[filledData.length - 1].avg_price || 0,
      volume: "0",
    });
    timestampToFill += oneHour;
  }
  return filledData;
};

export const getCollectionName = (fullName: string) => {
  if (fullName.includes("SWOGZ")) {
    const match = fullName.split("•")[1] === "SWOGZ";
    if (match) {
      return "SWOGZ";
    }
  }

  return fullName.split("•")[0];
};

export const getNonBundlesCollectionName = (fullName: string) => {
  const map = {
    "BIRD•": "TOKEN_BIRD",
    "MONKE•": "TOKEN_MONKE",
    "BLOK•BLOK•BLOK•": "TOKEN_BLOK",
    "RUNE•BULL•": "TOKEN_BULL",
    "BITCOIN•RUNE•MAP•": "TOKEN_RUNE_MAP",
    "BITCOIN•SWOGZ•": "TOKEN_SWOGZ",
    "PUPPET•": "TOKEN_PUPPET",
    "PUNK•": "TOKEN_PUNK",
    "SIDS•LOGOS•": "TOKEN_SIDS_LOGOS",
    "RUNEX•UNNAMED•": "TOKEN_RUNEX_UNNAMED",
    "BLOCKPEPE•RUNES•": "TOKEN_BLOCKPEPE",
    "ENIGMA•": "TOKEN_ENIGMA",
  };

  for (const key in map) {
    if (fullName.startsWith(key)) {
      return map[key as keyof typeof map];
    }
  }

  return "";
};
