import { useBTCPrice } from "@/lib/hooks/useBTCPrice";
import { formatAddress, formatNumber, satsToBTC } from "@/lib/utils";

import { Button } from "@/components/Button";
import CopyButton from "@/components/CopyButton";
import { Dialog, DialogContent, DialogHeader } from "@/components/Dialog";

const BuySuccessModal: React.FC<{
  payload?: {
    inscriptionId: string;
    txId: string;
    price: string;
  };
  onClose: () => void;
}> = ({ payload, onClose }) => {
  const { BTCPrice } = useBTCPrice();

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
          <div className="flex items-center justify-center rounded-lg bg-primary p-4">
            <div className="relative aspect-square w-52 overflow-hidden rounded-lg bg-secondary">
              {payload?.inscriptionId && (
                <img
                  className="h-full w-full"
                  src={`https://ordinals.com/content/${payload?.inscriptionId}`}
                  alt=""
                />
              )}

              <div className="absolute bottom-0 left-0 right-0 flex h-8 items-center justify-between bg-black/60 px-2">
                <div className="flex items-center space-x-2">
                  <img
                    className="h-4 w-4"
                    src="/icons/btc.svg"
                    alt="BTC"
                  />
                  <div className="text-sm text-white">
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
