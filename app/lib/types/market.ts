import { z } from "zod";

export const OfferCreateReqSchema = z.object({
  bid: z.string().length(64),
  rune_id: z.string().min(1),
  rune_name: z.string().min(1),
  rune_spaced_name: z.string().min(1),
  symbol: z.string().min(1),
  unit_price: z.number().min(0),
  amount: z.number(),
  divisibility: z.number().int().min(0),
  total_price: z.bigint(),
  lister: z.string().min(1),
  funding_receiver: z.string().min(1),
  unsigned_psbt: z.string().min(1),
  psbt: z.string().min(1),
  status: z.number().int().min(0),
  location_txid: z.string().min(1),
  location_vout: z.number().int().min(0),
  location_value: z.number().int().min(0),
  collection_name: z.string().optional(),
  inscription_id: z.string().optional(),
  inscription_txid: z.string().optional(),
  inscription_vout: z.number().int().min(0).optional(),
});

export type OfferCreateReqSchemaType = z.infer<typeof OfferCreateReqSchema>;

export type RuneAssetMarketType = {
  runeId: string;
  name: string;
  spacedName: string;
  symbol: string;
  holders: number;
  listings: number;
  volume24h: string;
  volume7d: string;
  volumeTotal: string;
  sales24h: number;
  floorPrice: string;
  supply: string;
  divisibility: number;
};

export type RuneOfferType = {
  id: number;
  bid: string;
  spacedName: string;
  symbol: string;
  unitPrice: string;
  totalPrice: string;
  amount: number;
  unsignedPsbt: string;
  lister: string;
  txid: string;
  vout: number;
  runeId: string;
  divisibility: number;
  fundingReceiver: string;
  inscriptionId: string;
  inscriptionTxid?: string;
  inscriptionVout?: number;
};

export type RuneOrderType = {
  id: number;
  bid: string;
  runeId: string;
  spacedName: string;
  symbol: string;
  unitPrice: string;
  totalPrice: string;
  amount: number;
  lister: string;
  itemReceiver: string;
  txId: string;
  createAt: number;
};

export type RuneKlineType = {
  blockHour: number;
  avgPrice: string;
  volume: string;
};
