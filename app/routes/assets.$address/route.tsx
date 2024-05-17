import { LoaderFunction, json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

import { useBTCPrice } from "@/lib/hooks/useBTCPrice";
import { useListAndBuy } from "@/lib/hooks/useListAndBuy";
import { useToast } from "@/lib/hooks/useToast";
import { ValidAddressRuneAssetWithList } from "@/lib/types/rune";
import {
  formatAddress,
  formatNumber,
  getCollectionName,
  satsToBTC,
} from "@/lib/utils";
import { formatError } from "@/lib/utils/error-helpers";

import { Avatar, AvatarFallback } from "@/components/Avatar";
import { Button } from "@/components/Button";
import CopyButton from "@/components/CopyButton";
import EmptyTip from "@/components/EmptyTip";
import GridList from "@/components/GridList";
import { Tabs, TabsList, TabsTrigger } from "@/components/Tabs";
import { useWallet } from "@/components/Wallet/hooks";

import CollectionListModal from "./components/CollectionListModal";
import EditModal from "./components/EditModal";
import ListModal from "./components/ListModal";
import UnlistModal from "./components/UnlistModal";
import {
  useFetchAddressBalance,
  useStoreRuneAssets,
} from "./hooks/useFetchAddressBalance";

export const loader: LoaderFunction = async ({ params }) => {
  const { address } = params;

  if (!address) {
    throw new Error("Address is required");
  }

  return json({
    address,
  });
};

export default function AssetsPage() {
  const { address } = useLoaderData<{
    address: string;
  }>();

  return (
    <div className="w-full space-y-6">
      <h2 className="text-2xl font-bold">Address</h2>
      <div className="flex items-center space-x-4">
        <div className="text-lg">{formatAddress(address, 12)}</div>
        <CopyButton text={address} />
      </div>
      <RuneBalance address={address} />
    </div>
  );
}

const RuneBalance: React.FC<{
  address: string;
}> = ({ address }) => {
  const { runes, runesLoading, refreshRunes, runesValidating } =
    useFetchAddressBalance(address);
  const { account, connector } = useWallet();
  const {
    setWaitSelectedRunes,
    setSelectedRunes,
    setAction,
    action,
    type,
    setType,
  } = useStoreRuneAssets();
  const { BTCPrice } = useBTCPrice();
  const { toast } = useToast();
  const { unlistOffer } = useListAndBuy();

  const [tabs, setTabs] = useState("token");
  const [loading, setLoading] = useState(false);

  const runeSummary = useMemo(() => {
    if (!runes || runes.length === 0) return [];

    const summary: {
      [runeId: string]: {
        runeId: string;
        symbol: string;
        listed: string;
        balance: string;
        spacedName: string;
      };
    } = {};

    runes.forEach((rune) => {
      if (rune.type === "nft") return;

      if (summary[rune.runeId]) {
        if (rune.listed) {
          summary[rune.runeId].listed = (
            parseFloat(summary[rune.runeId].listed) + parseFloat(rune.amount)
          ).toString();
        }

        summary[rune.runeId].balance = (
          parseFloat(summary[rune.runeId].balance) + parseFloat(rune.amount)
        ).toString();
      } else {
        summary[rune.runeId] = {
          runeId: rune.runeId,
          symbol: rune.symbol,
          listed: rune.listed ? rune.amount : "0",
          balance: rune.amount,
          spacedName: rune.spacedRune,
        };
      }
    });

    return Object.values(summary);
  }, [runes]);

  const collections = useMemo(() => {
    if (!runes || runes.length === 0) return [];

    return runes.filter((rune) => rune.type === "nft");
  }, [runes]);

  // const handleTokenButtonClick = (
  //   runeId: string,
  //   action: "list" | "unlist" | "edit",
  // ) => {
  //   if (!runes) return;

  //   const isListAction = action === "list";
  //   const sameRunes = runes.filter(
  //     (r) => r.runeId === runeId && !!r.listed !== isListAction,
  //   );
  //   setWaitSelectedRunes(sameRunes);
  //   setAction(action);
  //   setType("token");
  // };

  const handleCollectionButtonClick = (
    runeId: string,
    action: "list" | "unlist" | "edit",
  ) => {
    const rune = collections.find((rune) => rune.runeId === runeId);

    if (!rune) return;

    setWaitSelectedRunes([rune]);
    setSelectedRunes([rune]);
    setAction(action);
    setType("collection");
  };

  const unlistCollection = async (item: ValidAddressRuneAssetWithList) => {
    try {
      if (!account || !connector) {
        throw new Error("Connect wallet to continue");
      }

      if (!item.listed) {
        throw new Error("Item is not listed");
      }

      setLoading(true);

      await unlistOffer({ offerIds: [item.listed.id] });

      refreshRunes();
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

  if (runesLoading || !runes) {
    return (
      <div className="w-full space-y-6">
        <div className="flex h-80 w-full items-center justify-center">
          <div className="flex items-center space-x-4">
            <Loader2 className="h-5 w-5 animate-spin text-theme" />
            <div>Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="w-full">
        {collections.length > 0 ? (
          <div className="w-full">
            <GridList>
              {collections.map((item) => {
                return (
                  <div
                    className="group w-full overflow-hidden rounded-lg border border-transparent bg-secondary"
                    key={`${item.txid}:${item.vout}`}
                  >
                    <div className="relative flex aspect-square w-full items-center justify-center">
                      <img
                        loading="lazy"
                        className="h-full w-full"
                        src={`https://ordin.s3.amazonaws.com/inscriptions/${item.inscription?.inscriptionId}`}
                        alt={item.spacedRune}
                      />
                      {item.listed && address === account?.ordinals.address && (
                        <div className="absolute bottom-0 left-0 right-0 flex h-8 items-center justify-between space-x-2 bg-black/60 px-2 text-white">
                          <div className="flex items-center space-x-2">
                            <img
                              className="h-4 w-4"
                              src="/icons/btc.svg"
                              alt="BTC"
                            />
                            <div>
                              {formatNumber(
                                parseFloat(
                                  satsToBTC(parseInt(item.listed.totalPrice)),
                                ),
                                {
                                  precision: 8,
                                },
                              )}
                            </div>
                          </div>
                          {BTCPrice ? (
                            <div className="text-secondary">
                              {`$ ${formatNumber(
                                parseFloat(
                                  satsToBTC(parseInt(item.listed.totalPrice)),
                                ) * BTCPrice,
                              )}`}
                            </div>
                          ) : (
                            <div className="text-secondary">$ -</div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="w-full space-y-4 bg-card p-2">
                      <div className="w-full space-y-1.5">
                        <div className="flex w-full items-center justify-between space-x-2">
                          <div className="text-lg font-medium">
                            {getCollectionName(item.spacedRune)}
                          </div>
                          <div className="text-sm text-secondary">{`# ${item.runeId}`}</div>
                        </div>
                        <a
                          href={`/rune/${item.runeId}`}
                          target="_blank"
                          className="block w-full truncate break-all text-sm text-primary transition-colors hover:text-theme"
                        >
                          {item.spacedRune}
                        </a>
                      </div>
                      {address === account?.ordinals.address && (
                        <div className="flex w-full justify-between space-x-4">
                          {!item.listed ? (
                            <Button
                              disabled={runesValidating || loading}
                              onClick={() =>
                                handleCollectionButtonClick(item.runeId, "list")
                              }
                              className="w-full"
                            >
                              List
                            </Button>
                          ) : (
                            <>
                              <Button
                                disabled={runesValidating || loading}
                                onClick={() => unlistCollection(item)}
                                className="w-full border border-transparent bg-transparent transition-colors hover:border-theme hover:text-theme hover:opacity-100"
                              >
                                Unlist
                              </Button>
                              <Button
                                disabled={runesValidating || loading}
                                onClick={() =>
                                  handleCollectionButtonClick(
                                    item.runeId,
                                    "edit",
                                  )
                                }
                                className="w-full"
                              >
                                Edit
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </GridList>
          </div>
        ) : (
          <EmptyTip text="No Rune Collection Found" />
        )}
      </div>

      <CollectionListModal
        onSuccess={() => {
          refreshRunes();
        }}
      />
    </div>
  );
};
