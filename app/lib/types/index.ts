import { Network } from "bitcoinjs-lib";

export type UTXO = {
  txid: string;
  vout: number;
  value: number;
};

export type AccountInfo = {
  address: string;
  network: Network;
  type: string;
  pubkey: Buffer;
  script: Buffer;
};
