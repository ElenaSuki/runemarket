export type RuneStone = {
  edicts?: Edict[];
  etching?: Etching;
  mint?: RuneId;
  pointer?: number;
};

export type Etching = {
  divisibility?: number;
  premine?: number;
  rune?: string;
  spacers?: number;
  symbol?: string;
  terms?: Terms;
  turbo?: boolean;
};

export type Terms = {
  amount?: number;
  cap?: number;
  height?: number[];
  offset?: number[];
};

export type RuneId = {
  block: number;
  tx: number;
};

export type Edict = {
  id: RuneId;
  amount: bigint;
  output: number;
};
