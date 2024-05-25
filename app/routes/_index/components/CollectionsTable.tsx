import { useNavigate } from "@remix-run/react";
import { useMemo } from "react";

import { useBTCPrice } from "@/lib/hooks/useBTCPrice";
import { formatNumber, satsToBTC } from "@/lib/utils";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/Avatar";

import { IndexPageCollectionResponseType } from "../types";

const CollectionsTable: React.FC<{
  collections: IndexPageCollectionResponseType[];
  filters: string;
}> = ({ collections, filters }) => {
  const navigate = useNavigate();
  const { BTCPrice } = useBTCPrice();

  const sortedCollections = useMemo(() => {
    const filterCollections = filters
      ? collections.filter((collection) =>
          collection.display_name.toLowerCase().includes(filters.toLowerCase()),
        )
      : collections;

    return filterCollections;
  }, [collections, filters]);

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {sortedCollections.map((collection, index) => (
        <div
          onClick={() =>
            navigate(
              collection.collection_type === "bundle"
                ? `/market/collections/${collection.name}/listings`
                : `/market/tokens/${collection.name}/listings`,
            )
          }
          key={collection.name}
          className="flex w-full cursor-pointer flex-col space-y-6 rounded-lg border border-transparent bg-secondary p-6 transition-colors hover:border-theme"
        >
          <div className="flex w-full items-center justify-between">
            <div className="flex w-full items-center space-x-4">
              <Avatar className="h-12 w-12 rounded-md">
                <AvatarImage
                  src={collection.icon}
                  alt={collection.display_name}
                />
                <AvatarFallback className="rounded-md bg-primary">
                  {collection.symbol}
                </AvatarFallback>
              </Avatar>
              <div className="text-base">{collection.display_name}</div>
            </div>
            <div className="shrink-0 text-xl font-bold text-theme">{`# ${index}`}</div>
          </div>
          <div className="w-full space-y-3">
            <div className="flex w-full items-center justify-between">
              <div className="text-base">Floor Price</div>
              <div className="flex items-center space-x-2">
                <div className="text-base text-secondary">
                  $
                  {formatNumber(
                    parseFloat(satsToBTC(parseFloat(collection.floor_price))) *
                      BTCPrice,
                    {
                      precision: 2,
                    },
                  )}
                </div>
                <img
                  src="/icons/btc.svg"
                  alt="BTC"
                />
                <div className="text-base">
                  {formatNumber(
                    parseFloat(satsToBTC(parseFloat(collection.floor_price))),
                    {
                      precision: 8,
                    },
                  )}
                </div>
              </div>
            </div>
            <div className="flex w-full items-center justify-between">
              <div className="text-base">Listings</div>
              <div className="text-base">
                {formatNumber(collection.listings)}
              </div>
            </div>
            {collection.collection_type === "bundle" && (
              <>
                <div className="flex w-full items-center justify-between">
                  <div className="text-base">Items</div>
                  <div className="text-base">
                    {formatNumber(collection.items_count)}
                  </div>
                </div>
                <div className="flex w-full items-center justify-between">
                  <div className="text-base">Holders</div>
                  <div className="text-base">
                    {formatNumber(collection.holders)}
                  </div>
                </div>
              </>
            )}
            <div className="flex w-full items-center justify-between">
              <div className="text-base">Sales(24H)</div>
              <div className="text-base">
                {formatNumber(collection.sales_24h)}
              </div>
            </div>
            <div className="flex w-full items-center justify-between">
              <div className="text-base">Volume(24H)</div>
              <div className="flex items-center space-x-2">
                <div className="text-base text-secondary">
                  $
                  {formatNumber(
                    parseFloat(satsToBTC(parseFloat(collection.volume_24h))) *
                      BTCPrice,
                    {
                      precision: 2,
                    },
                  )}
                </div>
                <img
                  src="/icons/btc.svg"
                  alt="BTC"
                />
                <div className="text-base">
                  {formatNumber(
                    parseFloat(satsToBTC(parseFloat(collection.volume_24h))),
                    {
                      precision: 8,
                    },
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default CollectionsTable;
