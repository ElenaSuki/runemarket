import { LoaderFunction, json } from "@remix-run/node";
import { useLoaderData, useParams } from "@remix-run/react";
import { useDebounce } from "@uidotdev/usehooks";
import { useEffect, useMemo, useState } from "react";

import { useSetSearch } from "@/lib/hooks/useSetSearch";
import DatabaseInstance from "@/lib/server/prisma.server";

import EmptyTip from "@/components/EmptyTip";
import GridList from "@/components/GridList";
import { Input } from "@/components/Input";
import Pagination from "@/components/Pagination";

import { MarketPageCollectionItemsResponseType } from "./types";

export const loader: LoaderFunction = async ({ params, request }) => {
  const { name } = params;

  if (!name) {
    throw new Response("Not Found", { status: 404 });
  }

  const url = new URL(request.url);
  const searchParams = url.searchParams;

  const page = parseInt(searchParams.get("page") || "1") || 1;
  const filters = searchParams.get("filters") || "";

  const [collectionItems, count] = await DatabaseInstance.$transaction([
    DatabaseInstance.rune_collection_item.findMany({
      select: {
        id: true,
        rune_id: true,
        rune_name: true,
        rune_spaced_name: true,
        etch_tx_hash: true,
      },
      where: {
        valid: 1,
        collection_name: name,
        rune_spaced_name: filters
          ? {
              contains: filters.toUpperCase(),
            }
          : undefined,
      },
      orderBy: [
        {
          id: "asc",
        },
      ],
      skip: (page - 1) * 30,
      take: 30,
    }),
    DatabaseInstance.rune_collection_item.count({
      where: {
        valid: 1,
        collection_name: name,
        rune_spaced_name: filters
          ? {
              contains: filters.toUpperCase(),
            }
          : undefined,
      },
    }),
  ]);

  const response: {
    data: MarketPageCollectionItemsResponseType[];
    count: number;
  } = {
    data: collectionItems.map((item) => ({
      ...item,
    })),
    count,
  };

  return json({
    data: response,
  });
};

export default function MarketCollectionItemsPage() {
  const { name } = useParams();
  const { data } = useLoaderData<{
    data: {
      data: MarketPageCollectionItemsResponseType[];
      count: number;
    };
  }>();

  const { searchParams, updateSearchParams } = useSetSearch();

  const [filters, setFilters] = useState("");

  const debouncedFilters = useDebounce(filters, 600);

  const page = useMemo(() => {
    return parseInt(searchParams.get("page") || "1") || 1;
  }, [searchParams]);

  const totalPage = useMemo(() => {
    return Math.ceil(data.count / 30);
  }, [data]);

  useEffect(() => {
    updateSearchParams(
      {
        filters: debouncedFilters,
        page: 1,
      },
      {
        action: "push",
        scroll: false,
      },
    );
  }, [debouncedFilters]);

  return (
    <div className="space-y-6">
      <Input
        className="bg-primary transition-colors focus:bg-secondary"
        placeholder="Search by item name"
        value={filters}
        onChange={(e) => setFilters(e.target.value)}
      />
      {data.data.length > 0 ? (
        <GridList>
          {data.data.map((item) => (
            <div
              className="w-full overflow-hidden rounded-lg border border-transparent bg-secondary transition-colors hover:border-theme"
              key={`${item.etch_tx_hash}`}
            >
              <div className="relative flex aspect-square w-full items-center justify-center">
                <img
                  loading="lazy"
                  className="h-full w-full"
                  src={`https://ordin.s3.amazonaws.com/inscriptions/${item.etch_tx_hash}i0`}
                  alt={item.rune_spaced_name}
                />
              </div>
              <div className="w-full space-y-4 bg-card p-2">
                <div className="w-full space-y-1.5">
                  <div className="flex w-full items-center justify-between space-x-2">
                    <div className="text-lg font-medium">{name}</div>
                    <div className="text-sm text-secondary">{`# ${item.rune_id}`}</div>
                  </div>
                  <a
                    target="_blank"
                    href={`/rune/${item.rune_id}`}
                    className="block w-full truncate break-all text-sm text-primary transition-colors hover:text-theme"
                  >
                    {item.rune_spaced_name}
                  </a>
                </div>
              </div>
            </div>
          ))}
        </GridList>
      ) : (
        <div className="w-full">
          <EmptyTip text="No items found" />
        </div>
      )}

      <Pagination
        page={page}
        total={totalPage}
        onPageChange={(page) =>
          updateSearchParams(
            { page },
            {
              action: "push",
              scroll: false,
            },
          )
        }
      />
    </div>
  );
}
