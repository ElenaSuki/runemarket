import { useNavigate } from "@remix-run/react";
import { useMemo } from "react";

import { useBTCPrice } from "@/lib/hooks/useBTCPrice";
import { useSetSearch } from "@/lib/hooks/useSetSearch";
import { formatNumber, satsToBTC } from "@/lib/utils";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/Avatar";
import Pagination from "@/components/Pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/Table";

import { IndexPageTokenResponseType } from "../types";

const TokensTable: React.FC<{
  tokens: IndexPageTokenResponseType[];
  page: number;
  filters: string;
}> = ({ tokens, page, filters }) => {
  const navigate = useNavigate();
  const { updateSearchParams } = useSetSearch();
  const { BTCPrice } = useBTCPrice();

  const sortedTokens = useMemo(() => {
    const filterTokens = filters
      ? tokens.filter((token) =>
          token.spaced_name.toLowerCase().includes(filters.toLowerCase()),
        )
      : tokens;

    return filterTokens;
  }, [tokens, filters]);

  const total = useMemo(
    () => (sortedTokens.length > 0 ? Math.ceil(sortedTokens.length / 10) : 1),
    [sortedTokens],
  );

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="relative bg-secondary">
            <TableHead>
              <div className="flex items-center space-x-2">
                <div className="text-nowrap">Name</div>
              </div>
            </TableHead>
            <TableHead>
              <div className="flex items-center space-x-2">
                <div className="text-nowrap">Floor Price ( sats )</div>
              </div>
            </TableHead>
            <TableHead>
              <div className="flex items-center space-x-2">
                <div className="text-nowrap">Listings</div>
              </div>
            </TableHead>
            <TableHead>
              <div className="flex items-center space-x-2">
                <div className="text-nowrap">Market Cap</div>
              </div>
            </TableHead>
            <TableHead>
              <div className="flex items-center space-x-2">
                <div>Sales(24H)</div>
              </div>
            </TableHead>
            <TableHead>
              <div className="flex items-center space-x-2">
                <div>Volume(24H)</div>
              </div>
            </TableHead>
            <TableHead>
              <div className="flex items-center space-x-2">
                <div>Holders</div>
              </div>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedTokens.slice((page - 1) * 10, page * 10).map((token) => (
            <TableRow
              key={token.rune_id}
              className="group relative cursor-pointer"
              onClick={() => navigate(`/market/tokens/${token.name}/listings`)}
            >
              <TableCell className="min-w-[200px]">
                <div className="flex items-center space-x-2">
                  <Avatar className="h-12 w-12 rounded-md">
                    <AvatarImage
                      src={`https://ordin.s3.amazonaws.com/inscriptions/${token.etch_tx_hash}i0`}
                      alt={token.spaced_name}
                    />
                    <AvatarFallback className="rounded-md bg-secondary">
                      {token.symbol}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-xs sm:text-sm lg:text-base">
                    {token.spaced_name}
                  </div>
                </div>
              </TableCell>
              <TableCell className="min-w-[120px]">
                <div className="space-y-2">
                  <div className="text-base">
                    {formatNumber(parseFloat(token.floor_price), {
                      precision: 4,
                    })}
                  </div>
                  <div className="text-sm text-secondary">
                    {BTCPrice
                      ? `$ ${formatNumber(
                          parseFloat(satsToBTC(parseFloat(token.floor_price))) *
                            BTCPrice,
                          { precision: 2 },
                        )}`
                      : "$ -"}
                  </div>
                </div>
              </TableCell>
              <TableCell className="min-w-[120px]">
                <div className="text-base">{formatNumber(token.listings)}</div>
              </TableCell>
              <TableCell className="min-w-[120px]">
                <div className="flex items-center space-x-2 text-base">
                  <img
                    src="/icons/btc.svg"
                    alt="btc"
                  />
                  <div>
                    {formatNumber(
                      parseFloat(
                        satsToBTC(
                          parseFloat(token.floor_price) *
                            Number(
                              BigInt(token.supply) /
                                10n ** BigInt(token.divisibility),
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
              </TableCell>
              <TableCell className="min-w-[120px]">
                <div className="text-base">{formatNumber(token.sales_24h)}</div>
              </TableCell>
              <TableCell className="min-w-[120px]">
                <div className="flex items-center space-x-2 text-base">
                  <img
                    src="/icons/btc.svg"
                    alt="btc"
                  />
                  <div>
                    {formatNumber(
                      parseFloat(
                        satsToBTC(parseFloat(token.volume_24h), { digits: 8 }),
                      ),
                      {
                        precision: 6,
                      },
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell className="min-w-[120px]">
                <div className="text-base">{formatNumber(token.holders)}</div>
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
  );
};

export default TokensTable;
