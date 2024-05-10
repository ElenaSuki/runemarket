import { useParams } from "@remix-run/react";
import { useMemo } from "react";
import useSWR from "swr";

import AxiosInstance from "@/lib/axios";
import { useSetSearch } from "@/lib/hooks/useSetSearch";
import { useToast } from "@/lib/hooks/useToast";
import { RuneOfferType } from "@/lib/types/market";
import { formatError } from "@/lib/utils/error-helpers";

export const useFetchOffer = (type: "token" | "collection") => {
  const { name } = useParams();
  const { searchParams } = useSetSearch();
  const { toast } = useToast();

  const page = parseInt(searchParams.get("page") || "1") || 1;
  const sort = searchParams.get("sort") || "price_asc";
  const filters = searchParams.get("filters") || "";

  const key = useMemo(
    () =>
      filters
        ? `${type}-${name}-${page}-${sort}-${filters}`
        : `${type}-${name}-${page}-${sort}`,
    [type, name, page, sort, filters],
  );

  const { data, isLoading, isValidating, mutate } = useSWR(
    key,
    async () => {
      try {
        const { data: offers } = await AxiosInstance.post<{
          code: number;
          error: boolean;
          data: {
            count: number;
            offers: RuneOfferType[];
          };
        }>("/api/offer/get", {
          rune: type === "token" ? name : undefined,
          collection: type === "collection" ? name : undefined,
          filters,
          type,
          order: sort.replace("_", ":"),
          limit: 30,
          offset: (page - 1) * 30,
        });

        if (offers.error) {
          throw new Error(offers.code.toString());
        }

        return offers.data;
      } catch (e) {
        console.log(e);
        toast({
          variant: "destructive",
          duration: 3000,
          title: "Fetch offers failed",
          description: formatError(e),
        });
      }
    },
    {
      refreshInterval: 1000 * 5,
    },
  );

  return {
    offers: data,
    offersLoading: isLoading,
    offersValidating: isValidating,
    refreshOffers: mutate,
  };
};
