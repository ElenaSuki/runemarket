export type RuneListed = {
  unitPrice: string;
  fundingReceiver: string;
  totalPrice: string;
  id: number;
};

export type AddressRuneAsset = {
  txid: string;
  vout: number;
  value: number;
  runes: {
    amount: string;
    runeId: string;
    rune: string;
    spacedRune: string;
    symbol: string;
    divisibility: number;
  }[];
};

export type ValidAddressRuneAsset = {
  txid: string;
  vout: number;
  value: number;
  amount: string;
  runeId: string;
  rune: string;
  spacedRune: string;
  symbol: string;
  divisibility: number;
  type: "token" | "nft";
  inscription?: {
    inscriptionId: string;
    txid: string;
    vout: number;
    value: number;
  };
};

export type ValidAddressRuneAssetWithList = ValidAddressRuneAsset & {
  listed?: RuneListed;
};
