import { LoaderFunction, json } from "@remix-run/node";
import { useLoaderData, useNavigation } from "@remix-run/react";
import dayjs from "dayjs";
import { useMemo } from "react";

import { useBTCPrice } from "@/lib/hooks/useBTCPrice";
import { useSetSearch } from "@/lib/hooks/useSetSearch";
import DatabaseInstance from "@/lib/server/prisma.server";
import { cn, formatAddress, formatNumber, satsToBTC } from "@/lib/utils";

import EmptyTip from "@/components/EmptyTip";
import Pagination from "@/components/Pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/Table";

import { MarketPageTokenHistoryResponseType } from "./types";

const SkeletonArray: number[] = new Array(10).fill(0);

export const loader: LoaderFunction = async ({ params, request }) => {
  const { name } = params;

  if (!name) {
    throw new Response("Not Found", { status: 404 });
  }

  const url = new URL(request.url);
  const searchParams = url.searchParams;

  const page = parseInt(searchParams.get("page") || "1") || 1;

  const [history, count] = await DatabaseInstance.$transaction([
    DatabaseInstance.activities.findMany({
      select: {
        id: true,
        rune_id: true,
        rune_spaced_name: true,
        item_lister: true,
        item_receiver: true,
        symbol: true,
        amount: true,
        unit_price: true,
        total_price: true,
        type: true,
        tx_id: true,
        timestamp: true,
      },
      where: {
        rune_name: name,
      },
      take: 30,
      skip: (page - 1) * 30,
      orderBy: [
        {
          id: "desc",
        },
      ],
    }),
    DatabaseInstance.activities.count({
      where: {
        rune_name: name,
      },
    }),
  ]);

  const response: {
    data: MarketPageTokenHistoryResponseType[];
    count: number;
  } = {
    data: history.map((item) => ({
      ...item,
      rune_name: name,
      item_receiver: item.item_receiver || "",
      tx_id: item.tx_id || "",
      total_price: item.total_price.toString(),
      unit_price: item.unit_price.toString(),
    })),
    count,
  };

  return json({
    data: response,
  });
};

export default function MarketTokenHistoryPage() {
  const { data } = useLoaderData<{
    data: {
      data: MarketPageTokenHistoryResponseType[];
      count: number;
    };
  }>();

  // const { state } = useNavigation();

  // if (state === "loading") return <Skeleton />;

  return (
    <OrdersTable
      history={data.data}
      count={data.count}
    />
  );
}

