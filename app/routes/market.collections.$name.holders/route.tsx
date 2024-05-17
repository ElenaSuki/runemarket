import { LoaderFunction, json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";

import DatabaseInstance from "@/lib/server/prisma.server";
import { formatAddress, formatNumber } from "@/lib/utils";

import EmptyTip from "@/components/EmptyTip";
import { Progress } from "@/components/Progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/Table";

import { MarketPageCollectionHoldersResponseType } from "./types";

export const loader: LoaderFunction = async ({ params }) => {
  const { name } = params;

  if (!name) {
    throw new Response("Not Found", { status: 404 });
  }

  const holders = await DatabaseInstance.$queryRaw<
    {
      inscription_holder: string;
      balance: bigint;
    }[]
  >`
    SELECT
      inscription_holder,
      COUNT(*) AS balance
    FROM
      rune_collection_item
    WHERE
      valid = 1
    AND
      collection_name = ${name}
    AND
      inscription_holder = rune_holder
    GROUP BY
      inscription_holder
    ORDER BY
      balance DESC
    LIMIT 100
  `;

  const totalCount = await DatabaseInstance.rune_collection_item.count({
    where: {
      valid: 1,
      collection_name: name,
    },
  });

  const response: {
    address: MarketPageCollectionHoldersResponseType[];
    itemCount: number;
  } = {
    address: holders.map((item) => ({
      address: item.inscription_holder,
      balance: item.balance.toString(),
    })),
    itemCount: totalCount,
  };

  return json({
    data: response,
  });
};

export default function MarketTokenHistoryPage() {
  const { data } = useLoaderData<{
    data: {
      address: MarketPageCollectionHoldersResponseType[];
      itemCount: number;
    };
  }>();

  return (
    <HoldersTable
      data={data.address}
      itemCount={data.itemCount}
    />
  );
}

const HoldersTable: React.FC<{
  data: MarketPageCollectionHoldersResponseType[];
  itemCount: number;
}> = ({ data, itemCount }) => {
  return (
    <div className="w-full space-y-4">
      {data.length === 0 ? (
        <EmptyTip text="No Holders" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary">
                <TableHead>
                  <div className="flex items-center space-x-2">
                    <div>Address</div>
                  </div>
                </TableHead>
                <TableHead>
                  <div className="flex items-center space-x-2">
                    <div>Balance</div>
                  </div>
                </TableHead>
                <TableHead>
                  <div className="flex items-center space-x-2">
                    <div>Process</div>
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((item) => (
                <TableRow key={item.address}>
                  <TableCell className="min-w-[250px]">
                    <a
                      href={`/assets/${item.address}`}
                      target="_blank"
                      className="text-primary transition-colors hover:text-theme"
                    >
                      {formatAddress(item.address, 6)}
                    </a>
                  </TableCell>
                  <TableCell className="min-w-[250px]">
                    {formatNumber(parseInt(item.balance))}
                  </TableCell>
                  <TableCell className="min-w-[300px]">
                    <div className="flex items-center space-x-4">
                      <Progress
                        className="h-2 w-60"
                        value={(parseInt(item.balance) / itemCount) * 100}
                      />
                      <div className="text-sm">
                        {`${formatNumber(
                          (parseInt(item.balance) / itemCount) * 100,
                          {
                            precision: 6,
                          },
                        )}%`}
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
};
