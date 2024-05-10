import useSWR from "swr";

import { getBtcPrice } from "../apis/mempool";

export const useBTCPrice = () => {
  const { data, isLoading, isValidating } = useSWR(
    "btc-price",
    async () => {
      const BTCPrice = await getBtcPrice();
      return BTCPrice;
    },
    {
      refreshInterval: 1000 * 10,
    },
  );

  return {
    BTCPrice: data || 0,
    BTCPriceLoading: isLoading,
    BTCPriceValidating: isValidating,
  };
};
