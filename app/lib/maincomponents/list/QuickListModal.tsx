import { Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useBTCPrice } from "@/lib/hooks/useBTCPrice";
import { useFetchRunes } from "@/lib/hooks/useFetchRunes";
import { useToast } from "@/lib/hooks/useToast";
import { cn, formatNumber, getCollectionName, satsToBTC } from "@/lib/utils";
import { formatError } from "@/lib/utils/error-helpers";

import { Button } from "@/components/Button";
import { Dialog, DialogContent, DialogHeader } from "@/components/Dialog";
import { Input } from "@/components/Input";
import { useWallet } from "@/components/Wallet/hooks";

import { useFloorPrice, useListFunctions, useListStore } from "./hooks";

const QuickListModal: React.FC<{
  collectionName: string;
  open: boolean;
  onClose: () => void;
  successCallBack: () => void;
}> = ({ collectionName, open, onClose, successCallBack }) => {
  const { account } = useWallet();
  const {
    selectedItems,
    setSelectedItems,
    unitPrice,
    setUnitPrice,
    fundingReceiver,
    setFundingReceiver,
    autoFillReceiver,
    setAutoFillReceiver,
    closeCallBack,
  } = useListStore();

  const [address, setAddress] = useState("");

  const { runes, loading, setLoading } = useFetchRunes(address);

  const { price } = useFloorPrice();
  const { listOffer } = useListFunctions();
  const { toast } = useToast();
  const { BTCPrice } = useBTCPrice();

  const sameRunes = useMemo(() => {
    if (runes.length === 0) return [];

    return runes.filter(
      (rune) => getCollectionName(rune.name) === collectionName && !rune.listed,
    );
  }, [runes, collectionName]);

  const runeItem = useMemo(() => {
    return selectedItems.length > 0 ? selectedItems[0] : null;
  }, [selectedItems]);

  const nonBundle = useMemo(() => {
    if (!runeItem || !runeItem.inscription) return true;

    return false;
  }, [runeItem]);

  const totalPrice = useMemo(() => {
    if (!unitPrice) return 0;

    return Math.ceil(parseFloat(unitPrice) * 10 ** 8);
  }, [unitPrice]);

  const disableConfirm = useMemo(() => {
    if (loading) return true;

    return !runeItem || totalPrice === 0 || isNaN(totalPrice);
  }, [runeItem, totalPrice, loading]);

  const onSubmit = async () => {
    try {
      if (!runeItem) {
        throw new Error("No rune selected");
      }

      if (!unitPrice) {
        throw new Error("No price");
      }

      if (!fundingReceiver) {
        throw new Error("No receiver");
      }

      if (runeItem.merged && nonBundle) {
        throw new Error("Rune & inscription merged");
      }

      setLoading(true);

      await listOffer({
        unitPrice,
        receiver: fundingReceiver,
        runes: [runeItem],
        action: "list",
      });

      successCallBack();
      onClose();
      closeCallBack();
    } catch (e) {
      console.log(e);
      toast({
        variant: "destructive",
        duration: 3000,
        title: "List failed",
        description: formatError(e),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!account || !open) {
      setAddress("");
      return;
    }

    setAddress(account.ordinals?.address || "");
  }, [open]);

  useEffect(() => {
    if (!account) {
      onClose();
      closeCallBack();
      return;
    }

    if (!runeItem) return;

    if (autoFillReceiver) {
      setFundingReceiver(account.payment.address);
    }
  }, [runeItem, account]);

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          closeCallBack();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <div className="space-x-1.5">
            <span>{runeItem ? "Confirm" : "Select Item To List"}</span>
          </div>
        </DialogHeader>
        <div className="w-full space-y-6">
          {!runeItem && (
            <div className="w-full">
              {loading ? (
                <div className="flex h-32 items-center justify-center rounded-lg bg-primary p-3">
                  <Loader2 className="h-4 w-4 animate-spin text-theme" />
                </div>
              ) : (
                <>
                  {sameRunes.length === 0 ? (
                    <div className="flex h-32 items-center justify-center rounded-lg bg-primary p-3">
                      <div className="text-lg font-bold">No Items Found</div>
                    </div>
                  ) : (
                    <div className="flex max-h-[40vh] flex-col space-y-4 overflow-y-scroll rounded-lg bg-primary p-3">
                      {sameRunes.map((rune) => (
                        <div
                          onClick={() => {
                            setSelectedItems([rune]);
                          }}
                          key={rune.runeId}
                          className="flex w-full cursor-pointer items-center space-x-4 rounded-lg border border-transparent transition-colors hover:border-theme hover:bg-secondary"
                        >
                          <div className="relative aspect-square w-16 overflow-hidden rounded-lg bg-secondary">
                            {rune.inscription && (
                              <img
                                className="h-full w-full"
                                src={`https://ordin.s3.amazonaws.com/inscriptions/${rune.inscription.inscriptionId}`}
                                alt={rune.name}
                              />
                            )}
                          </div>
                          <div className="space-y-2">
                            <div>{rune.name}</div>
                            <div className="text-sm text-secondary">{`# ${rune.runeId}`}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {runeItem && (
            <>
              {runeItem.inscription ? (
                <div className="flex w-full justify-center rounded-lg bg-primary p-4">
                  <div className="relative aspect-square w-48 overflow-hidden rounded-lg bg-secondary">
                    <img
                      className="h-full w-full"
                      src={`https://ordin.s3.amazonaws.com/inscriptions/${runeItem.inscription.inscriptionId}`}
                      alt={runeItem.name}
                    />
                    <div className="absolute right-2 top-2 rounded-md bg-theme px-2 py-1 text-xs text-white">
                      {`# ${runeItem.runeId}`}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full space-y-2 rounded-lg bg-primary p-4">
                  <div className="text-lg font-bold">{runeItem.name}</div>
                  <div className="text-sm text-secondary">{`# ${runeItem.runeId}`}</div>
                </div>
              )}
              <div className="w-full space-y-4">
                <div className="box-content max-h-[25vh] w-full overflow-y-scroll py-2 pr-1">
                  <div className="flex flex-col space-y-4">
                    <div className="w-full space-y-2">
                      <div>BTC Price</div>
                      <div className="relative flex items-center">
                        <Input
                          value={unitPrice}
                          onChange={(e) => setUnitPrice(e.target.value)}
                          className="pr-10"
                          type="number"
                          step={0.00000001}
                          min={0}
                        />
                        <X
                          onClick={() => setUnitPrice("")}
                          className={cn(
                            "absolute right-3 h-5 w-5 cursor-pointer text-secondary transition-colors hover:text-theme",
                            {
                              hidden: !unitPrice,
                            },
                          )}
                        />
                      </div>
                      {price && (
                        <div className="space-y-1 text-xs text-secondary">
                          <div>
                            {`Floor Price: ${formatNumber(
                              parseFloat(satsToBTC(parseInt(price.floorPrice))),
                              {
                                precision: 8,
                              },
                            )} BTC`}
                          </div>
                          <div>
                            {`Avg 3 Sales Price: ${formatNumber(
                              parseFloat(
                                satsToBTC(parseInt(price.avgSalePrice)),
                              ),
                              {
                                precision: 8,
                              },
                            )} BTC`}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="w-full space-y-2">
                      <div>Funding Receiver</div>
                      <div className="relative flex items-center">
                        <Input
                          value={fundingReceiver}
                          onChange={(e) => setFundingReceiver(e.target.value)}
                          className="pr-10"
                        />
                        <X
                          onClick={() => {
                            setAutoFillReceiver(false);
                            setFundingReceiver("");
                          }}
                          className={cn(
                            "absolute right-3 h-5 w-5 cursor-pointer text-secondary transition-colors hover:text-theme",
                            {
                              hidden: !fundingReceiver,
                            },
                          )}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end space-y-2">
                  <div className="flex items-center space-x-1.5">
                    <span>You will receive:</span>
                    <img
                      className="h-4 w-4"
                      src="/icons/btc.svg"
                      alt="BTC"
                    />
                    <span className="font-bold text-theme">
                      {parseFloat(unitPrice) > 0 ? unitPrice : "0"}
                    </span>
                    {BTCPrice && parseFloat(unitPrice) > 0 ? (
                      <span className="text-xs text-secondary">
                        {`$${formatNumber(parseFloat(unitPrice) * BTCPrice, {
                          precision: 2,
                        })}`}
                      </span>
                    ) : (
                      <span className="text-xs text-secondary">$-</span>
                    )}
                  </div>
                  {!runeItem?.merged && !nonBundle && (
                    <>
                      <div className="text-sm text-red-400">
                        Warning: your rune token and inscription not in the same
                        UTXO
                      </div>
                      <div className="text-sm text-red-400">
                        Your funding will be split to 2 UTXOs
                      </div>
                    </>
                  )}
                </div>
                <div className="flex w-full justify-between space-x-4">
                  <Button
                    onClick={() => {
                      setSelectedItems([]);
                    }}
                    disabled={loading}
                    className="flex items-center justify-center border border-transparent bg-card transition-colors hover:border-theme hover:opacity-100"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Cancel"
                    )}
                  </Button>
                  <Button
                    onClick={onSubmit}
                    disabled={disableConfirm}
                    className="flex items-center justify-center"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "List"
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QuickListModal;
