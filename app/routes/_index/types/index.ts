export type IndexPageTokenResponseType = {
  symbol: string;
  rune_id: string;
  name: string;
  spaced_name: string;
  etch_tx_hash: string;
  holders: number;
  divisibility: number;
  supply: string;
  listings: number;
  floor_price: string;
  volume_24h: string;
  sales_24h: number;
};

export type IndexPageCollectionResponseType = {
  symbol: string;
  name: string;
  display_name: string;
  listings: number;
  floor_price: string;
  volume_24h: string;
  sales_24h: number;
  icon: string;
  items_count: number;
  holders: number;
};
