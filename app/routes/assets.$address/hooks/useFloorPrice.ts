import { useMemo } from "react";
import useSWR from "swr";

import AxiosInstance from "@/lib/axios";
import { useToast } from "@/lib/hooks/useToast";
import { getCollectionName } from "@/lib/utils";
import { formatError } from "@/lib/utils/error-helpers";

import { useStoreRuneAssets } from "./useFetchAddressBalance";

export const useFloorPrice = () => {
  const { waitSelectedRunes, type } = useStoreRuneAssets();
  const { toast } = useToast();

  const rune = useMemo(() => {
    return waitSelectedRunes[0];
  }, [waitSelectedRunes]);

  const { data } = useSWR(
    rune ? `floor-price-${rune.runeId}-${type}` : null,
    async () => {
      if (!rune) {
        return;
      }

      try {
        const { data } = await AxiosInstance.post<{
          code: number;
          error: boolean;
          data: {
            floorPrice: string;
            avgSalePrice: string;
          };
        }>("/api/floor-price", {
          rune_id: type === "token" ? rune.runeId : undefined,
          collection_name:
            type === "collection"
              ? getCollectionName(rune.spacedRune)
              : undefined,
          type,
        });

        if (data.error) {
          throw new Error(data.code.toString());
        }

        return data.data;
      } catch (e) {
        console.log(e);
        toast({
          duration: 3000,
          variant: "destructive",
          title: "Fetch floor price failed",
          description: formatError(e),
        });
      }
    },
    {
      refreshInterval: 1000 * 10,
    },
  );

  return {
    price: data,
  };
};
