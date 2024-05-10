import { LoaderFunction, json } from "@remix-run/node";
import {
  Outlet,
  useLoaderData,
  useLocation,
  useNavigate,
  useParams,
} from "@remix-run/react";
import { useMemo } from "react";

import DatabaseInstance from "@/lib/server/prisma.server";
import RedisInstance from "@/lib/server/redis.server";
import { fillMissingData, formatNumber, satsToBTC } from "@/lib/utils";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/Avatar";
import Chart, { KlineResponseType } from "@/components/Chart";
import { Tabs, TabsList, TabsTrigger } from "@/components/Tabs";

import { MarketPageCollectionResponseType } from "./types";

export const loader: LoaderFunction = async ({ params }) => {
  const { name } = params;

  if (!name) {
    throw new Response("Not found", { status: 404 });
  }

  const collection = await DatabaseInstance.rune_collection.findFirst({
    select: {
      name: true,
      display_name: true,
      description: true,
      symbol: true,
      x_link: true,
    },
    where: {
      name,
    },
  });

  if (!collection) {
    throw new Response("Not found", { status: 404 });
  }

  const response: {
    collection: MarketPageCollectionResponseType;
    kline: KlineResponseType[];
  } = {
    collection: {
      ...collection,
      description: collection.description || "",
      x_link: collection.x_link || "",
      name,
      icon: "",
      floor_price: "0",
      listings: 0,
      volume_24h: "0",
      volume_7d: "0",
      volume_total: "0",
      sales_24h: 0,
      items_count: 0,
    },
    kline: [],
  };

  const [collectionCache, klineCache, collectionIconCache] = await Promise.all([
    RedisInstance.get(`collections:state:${name}`),
    RedisInstance.get(`collections:kline:${name}`),
    RedisInstance.get(`collections:icon:${name}`),
  ]);

  if (collectionIconCache) {
    response.collection.icon = collectionIconCache;
  }

  if (collectionCache) {
    response.collection = JSON.parse(collectionCache);
  } else {
    const [collectionOffersData, collectionOrdersData, validItems] =
      await DatabaseInstance.$transaction([
        DatabaseInstance.$queryRaw<
          {
            floor_price: string;
            listings: bigint;
          }[]
        >`
        SELECT
          MIN(unit_price) AS floor_price,
          COUNT(*) AS listings
        FROM
          offers
        WHERE
          status = 1
        AND
          collection_name = ${name}
        `,
        DatabaseInstance.$queryRaw<
          {
            volume_24h: string;
            volume_7d: string;
            volume_total: string;
            sales_24h: bigint;
          }[]
        >`
        SELECT
          SUM(CASE WHEN create_at >= UNIX_TIMESTAMP(NOW() - INTERVAL 24 HOUR) THEN total_price ELSE 0 END) AS volume_24h,
          SUM(CASE WHEN create_at >= UNIX_TIMESTAMP(NOW() - INTERVAL 7 DAY) THEN total_price ELSE 0 END) AS volume_7d,
          SUM(total_price) AS volume_total,
          COUNT(CASE WHEN create_at >= UNIX_TIMESTAMP(NOW() - INTERVAL 24 HOUR) THEN 1 ELSE NULL END) AS sales_24h
        FROM
          orders
        WHERE
          collection_name = ${name}
        `,
        DatabaseInstance.$queryRaw<
          {
            items_count: bigint;
          }[]
        >`
        SELECT
          COUNT(*) AS items_count
        FROM
          rune_collection_item
        WHERE
          valid = 1
        AND
          collection_name = ${name}
        `,
      ]);

    if (collectionOffersData.length > 0) {
      response.collection.floor_price =
        collectionOffersData[0].floor_price || "0";
      response.collection.listings = parseInt(
        collectionOffersData[0].listings.toString(),
      );
    }

    if (collectionOrdersData.length > 0) {
      response.collection.volume_24h =
        collectionOrdersData[0].volume_24h || "0";
      response.collection.volume_7d = collectionOrdersData[0].volume_7d || "0";
      response.collection.volume_total =
        collectionOrdersData[0].volume_total || "0";
      response.collection.sales_24h = parseInt(
        collectionOrdersData[0].sales_24h.toString(),
      );
    }

    if (validItems.length > 0) {
      response.collection.items_count = parseInt(
        validItems[0].items_count.toString(),
      );
    }

    RedisInstance.set(
      `collections:state:${name}`,
      JSON.stringify(response.collection),
      "EX",
      60 * 1,
    );
  }

  if (klineCache) {
    response.kline = JSON.parse(klineCache);
  } else {
    const kline = await DatabaseInstance.$queryRaw<
      {
        block_hour: string;
        avg_price: number;
        volume: string;
      }[]
    >`
    SELECT
      DATE_FORMAT(FROM_UNIXTIME(create_at), '%Y-%m-%d %H:00:00') AS block_hour,
      ROUND(AVG(unit_price), 6) AS avg_price,
      SUM(total_price) AS volume
    FROM orders
    WHERE collection_name = ${name}
    GROUP BY 1
    ORDER BY 1 ASC
    `;

    if (kline.length > 0) {
      const filledKline = fillMissingData(kline);

      const formatKline = filledKline.map((d) => ({
        block_hour: d.block_hour,
        avg_price: d.avg_price.toString(),
        volume: d.volume,
      }));

      response.kline = formatKline;

      RedisInstance.set(
        `collections:kline:${name}`,
        JSON.stringify(formatKline),
        "EX",
        60 * 30,
      );
    }
  }

  return json({ data: response });
};

