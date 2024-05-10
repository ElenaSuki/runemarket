import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useBTCPrice } from "@/lib/hooks/useBTCPrice";
import { useListAndBuy } from "@/lib/hooks/useListAndBuy";
import { useToast } from "@/lib/hooks/useToast";
import { cn, formatNumber, satsToBTC } from "@/lib/utils";
import { formatError } from "@/lib/utils/error-helpers";

import { Button } from "@/components/Button";
import { Dialog, DialogContent, DialogHeader } from "@/components/Dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/Form";
import { Input } from "@/components/Input";
import RuneBulkDisplay from "@/components/RuneBulkDisplay";
import { Slider } from "@/components/Slider";
import { useWallet } from "@/components/Wallet/hooks";

import { useStoreRuneAssets } from "../hooks/useFetchAddressBalance";
import { useFloorPrice } from "../hooks/useFloorPrice";

const FormSchema = z.object({
  unit_price: z.string().min(1),
  funding_receiver: z.string().min(1),
});

type FormSchemaType = z.infer<typeof FormSchema>;

const ListModal: React.FC<{
  onSuccess: () => void;
}> = ({ onSuccess }) => {
  const {
    selectedRunes,
    waitSelectedRunes,
    action,
    setSelectedRunes,
    setWaitSelectedRunes,
  } = useStoreRuneAssets();

  const { price } = useFloorPrice();

  const { account } = useWallet();
  const { toast } = useToast();
  const { BTCPrice } = useBTCPrice();
  const { listOffer } = useListAndBuy();

  const [excludedLocation, setExcludedLocation] = useState<string[]>([]);
  const [selectCount, setSelectCount] = useState(0);

  const validRunes = useMemo(() => {
    return waitSelectedRunes.filter(
      (rune) => !excludedLocation.includes(`${rune.txid}:${rune.vout}`),
    );
  }, [waitSelectedRunes, excludedLocation]);

  const totalSelectAmount = useMemo(() => {
    return selectedRunes.reduce<number>((acc, rune) => {
      return acc + parseInt(rune.amount);
    }, 0);
  }, [selectedRunes]);

  const form = useForm<FormSchemaType>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      unit_price: "",
      funding_receiver: account ? account.payment.address : "",
    },
    mode: "onSubmit",
  });

  const watchUnitPrice = form.watch("unit_price");
  const watchFundingReceiver = form.watch("funding_receiver");

  const [customAddress, setCustomAddress] = useState(false);

  const totalPrice = useMemo(() => {
    return selectedRunes.reduce<number>((acc, rune) => {
      return (
        acc + Math.ceil(parseInt(rune.amount) * parseFloat(watchUnitPrice))
      );
    }, 0);
  }, [selectedRunes, watchUnitPrice]);

  const [loading, setLoading] = useState(false);

  const onSubmit = async (value: FormSchemaType) => {
    try {
      if (action !== "list") {
        throw new Error("Invalid action");
      }

      setLoading(true);

      await listOffer({
        unitPrice: value.unit_price,
        receiver: value.funding_receiver,
        runes: selectedRunes,
        action: "list",
      });

      onSuccess();
      onClose();
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

  const onClose = useCallback(() => {
    setSelectedRunes([]);
    setWaitSelectedRunes([]);
    setExcludedLocation([]);
    setSelectCount(0);
    setCustomAddress(false);
    setLoading(false);
    form.reset();
  }, []);

  useEffect(() => {
    if (!account) {
      onClose();
      return;
    }

    if (!watchFundingReceiver && !customAddress) {
      form.setValue("funding_receiver", account.payment.address);
    }
  }, [account, watchFundingReceiver]);

  const disableConfirm = useMemo(() => {
    if (loading) return true;

    return (
      selectedRunes.length === 0 ||
      totalSelectAmount === 0 ||
      totalPrice === 0 ||
      isNaN(totalPrice)
    );
  }, [selectedRunes, totalSelectAmount, totalPrice, loading]);

  useEffect(() => {
    if (selectCount === 0) {
      setSelectedRunes([]);
      return;
    }

    if (validRunes.length === 0) {
      setSelectedRunes([]);
      return;
    }

    setSelectedRunes(validRunes.slice(0, selectCount));
  }, [selectCount, validRunes]);

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
            <span>To List</span>
          </div>
        </DialogHeader>
        <div className="w-full space-y-6">
          <div className="flex items-center space-x-4">
            <Slider
              step={1}
              min={0}
              max={validRunes.length}
              value={[selectCount]}
              onValueChange={([value]) => {
                setSelectCount(value);
              }}
            />
            <Input
              className="w-12"
              type="number"
              value={selectCount > 0 ? selectCount : ""}
              onChange={(e) => {
                const value = e.target.value;

                if (!value) {
                  setSelectCount(0);
                  return;
                }

                if (value.includes("e")) return;

                const intValue = parseInt(value);

                if (intValue > validRunes.length) {
                  setSelectCount(validRunes.length);
                } else {
                  setSelectCount(intValue);
                }
              }}
            />
          </div>
          {selectedRunes.length === 0 ? (
            <div className="flex h-20 w-full items-center justify-center rounded-lg bg-primary">
              No Rune Selected
            </div>
          ) : (
            <div className="max-h-[30vh] w-full overflow-y-scroll rounded-lg bg-primary">
              <RuneBulkDisplay
                runes={selectedRunes.map((rune) => ({
                  txid: rune.txid,
                  vout: rune.vout,
                  spacedName: rune.spacedRune,
                  amount: parseInt(rune.amount),
                  unitPrice: watchUnitPrice,
                  totalPrice: watchUnitPrice
                    ? Math.ceil(
                        parseInt(rune.amount) * parseFloat(watchUnitPrice),
                      ).toString()
                    : "0",
                }))}
                action={"list"}
                invalidLocation={[]}
                selectedLocation={[]}
                handleExcludeRune={(txid, vout) => {
                  setSelectCount((prev) => prev - 1);
                  setExcludedLocation((prev) => [...prev, `${txid}:${vout}`]);
                }}
                handleSelectRune={(txid, vout) => {}}
              />
            </div>
          )}

          <div className="w-full">
            <Form {...form}>
              <form
                className="space-y-4"
                onSubmit={form.handleSubmit(onSubmit)}
              >
                <div className="box-content max-h-[25vh] w-full overflow-y-scroll py-2 pr-1">
                  <div className="flex flex-col space-y-4">
                    <div className="w-full space-y-2">
                      <FormField
                        control={form.control}
                        name="unit_price"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {`Price ( sats / ${waitSelectedRunes[0]?.symbol} )`}
                            </FormLabel>
                            <FormControl>
                              <div className="relative flex items-center">
                                <Input
                                  className="pr-10"
                                  type="number"
                                  step={0.00000001}
                                  min={0}
                                  {...field}
                                />
                                <X
                                  onClick={() =>
                                    form.setValue("unit_price", "")
                                  }
                                  className={cn(
                                    "absolute right-3 h-5 w-5 cursor-pointer text-secondary transition-colors hover:text-theme",
                                    {
                                      hidden: !watchUnitPrice,
                                    },
                                  )}
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {price && (
                        <div className="space-y-1 text-xs text-secondary">
                          <div>
                            {`Floor Price: ${formatNumber(
                              parseFloat(price.floorPrice),
                            )} sats`}
                          </div>
                          <div>
                            {`Avg 3 Sales Price: ${formatNumber(
                              parseFloat(price.avgSalePrice),
                            )} sats`}
                          </div>
                        </div>
                      )}
                    </div>

                    <FormField
                      control={form.control}
                      name="funding_receiver"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Funding Receiver</FormLabel>
                          <FormControl>
                            <div className="relative flex items-center">
                              <Input
                                className="pr-10"
                                {...field}
                              />
                              <X
                                onClick={() => {
                                  setCustomAddress(true);
                                  form.setValue("funding_receiver", "");
                                }}
                                className={cn(
                                  "absolute right-3 h-5 w-5 cursor-pointer text-secondary transition-colors hover:text-theme",
                                  {
                                    hidden: !watchFundingReceiver,
                                  },
                                )}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
                <div className="flex flex-col items-end space-y-2">
                  <div className="space-x-1.5">
                    <span>Total Amount:</span>
                    <span className="font-bold text-theme">
                      {formatNumber(totalSelectAmount)}
                    </span>
                  </div>
                  <div className="space-x-1.5">
                    <span>Service Fee:</span>
                    <span className="font-bold text-theme">0</span>
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
                    disabled={disableConfirm}
                    type="submit"
                    className="flex items-center justify-center"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "List"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ListModal;