const OrdersTable: React.FC<{
  history: MarketPageTokenHistoryResponseType[];
  count: number;
}> = ({ history, count }) => {
  const { searchParams, updateSearchParams } = useSetSearch();
  const { BTCPrice } = useBTCPrice();

  const page = useMemo(
    () => parseInt(searchParams.get("page") || "1") || 1,
    [searchParams],
  );

  const total = useMemo(() => (count > 0 ? Math.ceil(count / 30) : 1), [count]);

  return (
    <div className="w-full space-y-4">
      {history.length === 0 ? (
        <EmptyTip text="No history" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary">
                <TableHead>
                  <div className="flex items-center space-x-2">
                    <div>Content</div>
                  </div>
                </TableHead>
                <TableHead>
                  <div className="flex items-center space-x-2">
                    <div>Type</div>
                  </div>
                </TableHead>
                <TableHead>
                  <div className="flex items-center space-x-2">
                    <div>Price</div>
                  </div>
                </TableHead>
                <TableHead>
                  <div className="flex items-center space-x-2">
                    <div>From</div>
                  </div>
                </TableHead>
                <TableHead>
                  <div className="flex items-center space-x-2">
                    <div>To</div>
                  </div>
                </TableHead>
                <TableHead>
                  <div className="flex items-center space-x-2">
                    <div>Time</div>
                  </div>
                </TableHead>
                <TableHead>
                  <div className="flex items-center space-x-2">
                    <div>Tx</div>
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="min-w-[130px]">
                    <div className="flex flex-col justify-center space-y-1">
                      <div className="font-bold">
                        {formatNumber(item.amount)}
                      </div>
                      <div className="flex items-center space-x-1">
                        <div className="text-sm text-theme">
                          {`${formatNumber(parseFloat(item.unit_price))} sats`}
                        </div>
                        <div className="text-sm">/</div>
                        <div className="text-sm">{item.symbol}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[100px]">
                    <div
                      className={cn("inline-flex rounded-lg px-2 py-1", {
                        "bg-green-500/25 text-green-500": item.type === "list",
                        "bg-red-500/25 text-red-500": item.type === "unlist",
                        "bg-blue-500/25 text-blue-500": item.type === "buy",
                      })}
                    >
                      <div className="text-base">{item.type.toUpperCase()}</div>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[120px]">
                    <div className="flex flex-col justify-center space-y-1 text-base">
                      <div className="flex items-center space-x-2">
                        <img
                          className="h-4 w-4"
                          src="/icons/btc.svg"
                          alt="BTC"
                        />
                        <div>{satsToBTC(parseInt(item.total_price))}</div>
                      </div>
                      <div className="text-sm text-secondary">
                        {BTCPrice
                          ? `$ ${formatNumber(BTCPrice * parseFloat(satsToBTC(parseInt(item.total_price))))}`
                          : "$ -"}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[100px]">
                    <a
                      href={`https://mempool.space/address/${item.item_lister}`}
                      target="_blank"
                      className="text-base transition-colors hover:text-theme"
                    >
                      {formatAddress(item.item_lister)}
                    </a>
                  </TableCell>
                  <TableCell className="min-w-[100px]">
                    {item.item_receiver ? (
                      <a
                        href={`https://mempool.space/address/${item.item_receiver}`}
                        target="_blank"
                        className="text-base transition-colors hover:text-theme"
                      >
                        {formatAddress(item.item_receiver)}
                      </a>
                    ) : (
                      <div className="text-base">-</div>
                    )}
                  </TableCell>
                  <TableCell className="min-w-[200px]">
                    <div className="text-base">
                      {dayjs
                        .unix(item.timestamp)
                        .utc()
                        .format("YYYY-MM-DD HH:mm:ss")}
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[150px]">
                    {item.type === "buy" ? (
                      <a
                        href={`https://mempool.space/tx/${item.tx_id}`}
                        target="_blank"
                        className="text-base transition-colors hover:text-theme"
                      >
                        {formatAddress(item.tx_id, 8)}
                      </a>
                    ) : (
                      <div className="text-base">-</div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={page}
            total={total}
            onPageChange={(page) =>
              updateSearchParams({ page }, { action: "push", scroll: false })
            }
          />
        </>
      )}
    </div>
  );
};

const Skeleton = () => {
  return (
    <div className="w-full space-y-4">
      <Table>
        <TableHeader>
          <TableRow className="bg-secondary">
            <TableHead>
              <div className="flex items-center space-x-2">
                <div>Content</div>
              </div>
            </TableHead>
            <TableHead>
              <div className="flex items-center space-x-2">
                <div>Type</div>
              </div>
            </TableHead>
            <TableHead>
              <div className="flex items-center space-x-2">
                <div>Price</div>
              </div>
            </TableHead>
            <TableHead>
              <div className="flex items-center space-x-2">
                <div>From</div>
              </div>
            </TableHead>
            <TableHead>
              <div className="flex items-center space-x-2">
                <div>To</div>
              </div>
            </TableHead>
            <TableHead>
              <div className="flex items-center space-x-2">
                <div>Time</div>
              </div>
            </TableHead>
            <TableHead>
              <div className="flex items-center space-x-2">
                <div>Tx</div>
              </div>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {SkeletonArray.map((_, index) => (
            <TableRow key={index}>
              <TableCell className="min-w-[130px]">
                <div className="flex flex-col justify-center space-y-1">
                  <div className="h-6 w-16 animate-pulse rounded-md bg-skeleton"></div>
                  <div className="flex items-center space-x-1">
                    <div className="h-5 w-10 animate-pulse rounded-md bg-skeleton"></div>
                    <div className="text-sm">/</div>
                    <div className="h-5 w-10 animate-pulse rounded-md bg-skeleton"></div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="min-w-[100px]">
                <div className="inline-flex w-[80px] animate-pulse rounded-lg bg-skeleton px-2 py-1"></div>
              </TableCell>
              <TableCell className="min-w-[120px]">
                <div className="flex flex-col justify-center space-y-1 text-base">
                  <div className="flex items-center space-x-2">
                    <img
                      className="h-4 w-4"
                      src="/icons/btc.svg"
                      alt="BTC"
                    />
                    <div className="h-6 w-16 animate-pulse rounded-md bg-skeleton"></div>
                  </div>
                  <div className="text-sm text-secondary">$ -</div>
                </div>
              </TableCell>
              <TableCell className="min-w-[100px]">
                <div className="h-6 w-16 animate-pulse rounded-md bg-skeleton"></div>
              </TableCell>
              <TableCell className="min-w-[100px]">
                <div className="h-6 w-16 animate-pulse rounded-md bg-skeleton"></div>
              </TableCell>
              <TableCell className="min-w-[200px]">
                <div className="h-6 w-16 animate-pulse rounded-md bg-skeleton"></div>
              </TableCell>
              <TableCell className="min-w-[150px]">
                <div className="h-6 w-16 animate-pulse rounded-md bg-skeleton"></div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
