export type RunesInfoReq = {
  runeid: string;
  rune: string;
  spacedRune: string;
  number: number;
  height: number;
  txidx: number;
  timestamp?: number;
  divisibility: number;
  symbol: string;
  etching: string;
  premine: string;
  terms?: {
    amount: string;
    cap: string;
    heightStart?: number;
    heightEnd?: number;
    offsetStart?: number;
    offsetEnd?: number;
  };
  mints: string;
  burned: string;
  holders: number;
  transactions: number;
  supply: string;
  start?: number;
  end?: number;
  mintable: boolean;
  remaining: string;
};

export type AddressRunesBalanceReq = {
  rune: string;
  runeid: string;
  spacedRune: string;
  amount: string;
  symbol: string;
  divisibility: number;
};

export type AddressRunesUTXOReq = {
  address: string;
  satoshi: number;
  scriptPk: string;
  txid: string;
  vout: number;
  runes: {
    rune: string;
    runeid: string;
    spacedRune: string;
    amount: string;
    symbol: string;
    divisibility: number;
  }[];
};

export type UnisatInscriptionInfoType = {
  utxo: {
    txid: string;
    vout: number;
    satoshi: number;
  };
  contentType: string;
  address: string;
  inscriptionNumber: number;
};
