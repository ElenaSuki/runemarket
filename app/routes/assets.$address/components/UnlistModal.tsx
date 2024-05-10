import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useBTCPrice } from "@/lib/hooks/useBTCPrice";
import { useListAndBuy } from "@/lib/hooks/useListAndBuy";
import { useToast } from "@/lib/hooks/useToast";
import { formatNumber, satsToBTC } from "@/lib/utils";
import { formatError } from "@/lib/utils/error-helpers";

import { Button } from "@/components/Button";
import { Dialog, DialogContent, DialogHeader } from "@/components/Dialog";
import RuneBulkDisplay from "@/components/RuneBulkDisplay";
import { useWallet } from "@/components/Wallet/hooks";

import { useStoreRuneAssets } from "../hooks/useFetchAddressBalance";

const UnlistModal: React.FC<{
  onSuccess: () => void;
}> = ({ onSuccess }) => {
  const {
    selectedRunes,
    waitSelectedRunes,
    action,
    setSelectedRunes,
    setWaitSelectedRunes,
  } = useStoreRuneAssets();

  const { account } = useWallet();
  const { toast } = useToast();
  const { BTCPrice } = useBTCPrice();
  const { unlistOffer } = useListAndBuy();

  const totalSelectAmount = useMemo(() => {
    return selectedRunes.reduce<number>((acc, rune) => {
      return acc + parseInt(rune.amount);
    }, 0);
  }, [selectedRunes]);

  const totalPrice = useMemo(() => {
    return selectedRunes.reduce<number>((acc, rune) => {
      return acc + Math.ceil(parseInt(rune.listed!.totalPrice));
    }, 0);
  }, [selectedRunes]);

  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    try {
      if (action !== "unlist") {
        throw new Error("Invalid action");
      }

      setLoading(true);

      const offerIds = selectedRunes.reduce<number[]>((acc, cur) => {
        if (cur.listed) {
          acc.push(cur.listed.id);
        }

        return acc;
      }, []);

      await unlistOffer({ offerIds });

      onSuccess();
      onClose();
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

  const onClose = useCallback(() => {
    setSelectedRunes([]);
    setWaitSelectedRunes([]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!account) {
      onClose();
      return;
    }
  }, [account]);

  const disableConfirm = useMemo(() => {
    if (loading) return true;

    return selectedRunes.length === 0 || totalSelectAmount === 0;
  }, [selectedRunes, totalSelectAmount, loading]);

  return (
    <Dialog
      open={waitSelectedRunes.length > 0}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <div className="space-x-1.5">
            <span>Select</span>
            <span className="font-bold text-theme">
              {waitSelectedRunes[0]?.spacedRune}
            </span>
            <span>To Unlist</span>
          </div>
        </DialogHeader>
        <div className="w-full space-y-6">
          <div className="max-h-[30vh] w-full overflow-y-scroll rounded-lg bg-primary">
            <RuneBulkDisplay
              runes={waitSelectedRunes.map((rune) => ({
                txid: rune.txid,
                vout: rune.vout,
                spacedName: rune.spacedRune,
                amount: parseInt(rune.amount),
                unitPrice: rune.listed?.unitPrice,
                totalPrice: rune.listed?.totalPrice,
              }))}
              action={"unlist"}
              invalidLocation={[]}
              selectedLocation={selectedRunes.map(
                (rune) => `${rune.txid}:${rune.vout}`,
              )}
              handleExcludeRune={(txid, vout) => {}}
              handleSelectRune={(txid, vout) => {
                const rune = waitSelectedRunes.find(
                  (rune) => rune.txid === txid && rune.vout === vout,
                );

                if (!rune) return;

                const exist = selectedRunes.find(
                  (rune) => rune.txid === txid && rune.vout === vout,
                );

                if (exist) {
                  setSelectedRunes(
                    selectedRunes.filter(
                      (rune) => rune.txid !== txid && rune.vout !== vout,
                    ),
                  );
                } else {
                  setSelectedRunes([...selectedRunes, rune]);
                }
              }}
            />
          </div>
          <div className="w-full space-y-4">
            <div className="flex flex-col items-end space-y-2">
              <div className="space-x-1.5">
                <span>Total Amount:</span>
                <span className="font-bold text-theme">
                  {formatNumber(totalSelectAmount)}
                </span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span>Total Price:</span>
                <img
                  className="h-4 w-4"
                  src="/icons/btc.svg"
                  alt="BTC"
                />
                <span className="font-bold text-theme">
                  {totalPrice > 0 ? satsToBTC(totalPrice) : "0"}
                </span>
                {BTCPrice && totalPrice > 0 ? (
                  <span className="text-xs text-secondary">
                    {`$${formatNumber(
                      parseFloat(satsToBTC(totalPrice)) * BTCPrice,
                      {
                        precision: 2,
                      },
                    )}`}
                  </span>
                ) : (
                  <span className="text-xs text-secondary">$-</span>
                )}
              </div>
            </div>
            <div className="flex w-full justify-end">
              <Button
                onClick={onSubmit}
                disabled={disableConfirm}
                className="flex items-center justify-center"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Unlist"
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UnlistModal;
