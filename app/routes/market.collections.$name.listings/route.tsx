import { useParams } from "@remix-run/react";
import { useDebounce } from "@uidotdev/usehooks";
import { Loader2, ShoppingCart, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import AxiosInstance from "@/lib/axios";
import { useBTCPrice } from "@/lib/hooks/useBTCPrice";
import { useFetchOffer } from "@/lib/hooks/useFetchOffer";
import { useSetSearch } from "@/lib/hooks/useSetSearch";
import { useToast } from "@/lib/hooks/useToast";
import QuickListModal from "@/lib/maincomponents/list/QuickListModal";
import { useListFunctions } from "@/lib/maincomponents/list/hooks";
import { RuneOfferType } from "@/lib/types/market";
import { cn, formatNumber, satsToBTC } from "@/lib/utils";
import { formatError } from "@/lib/utils/error-helpers";

import { Button } from "@/components/Button";
import EmptyTip from "@/components/EmptyTip";
import GridList from "@/components/GridList";
import { Input } from "@/components/Input";
import Pagination from "@/components/Pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select";
import { useWallet } from "@/components/Wallet/hooks";

import BulkBuyModal from "./components/BulkBuyModal";
import BuyModal from "./components/BuyModal";
import BuySuccessModal from "./components/BuySuccessModal";

const SkeletonArray: number[] = new Array(20).fill(0);

export default function MarketCollectionListingsPage() {
  const { offers, offersLoading, refreshOffers } = useFetchOffer("collection");
  const { name } = useParams();
  const { unlistOffer } = useListFunctions();

  const { account, setModalOpen } = useWallet();
  const { toast } = useToast();
  const { BTCPrice } = useBTCPrice();
  const { searchParams, updateSearchParams } = useSetSearch();
  const [successPayload, setSuccessPayload] = useState<{
    txId: string;
    price: string;
    inscriptionIds: string[];
  }>();
  const [selectedOffer, setSelectedOffer] = useState<RuneOfferType>();
  const [filters, setFilters] = useState("");
  const [selectedOffersMap, setSelectedOffersMap] = useState<
    Map<string, RuneOfferType>
  >(new Map());
  const [bulkBuyModalOpen, setBulkBuyModalOpen] = useState(false);
  const [quickListModalOpen, setQuickListModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const debouncedFilters = useDebounce(filters, 600);
  const sort = searchParams.get("sort") || "price_asc";

  const deleteInvalidOffers = async (invalidIds: number[]) => {
    await AxiosInstance.post("/api/offer/delete", {
      ids: invalidIds,
    });
    refreshOffers();
  };

  const unlistItem = async (item: RuneOfferType) => {
    try {
      if (!account) {
        throw new Error("Connect wallet to continue");
      }

      setLoading(true);

      await unlistOffer({ offerIds: [item.id] });

      refreshOffers();
    } catch (e) {
      console.log(e);
      toast({
        variant: "destructive",
        duration: 3000,
        title: "Unlist failed",
        description: formatError(e),
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleSelectedOffer = (offer: RuneOfferType) => {
    const exists = selectedOffersMap.get(offer.id.toString());

    if (exists) {
      const newMap = new Map(selectedOffersMap);
      newMap.delete(offer.id.toString());
      setSelectedOffersMap(newMap);
    } else {
      const newMap = new Map(selectedOffersMap);

      const totalCount = selectedOffersMap.size;

      if (totalCount >= 8) {
        toast({
          duration: 3000,
          title: "You can only buy max 8 items in one transaction",
        });
        return;
      }

      newMap.set(offer.id.toString(), offer);
      setSelectedOffersMap(newMap);
    }
  };

  const selectedOffers = useMemo(() => {
    return Array.from(selectedOffersMap.values());
  }, [selectedOffersMap]);

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

  if (offersLoading || !offers) {
    return (
      <div className="w-full space-y-6">
        <div className="flex w-full justify-between space-x-6 px-2">
          <div className="relative flex h-10 w-full max-w-[300px] items-center">
            <Input
              placeholder="Search by name"
              className="w-full bg-primary pr-10 focus:bg-secondary"
              value={filters}
              disabled
            />
            <X
              className={cn(
                "absolute right-3 h-5 w-5 text-secondary opacity-75",
                {
                  hidden: !filters,
                },
              )}
            />
          </div>
          <div className="flex shrink-0 flex-col items-end space-y-4 md:flex-row md:items-center md:space-x-4 md:space-y-0">
            <Select
              value={sort}
              disabled
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="price_asc">Price: Low to High</SelectItem>
                <SelectItem value="price_desc">Price: High to Low</SelectItem>
                <SelectItem value="id_desc">Recently Listed</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center space-x-4">
              <Button
                disabled
                className="h-8"
              >
                Quick List
              </Button>
            </div>
          </div>
        </div>
        <GridList>
          {SkeletonArray.map((_, index) => {
            return <Skeleton key={index} />;
          })}
        </GridList>
      </div>
    );
  }

  return (
    <>
      <div className="w-full space-y-6">
        <div className="flex w-full justify-between space-x-6 px-2">
          <div className="relative flex h-10 w-full max-w-[300px] items-center">
            <Input
              placeholder="Search by name"
              className="w-full bg-primary pr-10 focus:bg-secondary"
              value={filters}
              onChange={(e) => setFilters(e.target.value)}
            />
            <X
              onClick={() => {
                setFilters("");
              }}
              className={cn(
                "absolute right-3 h-5 w-5 cursor-pointer text-secondary transition-colors hover:text-theme",
                {
                  hidden: !filters,
                },
              )}
            />
          </div>
          <div className="flex shrink-0 flex-col items-end space-y-4 md:flex-row md:items-center md:space-x-4 md:space-y-0">
            <Select
              value={sort}
              onValueChange={(value) =>
                updateSearchParams(
                  { sort: value },
                  {
                    action: "push",
                    scroll: false,
                  },
                )
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="price_asc">Price: Low to High</SelectItem>
                <SelectItem value="price_desc">Price: High to Low</SelectItem>
                <SelectItem value="id_desc">Recently Listed</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center space-x-4">
              <Button
                onClick={() => {
                  if (!account) {
                    setModalOpen(true);
                    return;
                  }

                  setQuickListModalOpen(true);
                }}
                className="h-8"
              >
                Quick List
              </Button>
            </div>
          </div>
        </div>
        {offers.offers.length === 0 ? (
          <EmptyTip text="No listings" />
        ) : (
          <>
            <GridList>
              {offers.offers.map((offer) => {
                return (
                  <div
                    className="group w-full overflow-hidden rounded-lg border border-transparent bg-secondary transition-colors hover:border-theme"
                    key={offer.id}
                  >
                    <div className="relative flex aspect-square w-full items-center justify-center">
                      <img
                        className="h-full w-full"
                        src={`https://ordin.s3.amazonaws.com/inscriptions/${offer.inscriptionId}`}
                        alt={offer.spacedName}
                      />
                      {account?.ordinals.address === offer.lister && (
                        <div className="absolute left-3 top-3 flex items-center rounded-lg bg-theme px-2 py-1 text-xs">
                          Your List
                        </div>
                      )}
                      <div className="absolute right-3 top-3 rounded-md bg-theme px-2 py-1 text-xs text-white">
                        {`# ${offer.runeId}`}
                      </div>
                    </div>
                    <div className="w-full space-y-4 bg-card p-4">
                      <a
                        href={`/rune/${offer.runeId}`}
                        target="_blank"
                        className="block w-full truncate break-all text-sm text-primary transition-colors hover:text-theme"
                      >
                        {offer.spacedName}
                      </a>
                      <div className="flex w-full flex-col space-y-2">
                        <div className="flex items-center space-x-2">
                          <img
                            className="h-4 w-4"
                            src="/icons/btc.svg"
                            alt="BTC"
                          />
                          <div>{satsToBTC(parseInt(offer.totalPrice))}</div>
                        </div>
                        {BTCPrice ? (
                          <div className="text-sm text-secondary">
                            {`$ ${formatNumber(
                              parseFloat(
                                satsToBTC(parseInt(offer.totalPrice)),
                              ) * BTCPrice,
                              {
                                precision: 2,
                              },
                            )}`}
                          </div>
                        ) : (
                          <div className="text-sm text-secondary">$ -</div>
                        )}
                      </div>
                      {account?.ordinals.address === offer.lister ? (
                        <Button
                          disabled={loading}
                          onClick={() => unlistItem(offer)}
                          className="w-full border bg-secondary transition-colors hover:opacity-100 group-hover:border-transparent group-hover:bg-theme"
                        >
                          {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Unlist"
                          )}
                        </Button>
                      ) : (
                        <div className="flex items-center space-x-4">
                          <Button
                            onClick={() => setSelectedOffer(offer)}
                            className="w-full border bg-secondary transition-colors hover:border-transparent hover:bg-theme hover:opacity-100"
                          >
                            Buy
                          </Button>
                          <Button
                            onClick={() => toggleSelectedOffer(offer)}
                            className={cn(
                              "w-10 shrink-0 border p-3 transition-colors hover:border-transparent hover:bg-theme hover:opacity-100",
                              {
                                "bg-secondary": !selectedOffersMap.get(
                                  offer.id.toString(),
                                ),
                                "bg-red-400/30": selectedOffersMap.get(
                                  offer.id.toString(),
                                ),
                              },
                            )}
                          >
                            {selectedOffersMap.get(offer.id.toString()) ? (
                              <Trash2 className="h-full w-full" />
                            ) : (
                              <ShoppingCart className="h-full w-full" />
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </GridList>
            <Pagination
              page={parseInt(searchParams.get("page") || "1") || 1}
              total={Math.ceil(offers.count / 30)}
              onPageChange={(page) =>
                updateSearchParams(
                  { page: page.toString() },
                  {
                    action: "push",
                    scroll: false,
                  },
                )
              }
            />
          </>
        )}
      </div>
      <BuyModal
        offer={selectedOffer}
        onClose={(invalidIds) => {
          deleteInvalidOffers(invalidIds);
          setSelectedOffer(undefined);
        }}
        onSuccess={(payload) => {
          setSelectedOffer(undefined);
          setSuccessPayload(payload);
        }}
      />
      <BulkBuyModal
        open={bulkBuyModalOpen}
        setOpen={setBulkBuyModalOpen}
        offers={selectedOffers}
        onClose={(invalidIds) => {
          setBulkBuyModalOpen(false);
          deleteInvalidOffers(invalidIds);
        }}
        onSuccess={(payload) => {
          refreshOffers();
          setBulkBuyModalOpen(false);
          setSelectedOffersMap(new Map());
          setSuccessPayload(payload);
        }}
      />
      <BuySuccessModal
        payload={successPayload}
        onClose={() => {
          refreshOffers();
          setSuccessPayload(undefined);
        }}
      />

      {selectedOffers.length > 0 && (
        <>
          <Button
            onClick={() => setSelectedOffersMap(new Map())}
            className="fixed bottom-20 left-5 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-theme p-3"
          >
            <Trash2 className="h-full w-full" />
          </Button>
          <Button
            onClick={() => setBulkBuyModalOpen(true)}
            className="fixed bottom-5 left-5 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-theme p-3"
          >
            <div className="absolute right-0.5 top-0.5 h-3 w-3 rounded-full bg-red-500"></div>
            <ShoppingCart className="h-full w-full" />
          </Button>
        </>
      )}
      <QuickListModal
        open={quickListModalOpen}
        onClose={() => setQuickListModalOpen(false)}
        collectionName={name || ""}
        successCallBack={() => {
          refreshOffers();
        }}
      />
    </>
  );
}

const Skeleton = () => {
  return (
    <div className="group w-full overflow-hidden rounded-lg border border-transparent bg-secondary transition-colors hover:border-theme">
      <div className="relative flex aspect-square w-full animate-pulse items-center justify-center bg-skeleton"></div>
      <div className="w-full space-y-4 bg-card p-4">
        <div className="h-5 w-full animate-pulse rounded-md bg-skeleton"></div>
        <div className="flex w-full flex-col space-y-2">
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
        <div className="flex items-center space-x-4">
          <Button className="w-full border bg-secondary transition-colors hover:border-transparent hover:bg-theme hover:opacity-100">
            Buy
          </Button>
          <Button className="w-10 shrink-0 border bg-secondary p-3 transition-colors hover:border-transparent hover:bg-theme hover:opacity-100">
            <ShoppingCart className="h-full w-full" />
          </Button>
        </div>
      </div>
    </div>
  );
};
