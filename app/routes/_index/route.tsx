import { LoaderFunction, json } from "@remix-run/node";
import { useLoaderData, useNavigation } from "@remix-run/react";
import { useMemo, useState } from "react";

import { useSetSearch } from "@/lib/hooks/useSetSearch";
import DatabaseInstance from "@/lib/server/prisma.server";
import RedisInstance from "@/lib/server/redis.server";

import { Input } from "@/components/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select";

import CollectionsTable from "./components/CollectionsTable";
import {
  IndexPageCollectionResponseType,
  IndexPageTokenResponseType,
} from "./types";

export const loader: LoaderFunction = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const searchParams = url.searchParams;

    const sort = searchParams.get("sort") || "volume";

    const response: {
      tokens: IndexPageTokenResponseType[];
      collections: IndexPageCollectionResponseType[];
    } = {
      tokens: [],
      collections: [],
    };

    const cache = await RedisInstance.get("collections:state");

    if (cache) {
      response.collections.push(
        ...JSON.parse(cache).sort(
          (
            a: IndexPageCollectionResponseType,
            b: IndexPageCollectionResponseType,
          ) => {
            if (sort === "volume") {
              return BigInt(b.volume_24h) - BigInt(a.volume_24h) >= 0 ? 1 : -1;
            } else if (sort === "transactions") {
              return b.sales_24h - a.sales_24h;
            } else if (sort === "listings") {
              return b.listings - a.listings;
            } else {
              return 0;
            }
          },
        ),
      );

      return json({
        error: null,
        data: response,
      });
    }

    const [
      collections,
      validItems,
      collectionOffersData,
      collectionOrdersData,
    ] = await DatabaseInstance.$transaction([
      DatabaseInstance.rune_collection.findMany({
        select: {
          name: true,
          display_name: true,
          symbol: true,
        },
      }),
      DatabaseInstance.$queryRaw<
        {
          collection_name: string;
          items_count: bigint;
        }[]
      >`
          SELECT
            collection_name,
            COUNT(*) AS items_count
          FROM
            rune_collection_item
          WHERE
            valid = 1
          GROUP BY
            collection_name
        `,
      DatabaseInstance.$queryRaw<
        {
          collection_name: string;
          listings: bigint;
          floor_price: number;
        }[]
      >`
          SELECT
            collection_name,
            COUNT(*) AS listings,
            MIN(unit_price) AS floor_price
          FROM
            offers
          WHERE
            status = 1
          AND
            collection_name IS NOT NULL
          GROUP BY
            collection_name
        `,
      DatabaseInstance.$queryRaw<
        {
          collection_name: string;
          volume_24h: string;
          sales_24h: bigint;
        }[]
      >`
          SELECT
            collection_name,
            SUM(CASE WHEN create_at >= UNIX_TIMESTAMP(NOW() - INTERVAL 24 HOUR) THEN total_price ELSE 0 END) AS volume_24h,
            COUNT(CASE WHEN create_at >= UNIX_TIMESTAMP(NOW() - INTERVAL 24 HOUR) THEN 1 ELSE NULL END) AS sales_24h
          FROM
            orders
          WHERE
            collection_name IS NOT NULL
          GROUP BY
            collection_name
        `,
    ]);

    for (const collection of collections) {
      const collectionOffer = collectionOffersData.find(
        (offer) => offer.collection_name === collection.name,
      );
      const collectionOrder = collectionOrdersData.find(
        (order) => order.collection_name === collection.name,
      );

      const validItemsCount = validItems.find(
        (item) => item.collection_name === collection.name,
      )?.items_count;

      const icon = await RedisInstance.get(
        `collections:icon:${collection.name}`,
      );

      response.collections.push({
        ...collection,
        floor_price: collectionOffer?.floor_price?.toString() || "0",
        listings: collectionOffer?.listings
          ? parseInt(collectionOffer.listings.toString())
          : 0,
        volume_24h: collectionOrder?.volume_24h || "0",
        sales_24h: collectionOrder?.sales_24h
          ? parseInt(collectionOrder.sales_24h.toString())
          : 0,
        icon: icon || "",
        items_count: validItemsCount ? parseInt(validItemsCount.toString()) : 0,
      });
    }

    RedisInstance.set(
      "collections:state",
      JSON.stringify(response.collections),
      "EX",
      60 * 1,
    );

    response.collections.sort(
      (
        a: IndexPageCollectionResponseType,
        b: IndexPageCollectionResponseType,
      ) => {
        if (sort === "volume") {
          return BigInt(b.volume_24h) - BigInt(a.volume_24h) >= 0 ? 1 : -1;
        } else if (sort === "transactions") {
          return b.sales_24h - a.sales_24h;
        } else if (sort === "listings") {
          return b.listings - a.listings;
        } else {
          return 0;
        }
      },
    );

    return json({
      error: null,
      data: response,
    });
  } catch (e) {
    console.log(e);
    return json({
      error: "Internal Server Error",
      data: {
        tokens: [],
        collections: [],
      },
    });
  }
};

export default function IndexPage() {
  const { error, data } = useLoaderData<{
    error: string | null;
    data: {
      tokens: IndexPageTokenResponseType[];
      collections: IndexPageCollectionResponseType[];
    };
  }>();

  const { state } = useNavigation();
  const { searchParams, updateSearchParams } = useSetSearch();

  const [filters, setFilters] = useState("");

  const query = useMemo(() => {
    return {
      sort: searchParams.get("sort") || "volume",
    };
  }, [searchParams]);

  if (error) {
    return (
      <div className="flex h-80 w-full items-center justify-center text-xl">
        {error}
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex w-full space-x-4">
        <div className="w-full">
          <Input
            className="bg-primary transition-colors focus:bg-secondary"
            disabled={state === "loading"}
            value={filters}
            onChange={(e) => setFilters(e.target.value)}
            placeholder="Search by name"
          />
        </div>
        <Select
          value={query.sort}
          disabled={state === "loading"}
          onValueChange={(value) =>
            updateSearchParams(
              { sort: value, page: 1 },
              {
                action: "push",
                scroll: false,
              },
            )
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="volume">Volume</SelectItem>
            <SelectItem value="transactions">Transactions</SelectItem>
            <SelectItem value="listings">Listings</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <CollectionsTable
        collections={data.collections}
        filters={filters}
      />
    </div>
  );
}
