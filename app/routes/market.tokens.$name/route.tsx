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

import { Avatar, AvatarFallback } from "@/components/Avatar";
import Chart, { KlineResponseType } from "@/components/Chart";
import { Tabs, TabsList, TabsTrigger } from "@/components/Tabs";

import { MarketPageTokenResponseType } from "./types";

export const loader: LoaderFunction = async ({ params }) => {
  const { name } = params;

  if (!name) {
    throw new Response("Not found", { status: 404 });
  }

  const token = await DatabaseInstance.rune_token.findFirst({
    select: {
      rune_id: true,
      spaced_name: true,
      symbol: true,
      holders: true,
      divisibility: true,
      supply: true,
    },
    where: {
      name,
    },
  });

  if (!token) {
    throw new Response("Not found", { status: 404 });
  }

  const response: {
    token: MarketPageTokenResponseType;
    kline: KlineResponseType[];
  } = {
    token: {
      ...token,
      name,
      floor_price: "0",
      listings: 0,
      volume_24h: "0",
      volume_7d: "0",
      volume_total: "0",
      sales_24h: 0,
    },
    kline: [],
  };

  const [tokenCache, klineCache] = await Promise.all([
    RedisInstance.get(`tokens:state:${name}`),
    RedisInstance.get(`tokens:kline:${name}`),
  ]);

  if (tokenCache) {
    response.token = JSON.parse(tokenCache);
  } else {
    const [tokenOffersData, tokenOrdersData] =
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
          rune_name = ${name}
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
          rune_name = ${name}
        `,
      ]);

    if (tokenOffersData.length > 0) {
      response.token.floor_price = tokenOffersData[0].floor_price || "0";
      response.token.listings = parseInt(
        tokenOffersData[0].listings.toString(),
      );
    }

    if (tokenOrdersData.length > 0) {
      response.token.volume_24h = tokenOrdersData[0].volume_24h || "0";
      response.token.volume_7d = tokenOrdersData[0].volume_7d || "0";
      response.token.volume_total = tokenOrdersData[0].volume_total || "0";
      response.token.sales_24h = parseInt(
        tokenOrdersData[0].sales_24h.toString(),
      );
    }

    RedisInstance.set(
      `tokens:state:${name}`,
      JSON.stringify(response.token),
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
    WHERE rune_name = ${name}
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
        `tokens:kline:${name}`,
        JSON.stringify(formatKline),
        "EX",
        60 * 30,
      );
    }
  }

  return json({ data: response });
};

export default function MarketTokenPage() {
  const { data } = useLoaderData<{
    data: {
      token: MarketPageTokenResponseType;
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
          <AvatarFallback className="rounded-md bg-secondary text-xl">
            {data.token.symbol}
          </AvatarFallback>
        </Avatar>
        <div className="text-xl font-medium">{data.token.spaced_name}</div>
      </div>
      <div className="w-full overflow-hidden rounded-lg">
        <Chart kline={data.kline} />
      </div>
      <div className="flex w-full flex-wrap gap-4">
        <div className="flex grow flex-col items-center justify-center space-y-2 overflow-hidden rounded-lg bg-secondary px-4 py-3">
          <div className="font-medium text-secondary">{`Floor Price ( sats / ${data.token.symbol} )`}</div>
          <div className="text-sm">
            {formatNumber(parseFloat(data.token.floor_price), {
              precision: 4,
            })}
          </div>
        </div>
        <div className="flex grow flex-col items-center justify-center space-y-2 overflow-hidden rounded-lg bg-secondary px-4 py-3">
          <div className="font-medium text-secondary">Listings</div>
          <div className="text-sm">{formatNumber(data.token.listings)}</div>
        </div>
        <div className="flex grow flex-col items-center justify-center space-y-2 overflow-hidden rounded-lg bg-secondary px-4 py-3">
          <div className="font-medium text-secondary">Sales(24H)</div>
          <div className="text-sm">{formatNumber(data.token.sales_24h)}</div>
        </div>
        <div className="flex grow flex-col items-center justify-center space-y-2 overflow-hidden rounded-lg bg-secondary px-4 py-3">
          <div className="font-medium text-secondary">Market Cap</div>
          <div className="flex items-center space-x-2">
            <img
              className="h-4 w-4"
              src="/icons/btc.svg"
              alt="btc"
            />
            <div className="text-sm">
              {formatNumber(
                parseFloat(
                  satsToBTC(
                    parseFloat(data.token.floor_price) *
                      Number(
                        BigInt(data.token.supply) /
                          10n ** BigInt(data.token.divisibility),
                      ),
                    { digits: 8 },
                  ),
                ),
                {
                  precision: 2,
                },
              )}
            </div>
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
                  satsToBTC(parseFloat(data.token.volume_24h), { digits: 8 }),
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
                  satsToBTC(parseFloat(data.token.volume_7d), { digits: 8 }),
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
                  satsToBTC(parseFloat(data.token.volume_total), { digits: 8 }),
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
              navigate(`/market/tokens/${name}/listings`, {
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
              navigate(`/market/tokens/${name}/history`, {
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
