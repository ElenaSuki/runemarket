import { LoaderFunction, json } from "@remix-run/node";
import {
  Outlet,
  useLoaderData,
  useLocation,
  useNavigate,
} from "@remix-run/react";
import { useMemo } from "react";

import DatabaseInstance from "@/lib/server/prisma.server";
import RedisInstance from "@/lib/server/redis.server";
import { fillMissingData, formatNumber, satsToBTC } from "@/lib/utils";

import Chart, { KlineResponseType } from "@/components/Chart";
import { Tabs, TabsList, TabsTrigger } from "@/components/Tabs";

import { MarketPageAllTokenResponseType } from "./types";

export const loader: LoaderFunction = async () => {
  const response: {
    data: MarketPageAllTokenResponseType;
    kline: KlineResponseType[];
  } = {
    data: {
      floor_price: "0",
      listings: 0,
      volume_24h: "0",
      volume_7d: "0",
      volume_total: "0",
      sales_24h: 0,
    },
    kline: [],
  };

  const [dataCache, klineCache] = await Promise.all([
    RedisInstance.get(`alltokens:state`),
    RedisInstance.get(`alltokens:kline`),
  ]);

  if (dataCache) {
    response.data = JSON.parse(dataCache);
  } else {
    const [offersData, ordersData] = await DatabaseInstance.$transaction([
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
          inscription_id = ''
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
          is_token = 1
        `,
    ]);

    if (offersData.length > 0) {
      response.data.floor_price = offersData[0].floor_price || "0";
      response.data.listings = parseInt(offersData[0].listings.toString());
    }

    if (ordersData.length > 0) {
      response.data.volume_24h = ordersData[0].volume_24h || "0";
      response.data.volume_7d = ordersData[0].volume_7d || "0";
      response.data.volume_total = ordersData[0].volume_total || "0";
      response.data.sales_24h = parseInt(ordersData[0].sales_24h.toString());
    }

    RedisInstance.set(
      `alltokens:state`,
      JSON.stringify(response.data),
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
    WHERE is_token = 1
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
        `alltokens:kline`,
        JSON.stringify(formatKline),
        "EX",
        60 * 30,
      );
    }
  }

  return json({ data: response });
};

export default function MarketAllTokenPage() {
  const { data } = useLoaderData<{
    data: {
      data: MarketPageAllTokenResponseType;
      kline: KlineResponseType[];
    };
  }>();

  const navigate = useNavigate();

  const { pathname } = useLocation();

  const tabsValue = useMemo(() => {
    return pathname.split("/")[3] || "listings";
  }, [pathname]);

  return (
    <div className="w-full space-y-6">
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
                parseFloat(satsToBTC(parseFloat(data.data.floor_price))),
                {
                  precision: 8,
                },
              )}
            </div>
          </div>
        </div>
        <div className="flex grow flex-col items-center justify-center space-y-2 overflow-hidden rounded-lg bg-secondary px-4 py-3">
          <div className="font-medium text-secondary">Listings</div>
          <div className="text-sm">{formatNumber(data.data.listings)}</div>
        </div>

        <div className="flex grow flex-col items-center justify-center space-y-2 overflow-hidden rounded-lg bg-secondary px-4 py-3">
          <div className="font-medium text-secondary">Sales(24H)</div>
          <div className="text-sm">{formatNumber(data.data.sales_24h)}</div>
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
                  satsToBTC(parseFloat(data.data.volume_24h), {
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
                  satsToBTC(parseFloat(data.data.volume_7d), {
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
                  satsToBTC(parseFloat(data.data.volume_total), {
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
              navigate(`/market/all-token/listings`, {
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
              navigate(`/market/all-token/history`, {
                preventScrollReset: true,
              });
            }}
          >
            History
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Outlet />
    </div>
  );
}
