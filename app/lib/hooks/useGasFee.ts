import { networks } from "bitcoinjs-lib";
import useSWR from "swr";

import { getRecommendedFees } from "../apis/mempool";

export const useGasFee = () => {
  const { data, mutate } = useSWR(
    "gas-fee",
    async () => {
      const gasFee = await getRecommendedFees(networks.bitcoin);

      return gasFee;
    },
    { refreshInterval: 1000 * 10 },
  );

  return {
    gasFee: data,
    refreshGasFee: mutate,
  };
};
