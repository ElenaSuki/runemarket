import { PlusSquare, Trash2 } from "lucide-react";

import { useBTCPrice } from "@/lib/hooks/useBTCPrice";
import { cn, formatNumber, satsToBTC } from "@/lib/utils";

const RuneBulkDisplay: React.FC<{
  runes: {
    txid: string;
    vout: number;
    spacedName: string;
    amount: number;
    unitPrice?: string;
    totalPrice?: string;
  }[];
  action: string;
  invalidLocation: string[];
  selectedLocation: string[];
  handleExcludeRune: (txid: string, vout: number) => void;
  handleSelectRune: (txid: string, vout: number) => void;
}> = ({
  runes,
  action,
  invalidLocation,
  selectedLocation,
  handleExcludeRune,
  handleSelectRune,
}) => {
  const { BTCPrice } = useBTCPrice();

  return (
    <div className="w-full divide-y">
      {runes.map((rune) => {
        return (
          <div
            key={`${rune.txid}:${rune.vout}`}
            className={cn(
              "relative flex w-full items-center justify-between bg-primary p-2",
            )}
          >
            <div className="space-y-2">
              <div className="text-sm">{rune.spacedName}</div>
              <div className="flex items-center space-x-3 text-xs text-secondary">
                <div className="flex items-center space-x-1">
                  <div>Quantity:</div>
                  <div>{formatNumber(rune.amount)}</div>
                </div>
                {rune.unitPrice && (
                  <div className="flex items-center space-x-1">
                    <div>Unit price:</div>
                    <div className="text-theme">
                      {formatNumber(parseFloat(rune.unitPrice), {
                        precision: 6,
                      })}
                    </div>
                    <div>sats</div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end space-y-2">
              {rune.totalPrice && (
                <div className="flex items-center space-x-2">
                  <img
                    className="h-4 w-4"
                    src="/icons/btc.svg"
                    alt="BTC"
                  />
                  <div className="text-sm">
                    {satsToBTC(parseInt(rune.totalPrice))}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-end space-x-2">
                {rune.totalPrice && (
                  <div className="text-xs text-secondary">
                    {BTCPrice
                      ? `$ ${formatNumber(
                          parseFloat(satsToBTC(parseInt(rune.totalPrice))) *
                            BTCPrice,
                          {
                            precision: 2,
                          },
                        )}`
                      : "$ -"}
                  </div>
                )}
                {["edit", "unlist"].includes(action) &&
                  !action.includes("confirm") && (
                    <>
                      {selectedLocation.includes(
                        `${rune.txid}:${rune.vout}`,
                      ) ? (
                        <Trash2
                          className="h-4 w-4 cursor-pointer text-red-400"
                          onClick={() => handleSelectRune(rune.txid, rune.vout)}
                        />
                      ) : (
                        <PlusSquare
                          className="h-4 w-4 cursor-pointer text-theme"
                          onClick={() => handleSelectRune(rune.txid, rune.vout)}
                        />
                      )}
                    </>
                  )}
                {["buy", "list"].includes(action) &&
                  !action.includes("confirm") && (
                    <Trash2
                      className="h-4 w-4 cursor-pointer text-red-400"
                      onClick={() => handleExcludeRune(rune.txid, rune.vout)}
                    />
                  )}
              </div>
            </div>
            {invalidLocation.includes(`${rune.txid}:${rune.vout}`) && (
              <div className="absolute bottom-0 left-0 right-0 top-0 flex items-center justify-center bg-red-400 opacity-25">
                Invalid
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default RuneBulkDisplay;
