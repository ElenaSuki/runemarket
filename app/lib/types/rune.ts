export type RuneListed = {
  unitPrice: string;
  fundingReceiver: string;
  totalPrice: string;
  id: number;
  inscriptionId: string;
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
  runeId: string;
  name: string;
  merged: boolean;
  rune: {
    txid: string;
    vout: number;
    value: number;
  };
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
