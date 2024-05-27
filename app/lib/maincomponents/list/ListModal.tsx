import { AlertCircle, Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useBTCPrice } from "@/lib/hooks/useBTCPrice";
import { useToast } from "@/lib/hooks/useToast";
import { cn, formatNumber, satsToBTC } from "@/lib/utils";
import { formatError } from "@/lib/utils/error-helpers";

import { Button } from "@/components/Button";
import { Dialog, DialogContent, DialogHeader } from "@/components/Dialog";
import { Input } from "@/components/Input";
import { useWallet } from "@/components/Wallet/hooks";

import { useFloorPrice, useListFunctions, useListStore } from "./hooks";

const ListModal: React.FC<{
  successCallBack: () => void;
}> = ({ successCallBack }) => {
  const {
    action,
    selectedItems,
    unitPrice,
    setUnitPrice,
    fundingReceiver,
    setFundingReceiver,
    autoFillReceiver,
    setAutoFillReceiver,
    closeCallBack,
  } = useListStore();

  const { price } = useFloorPrice();
  const { listOffer } = useListFunctions();
  const { account } = useWallet();
  const { toast } = useToast();
  const { BTCPrice } = useBTCPrice();

  const [loading, setLoading] = useState(false);

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
        action,
      });

      successCallBack();
      closeCallBack();
    } catch (e) {
      console.log(e);
      toast({
        variant: "destructive",
        duration: 3000,
        title: action === "list" ? "List failed" : "Edit failed",
        description: formatError(e),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!account) {
      closeCallBack();
      return;
    }

    if (!runeItem) return;

    if (action === "list") {
      if (autoFillReceiver) {
        setFundingReceiver(account.payment.address);
      }
    } else {
      setUnitPrice((parseInt(runeItem.listed!.unitPrice) / 10 ** 8).toString());
      if (autoFillReceiver) {
        setFundingReceiver(runeItem.listed!.fundingReceiver);
      }
    }
  }, [runeItem, account]);

  return (
    <Dialog
      open={!!runeItem}
      onOpenChange={(open) => {
        if (!open) {
          closeCallBack();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <div className="space-x-1.5">
            <span>{action === "list" ? "List" : "Edit"}</span>
            <span className="font-bold text-theme">{runeItem?.name || ""}</span>
          </div>
        </DialogHeader>
        <div className="w-full space-y-6">
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
            </>
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
                          parseFloat(satsToBTC(parseInt(price.avgSalePrice))),
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
              {action === "edit" ? (
                <>
                  <div className="flex items-center space-x-1.5">
                    <span>Prev Price:</span>
                    <img
                      className="h-4 w-4"
                      src="/icons/btc.svg"
                      alt="BTC"
                    />
                    <span className="font-bold line-through">
                      {parseFloat(runeItem?.listed?.unitPrice || "0") > 0
                        ? formatNumber(
                            parseFloat(
                              satsToBTC(
                                parseFloat(runeItem?.listed?.unitPrice || "0"),
                              ),
                            ),
                            {
                              precision: 8,
                            },
                          )
                        : "0"}
                    </span>
                    {BTCPrice &&
                    parseFloat(runeItem?.listed?.unitPrice || "0") > 0 ? (
                      <span className="text-xs text-secondary line-through">
                        {`$${formatNumber(
                          parseFloat(
                            satsToBTC(
                              parseFloat(runeItem?.listed?.unitPrice || "0"),
                            ),
                          ) * BTCPrice,
                          {
                            precision: 2,
                          },
                        )}`}
                      </span>
                    ) : (
                      <span className="text-xs text-secondary">$-</span>
                    )}
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span>New Price:</span>
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
                </>
              ) : (
                <>
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
                    <div className="flex items-center space-x-2 rounded-lg bg-red-700 p-2">
                      <AlertCircle className="h-4 w-4 shrink-0 text-white" />
                      <div className="text-sm text-white">
                        Your rune token and inscription not in the same UTXO,
                        therefore, your funding will be split to 2 UTXOs.
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex w-full justify-end">
              <Button
                onClick={onSubmit}
                disabled={disableConfirm}
                className="flex items-center justify-center"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : action === "list" ? (
                  "List"
                ) : (
                  "Edit"
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ListModal;