export default function MarketCollectionPage() {
  const { data } = useLoaderData<{
    data: {
      collection: MarketPageCollectionResponseType;
      kline: KlineResponseType[];
    };
  }>();

  const { name } = useParams();

  const navigate = useNavigate();

  const { pathname } = useLocation();

  const tabsValue = useMemo(() => {
    return pathname.split("/")[4] || "listings";
  }, [pathname]);

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center space-x-4">
        <Avatar className="h-12 w-12 rounded-md">
          <AvatarImage
            src={data.collection.icon}
            alt={data.collection.display_name}
          />
          <AvatarFallback className="rounded-md bg-secondary text-xl">
            {data.collection.symbol}
          </AvatarFallback>
        </Avatar>
        <div className="text-xl font-medium">
          {data.collection.display_name}
        </div>
        {data.collection.x_link && (
          <a
            href={data.collection.x_link}
            target="_blank"
            className="rounded-lg bg-secondary p-1.5 transition-opacity hover:opacity-75"
          >
            <img
              className="h-5 w-5"
              src="/icons/twitter.svg"
              alt="twitter"
            />
          </a>
        )}
      </div>
      <div className="w-full text-sm">{data.collection.description}</div>
      <div className="w-full overflow-hidden rounded-lg">
        <Chart kline={data.kline} />
      </div>
      <div className="flex w-full flex-wrap gap-4">
        <div className="flex grow flex-col items-center justify-center space-y-2 overflow-hidden rounded-lg bg-secondary px-4 py-3">
          <div className="font-medium text-secondary">Floor Price</div>
          <div className="flex items-center space-x-2">
            <img
              className="h-4 w-4"
              src="/icons/btc.svg"
              alt="btc"
            />
            <div className="text-sm">
              {formatNumber(
                parseFloat(satsToBTC(parseFloat(data.collection.floor_price))),
                {
                  precision: 8,
                },
              )}
            </div>
          </div>
        </div>
        <div className="flex grow flex-col items-center justify-center space-y-2 overflow-hidden rounded-lg bg-secondary px-4 py-3">
          <div className="font-medium text-secondary">Items</div>
          <div className="text-sm">
            {formatNumber(data.collection.items_count)}
          </div>
        </div>
        <div className="flex grow flex-col items-center justify-center space-y-2 overflow-hidden rounded-lg bg-secondary px-4 py-3">
          <div className="font-medium text-secondary">Listings</div>
          <div className="text-sm">
            {formatNumber(data.collection.listings)}
          </div>
        </div>

        <div className="flex grow flex-col items-center justify-center space-y-2 overflow-hidden rounded-lg bg-secondary px-4 py-3">
          <div className="font-medium text-secondary">Sales(24H)</div>
          <div className="text-sm">
            {formatNumber(data.collection.sales_24h)}
          </div>
        </div>

        <div className="flex grow flex-col items-center justify-center space-y-2 overflow-hidden rounded-lg bg-secondary px-4 py-3">
          <div className="font-medium text-secondary">Volume(24H)</div>
          <div className="flex items-center space-x-2">
            <img
              className="h-4 w-4"
              src="/icons/btc.svg"
              alt="btc"
            />
            <div className="text-sm">
              {formatNumber(
                parseFloat(
                  satsToBTC(parseFloat(data.collection.volume_24h), {
                    digits: 8,
                  }),
                ),
                {
                  precision: 6,
                },
              )}
            </div>
          </div>
        </div>
        <div className="flex grow flex-col items-center justify-center space-y-2 overflow-hidden rounded-lg bg-secondary px-4 py-3">
          <div className="font-medium text-secondary">Volume(7D)</div>
          <div className="flex items-center space-x-2">
            <img
              className="h-4 w-4"
              src="/icons/btc.svg"
              alt="btc"
            />
            <div className="text-sm">
              {formatNumber(
                parseFloat(
                  satsToBTC(parseFloat(data.collection.volume_7d), {
                    digits: 8,
                  }),
                ),
                {
                  precision: 6,
                },
              )}
            </div>
          </div>
        </div>
        <div className="flex grow flex-col items-center justify-center space-y-2 overflow-hidden rounded-lg bg-secondary px-4 py-3">
          <div className="font-medium text-secondary">Volume Total</div>
          <div className="flex items-center space-x-2">
            <img
              className="h-4 w-4"
              src="/icons/btc.svg"
              alt="btc"
            />
            <div className="text-sm">
              {formatNumber(
                parseFloat(
                  satsToBTC(parseFloat(data.collection.volume_total), {
                    digits: 8,
                  }),
                ),
                {
                  precision: 6,
                },
              )}
            </div>
          </div>
        </div>
      </div>
      <Tabs
        className="w-full border-b"
        value={tabsValue}
      >
        <TabsList>
          <TabsTrigger
            className="h-10 data-[state=active]:border-b data-[state=active]:border-theme data-[state=active]:text-theme"
            value="listings"
            onClick={() => {
              navigate(`/market/collections/${name}/listings`, {
                preventScrollReset: true,
              });
            }}
          >
            Listings
          </TabsTrigger>
          <TabsTrigger
            className="h-10 data-[state=active]:border-b data-[state=active]:border-theme data-[state=active]:text-theme"
            value="history"
            onClick={() => {
              navigate(`/market/collections/${name}/history`, {
                preventScrollReset: true,
              });
            }}
          >
            History
          </TabsTrigger>
          <TabsTrigger
            className="h-10 data-[state=active]:border-b data-[state=active]:border-theme data-[state=active]:text-theme"
            value="items"
            onClick={() => {
              navigate(`/market/collections/${name}/items`, {
                preventScrollReset: true,
              });
            }}
          >
            Items
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Outlet />
    </div>
  );
}
