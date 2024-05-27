import { LoaderFunction, json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Loader2, X } from "lucide-react";
import { useMemo, useState } from "react";

import { useBTCPrice } from "@/lib/hooks/useBTCPrice";
import { useFetchRunes } from "@/lib/hooks/useFetchRunes";
import { useSetSearch } from "@/lib/hooks/useSetSearch";
import { useToast } from "@/lib/hooks/useToast";
import ListModal from "@/lib/maincomponents/list/ListModal";
import {
  useListFunctions,
  useListStore,
} from "@/lib/maincomponents/list/hooks";
import { ValidAddressRuneAssetWithList } from "@/lib/types/rune";
import {
  cn,
  formatAddress,
  formatNumber,
  getCollectionName,
  satsToBTC,
} from "@/lib/utils";
import { formatError } from "@/lib/utils/error-helpers";

import { Button } from "@/components/Button";
import CopyButton from "@/components/CopyButton";
import EmptyTip from "@/components/EmptyTip";
import GridList from "@/components/GridList";
import { Input } from "@/components/Input";
import { Tabs, TabsList, TabsTrigger } from "@/components/Tabs";
import { useWallet } from "@/components/Wallet/hooks";

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

  const { searchParams, updateSearchParams } = useSetSearch();

  const [filterStr, setFilterStr] = useState("");

  const runeType = useMemo(() => {
    return searchParams.get("type") === "nonbundle" ? "nonbundle" : "bundle";
  }, [searchParams]);

  return (
    <div className="w-full space-y-6">
      <h2 className="text-2xl font-bold">Address</h2>
      <div className="flex items-center space-x-4">
        <div className="text-lg">{formatAddress(address, 12)}</div>
        <CopyButton text={address} />
      </div>
      <Tabs
        className="w-full border-b"
        value={runeType}
      >
        <TabsList>
          <TabsTrigger
            className="h-10 data-[state=active]:border-b data-[state=active]:border-theme data-[state=active]:text-theme"
            value="bundle"
            onClick={() => {
              updateSearchParams(
                { type: "bundle" },
                {
                  action: "push",
                  scroll: false,
                },
              );
            }}
          >
            Bundles
          </TabsTrigger>
          <TabsTrigger
            className="h-10 data-[state=active]:border-b data-[state=active]:border-theme data-[state=active]:text-theme"
            value="nonbundle"
            onClick={() => {
              updateSearchParams(
                { type: "nonbundle" },
                {
                  action: "push",
                  scroll: false,
                },
              );
            }}
          >
            Only Runes
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex items-center justify-between space-x-6">
        <div className="relative flex h-10 w-full max-w-[300px] items-center">
          <Input
            placeholder="Search by name"
            className="w-full bg-primary pr-10 focus:bg-secondary"
            value={filterStr}
            onChange={(e) => setFilterStr(e.target.value)}
          />
          <X
            onClick={() => {
              setFilterStr("");
            }}
            className={cn(
              "absolute right-3 h-5 w-5 cursor-pointer text-secondary transition-colors hover:text-theme",
              {
                hidden: !filterStr,
              },
            )}
          />
        </div>
      </div>
      <RuneBalance
        address={address}
        runeType={runeType}
        filterStr={filterStr}
      />
    </div>
  );
}

