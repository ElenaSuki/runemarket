import { useMemo } from "react";

import { useBTCPrice } from "@/lib/hooks/useBTCPrice";
import { formatAddress, formatNumber, satsToBTC } from "@/lib/utils";

import { Button } from "@/components/Button";
import CopyButton from "@/components/CopyButton";
import { Dialog, DialogContent, DialogHeader } from "@/components/Dialog";

const BuySuccessModal: React.FC<{
  payload?: {
    runeName: string;
    amount: number;
    txId: string;
    price: string;
  };
  onClose: () => void;
}> = ({ payload, onClose }) => {
  const { BTCPrice } = useBTCPrice();

  const avgPrice = useMemo(() => {
    if (!payload) return 0;

    const price = parseInt(payload.price);
    const amount = payload.amount;
    return price / amount;
  }, [payload]);

  return (
    <Dialog
      open={!!payload}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>{`Buy Success`}</DialogHeader>
        <div className="space-y-6">
          <div className="flex flex-col rounded-lg bg-primary p-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col space-y-1">
                <div className="font-medium">{payload?.runeName}</div>
                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-1 text-sm text-secondary">
                    <div>Quantity:</div>
                    <div>{formatNumber(payload?.amount || 0)}</div>
                  </div>
                  <div className="flex items-center space-x-1 text-sm text-secondary">
                    <div>Avg price:</div>
                    <div className="text-theme">{formatNumber(avgPrice)}</div>
                    <div>sats</div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end space-y-2">
                <div className="flex items-center space-x-1">
                  <img
                    className="h-4 w-4"
                    src="/icons/btc.svg"
                    alt="BTC"
                  />
                  <div className="text-sm font-medium">
                    {satsToBTC(parseFloat(payload?.price || "0"))}
                  </div>
                </div>
                <div className="text-sm text-secondary">
                  {BTCPrice
                    ? `$ ${formatNumber(parseFloat(satsToBTC(parseFloat(payload?.price || "0"))) * BTCPrice)}`
                    : "$ -"}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-4 rounded-lg bg-primary p-4 text-sm">
            <div>TX:</div>
            <a
              className="text-secondary transition-colors hover:text-theme"
              href={`https://mempool.space/zh/tx/${payload?.txId}`}
              target="_blank"
              rel="noreferrer"
            >
              {formatAddress(payload?.txId || "", 12)}
            </a>
            <CopyButton text={payload?.txId || ""} />
          </div>
          <div className="flex w-full justify-end">
            <Button onClick={onClose}>OK</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BuySuccessModal;
