import { useParams } from "@remix-run/react";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

import AxiosInstance from "@/lib/axios";
import { useBTCPrice } from "@/lib/hooks/useBTCPrice";
import { useFetchOffer } from "@/lib/hooks/useFetchOffer";
import { useSetSearch } from "@/lib/hooks/useSetSearch";
import { useToast } from "@/lib/hooks/useToast";
import { RuneOfferType } from "@/lib/types/market";
import { formatNumber, satsToBTC } from "@/lib/utils";

import { Button } from "@/components/Button";
import EmptyTip from "@/components/EmptyTip";
import GridList from "@/components/GridList";
import Pagination from "@/components/Pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select";
import { useWallet } from "@/components/Wallet/hooks";

import ListModal from "../assets.$address/components/ListModal";
import {
  useFetchAddressBalance,
  useStoreRuneAssets,
} from "../assets.$address/hooks/useFetchAddressBalance";
import BuyModal from "./components/BuyModal";
import BuySuccessModal from "./components/BuySuccessModal";
import EditModal from "./components/EditModal";
import SweepBuyModal from "./components/SweepBuyModal";

const SkeletonArray: number[] = new Array(20).fill(0);

export default function MarketTokenListingsPage() {
  const { offers, offersLoading, refreshOffers } = useFetchOffer("token");

  const { account, setModalOpen } = useWallet();
  const { toast } = useToast();
  const { name } = useParams();
  const { BTCPrice } = useBTCPrice();
  const { searchParams, updateSearchParams } = useSetSearch();
  const [sweepModalOpen, setSweepModalOpen] = useState(false);
  const [successPayload, setSuccessPayload] = useState<{
    txId: string;
    amount: number;
    price: string;
    runeName: string;
  }>();
  const [selectedOffer, setSelectedOffer] = useState<RuneOfferType>();
  const [editOffer, setEditOffer] = useState<RuneOfferType>();

  const address = useMemo(() => {
    return account ? account.ordinals.address : "";
  }, [account]);

  const { runes, refreshRunes, runesValidating } =
    useFetchAddressBalance(address);
  const { setWaitSelectedRunes, setAction, setType } = useStoreRuneAssets();

  const sort = searchParams.get("sort") || "price_asc";

  const deleteInvalidOffers = async (invalidLocations: string[]) => {
    await AxiosInstance.post("/api/offer/delete", {
      locations: invalidLocations,
    });
    refreshOffers();
  };

  if (offersLoading || !offers) {
    return (
      <div className="w-full space-y-6">
        <div className="flex w-full items-center justify-end px-2">
          <div className="flex flex-col items-end space-y-4 md:flex-row md:items-center md:space-x-4 md:space-y-0">
            <div className="flex items-center space-x-4">
              <Button
                disabled
                className="h-8"
              >
                Sweep
              </Button>
              <Button
                disabled
                className="h-8"
              >
                Quick List
              </Button>
            </div>
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
                <SelectItem value="amount_asc">Amount: Low to High</SelectItem>
                <SelectItem value="amount_desc">Amount: High to Low</SelectItem>
                <SelectItem value="id_desc">Recently Listed</SelectItem>
              </SelectContent>
            </Select>
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
        <div className="flex w-full items-center justify-end px-2">
          <div className="flex flex-col items-end space-y-4 md:flex-row md:items-center md:space-x-4 md:space-y-0">
            <div className="flex items-center space-x-4">
              <Button
                onClick={() => {
                  if (!account) {
                    setModalOpen(true);
                    return;
                  }
                  setSweepModalOpen(true);
                }}
                className="h-8"
              >
                Sweep
              </Button>
              <Button
                disabled={runesValidating}
                onClick={() => {
                  if (!account) {
                    setModalOpen(true);
                    return;
                  }

                  if (!runes || runes.length === 0) {
                    toast({
                      duration: 3000,
                      variant: "destructive",
                      title: "No same runes available",
                      description: `You don't have any same runes to list`,
                    });
                    return;
                  }

                  const sameRunes = runes.filter(
                    (rune) => rune.rune === name && !rune.listed,
                  );

                  if (sameRunes.length === 0) {
                    toast({
                      duration: 3000,
                      variant: "destructive",
                      title: "No same runes available",
                      description: `You don't have any same runes to list`,
                    });
                    return;
                  }

                  setWaitSelectedRunes(sameRunes);
                  setAction("list");
                  setType("token");
                }}
                className="h-8"
              >
                {runesValidating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Quick List"
                )}
              </Button>
            </div>
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
                <SelectItem value="amount_asc">Amount: Low to High</SelectItem>
                <SelectItem value="amount_desc">Amount: High to Low</SelectItem>
                <SelectItem value="id_desc">Recently Listed</SelectItem>
              </SelectContent>
            </Select>
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
                      <div className="flex flex-col items-center space-y-4 transition-transform group-hover:scale-125">
                        <div className="text-2xl font-bold">
                          {formatNumber(offer.amount)}
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="text-theme">
                            {formatNumber(parseFloat(offer.unitPrice), {
                              precision: 6,
                            })}
                          </div>
                          <div>{`sats / ${offer.symbol}`}</div>
                        </div>
                      </div>
                      {account?.ordinals.address === offer.lister && (
                        <div className="absolute left-3 top-3 flex items-center rounded-lg bg-theme px-2 py-1 text-xs">
                          Your List
                        </div>
                      )}
                    </div>
                    <div className="w-full space-y-4 bg-card p-4">
                      <div className="w-full truncate break-all text-sm">
                        {offer.spacedName}
                      </div>
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
                          onClick={() => setEditOffer(offer)}
                          className="w-full border bg-secondary transition-colors hover:opacity-100 group-hover:border-transparent group-hover:bg-theme"
                        >
                          Edit
                        </Button>
                      ) : (
                        <Button
                          onClick={() => setSelectedOffer(offer)}
                          className="w-full border bg-secondary transition-colors hover:opacity-100 group-hover:border-transparent group-hover:bg-theme"
                        >
                          Buy
                        </Button>
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
      <SweepBuyModal
        open={sweepModalOpen}
        onClose={(invalidLocation) => {
          deleteInvalidOffers(invalidLocation);
          setSweepModalOpen(false);
        }}
        onSuccess={(payload) => {
          setSweepModalOpen(false);
          setSuccessPayload(payload);
        }}
        offers={offers.offers.filter(
          (offer) => offer.lister !== account?.ordinals.address,
        )}
      />
      <BuyModal
        offer={selectedOffer}
        onClose={(invalidLocation) => {
          deleteInvalidOffers([invalidLocation]);
          setSelectedOffer(undefined);
        }}
        onSuccess={(payload) => {
          setSelectedOffer(undefined);
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
      <EditModal
        offer={editOffer}
        onClose={() => setEditOffer(undefined)}
        onSuccess={() => {
          refreshOffers();
          setEditOffer(undefined);
        }}
      />
      <ListModal
        onSuccess={() => {
          refreshRunes();
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
        <Button className="w-full border bg-secondary transition-colors hover:opacity-100 group-hover:border-transparent group-hover:bg-theme">
          Buy
        </Button>
      </div>
    </div>
  );
};