const RuneBalance: React.FC<{
  address: string;
  runeType: "bundle" | "nonbundle";
  filterStr: string;
}> = ({ address, runeType, filterStr }) => {
  const { account, connector } = useWallet();

  const { runes, loading, setLoading, fetchRunes } = useFetchRunes(address);
  const { setSelectedItems, setAction } = useListStore();

  const { BTCPrice } = useBTCPrice();
  const { toast } = useToast();
  const { unlistOffer } = useListFunctions();

  const filterRunes = useMemo(() => {
    const typeFilteredRunes =
      runeType === "bundle"
        ? runes.filter((rune) => rune.inscription)
        : runes.filter((rune) => !rune.inscription);

    const strFilteredRunes = filterStr
      ? typeFilteredRunes.filter((rune) => {
          return rune.name.toLowerCase().includes(filterStr.toLowerCase());
        })
      : typeFilteredRunes;

    return strFilteredRunes;
  }, [runes, runeType, filterStr]);

  const handleListButtonClick = (
    runeId: string,
    action: "list" | "edit",
    bundle?: boolean,
  ) => {
    const rune = filterRunes.find((rune) => rune.runeId === runeId);

    if (!rune) return;

    if (action === "list") {
      if (bundle) {
        setSelectedItems([rune]);
      } else {
        setSelectedItems([
          {
            ...rune,
            inscription: undefined,
          },
        ]);
      }
    } else {
      if (rune.listed?.inscriptionId) {
        setSelectedItems([rune]);
      } else {
        setSelectedItems([
          {
            ...rune,
            inscription: undefined,
          },
        ]);
      }
    }

    setAction(action);
  };

  const unlistItem = async (item: ValidAddressRuneAssetWithList) => {
    try {
      if (!account || !connector) {
        throw new Error("Connect wallet to continue");
      }

      if (!item.listed) {
        throw new Error("Item is not listed");
      }

      setLoading(true);

      await unlistOffer({ offerIds: [item.listed.id] });

      fetchRunes();
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

  if (loading && runes.length === 0) {
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
        {filterRunes.length > 0 ? (
          <>
            {runeType === "bundle" ? (
              <div className="w-full">
                <GridList>
                  {filterRunes.map((item) => {
                    return (
                      <div
                        className="group w-full overflow-hidden rounded-lg border border-transparent bg-secondary"
                        key={`${item.rune.txid}:${item.rune.vout}`}
                      >
                        <div className="relative flex aspect-square w-full items-center justify-center">
                          <img
                            loading="lazy"
                            className="h-full w-full"
                            src={`https://ordin.s3.amazonaws.com/inscriptions/${item.inscription?.inscriptionId}`}
                            alt={item.name}
                          />
                          {item.listed &&
                            address === account?.ordinals.address && (
                              <>
                                <div className="absolute left-3 top-3 rounded-lg bg-theme px-2 py-1 text-xs font-medium">
                                  {item.listed.inscriptionId
                                    ? "Bundle"
                                    : "Only Rune"}
                                </div>
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
                                          satsToBTC(
                                            parseInt(item.listed.totalPrice),
                                          ),
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
                                          satsToBTC(
                                            parseInt(item.listed.totalPrice),
                                          ),
                                        ) * BTCPrice,
                                      )}`}
                                    </div>
                                  ) : (
                                    <div className="text-secondary">$ -</div>
                                  )}
                                </div>
                              </>
                            )}
                        </div>
                        <div className="w-full space-y-4 bg-card p-2">
                          <div className="w-full space-y-1.5">
                            <div className="flex w-full items-center justify-between space-x-2">
                              <div className="text-lg font-medium">
                                {getCollectionName(item.name)}
                              </div>
                              <div className="text-sm text-secondary">{`# ${item.runeId}`}</div>
                            </div>
                            <a
                              href={`/rune/${item.runeId}`}
                              target="_blank"
                              className="block w-full truncate break-all text-sm text-primary transition-colors hover:text-theme"
                            >
                              {item.name}
                            </a>
                          </div>
                          {address === account?.ordinals.address && (
                            <div className="flex w-full justify-between space-x-2">
                              {!item.listed ? (
                                <>
                                  <Button
                                    disabled={loading}
                                    onClick={() =>
                                      handleListButtonClick(
                                        item.runeId,
                                        "list",
                                        true,
                                      )
                                    }
                                    className="border border-transparent bg-secondary transition-colors hover:border-theme hover:opacity-100"
                                  >
                                    Bundle List
                                  </Button>
                                  <Button
                                    disabled={loading || item.merged}
                                    onClick={() =>
                                      handleListButtonClick(
                                        item.runeId,
                                        "list",
                                        false,
                                      )
                                    }
                                    className="border border-transparent bg-secondary transition-colors hover:border-theme hover:opacity-100"
                                  >
                                    List Rune
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    disabled={loading}
                                    onClick={() => unlistItem(item)}
                                    className="border border-transparent bg-secondary transition-colors hover:border-theme hover:opacity-100"
                                  >
                                    Unlist
                                  </Button>
                                  <Button
                                    disabled={loading}
                                    onClick={() =>
                                      handleListButtonClick(item.runeId, "edit")
                                    }
                                    className="border border-transparent bg-secondary transition-colors hover:border-theme hover:opacity-100"
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
              <div className="w-full space-y-6">
                {filterRunes.map((item) => {
                  return (
                    <div
                      className="w-full space-y-4 rounded-lg bg-secondary p-4"
                      key={`${item.rune.txid}:${item.rune.vout}`}
                    >
                      <div className="w-full space-y-2">
                        <a
                          href={`/rune/${item.runeId}`}
                          target="_blank"
                          className="block w-full truncate break-all font-medium text-primary transition-colors hover:text-theme"
                        >
                          {item.name}
                        </a>
                        <div className="text-sm text-secondary">{`# ${item.runeId}`}</div>
                      </div>
                      {account && account.ordinals.address === address && (
                        <div className="flex w-full items-center justify-between space-x-6">
                          {item.listed && (
                            <div className="flex shrink-0 items-center space-x-2">
                              <div className="flex items-center space-x-2">
                                <img
                                  className="h-4 w-4"
                                  src="/icons/btc.svg"
                                  alt="BTC"
                                />
                                <div>
                                  {formatNumber(
                                    parseFloat(
                                      satsToBTC(
                                        parseInt(item.listed.totalPrice),
                                      ),
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
                                      satsToBTC(
                                        parseInt(item.listed.totalPrice),
                                      ),
                                    ) * BTCPrice,
                                  )}`}
                                </div>
                              ) : (
                                <div className="text-secondary">$ -</div>
                              )}
                            </div>
                          )}
                          <div className="flex w-full items-center justify-end space-x-4">
                            {!item.listed ? (
                              <Button
                                disabled={loading}
                                onClick={() =>
                                  handleListButtonClick(
                                    item.runeId,
                                    "list",
                                    false,
                                  )
                                }
                                className="border border-transparent bg-card transition-colors hover:border-theme hover:opacity-100"
                              >
                                List
                              </Button>
                            ) : (
                              <>
                                <Button
                                  disabled={loading}
                                  onClick={() => unlistItem(item)}
                                  className="border border-transparent bg-card transition-colors hover:border-theme hover:opacity-100"
                                >
                                  Unlist
                                </Button>
                                <Button
                                  disabled={loading}
                                  onClick={() =>
                                    handleListButtonClick(item.runeId, "edit")
                                  }
                                  className="border border-transparent bg-card transition-colors hover:border-theme hover:opacity-100"
                                >
                                  Edit
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <EmptyTip text="No Items Found" />
        )}
      </div>
      <ListModal
        successCallBack={() => {
          fetchRunes();
        }}
      />
    </div>
  );
};
