import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useBTCPrice } from "@/lib/hooks/useBTCPrice";
import { useListAndBuy } from "@/lib/hooks/useListAndBuy";
import { useToast } from "@/lib/hooks/useToast";
import { RuneOfferType } from "@/lib/types/market";
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
import { useWallet } from "@/components/Wallet/hooks";

import { useFloorPrice } from "@/routes/assets.$address/hooks/useFloorPrice";

const FormSchema = z.object({
  unit_price: z.string().min(1),
  funding_receiver: z.string().min(1),
});

type FormSchemaType = z.infer<typeof FormSchema>;

const EditModal: React.FC<{
  offer?: RuneOfferType;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ onSuccess, offer, onClose }) => {
  const { price } = useFloorPrice();

  const { account } = useWallet();
  const { toast } = useToast();
  const { BTCPrice } = useBTCPrice();
  const { editByOffer } = useListAndBuy();

  const totalSelectAmount = useMemo(() => {
    if (!offer) return 0;

    return offer.amount;
  }, [offer]);

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
    if (!offer) return 0;

    return Math.ceil(offer.amount * parseFloat(watchUnitPrice));
  }, [offer, watchUnitPrice]);

  const [loading, setLoading] = useState(false);

  const onSubmit = async (value: FormSchemaType) => {
    try {
      setLoading(true);

      await editByOffer({
        offer,
        unitPrice: value.unit_price,
        receiver: value.funding_receiver,
      });

      onSuccess();
      handleClose();
      onClose();
    } catch (e) {
      console.log(e);
      toast({
        variant: "destructive",
        duration: 3000,
        title: "Edit failed",
        description: formatError(e),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = useCallback(() => {
    setCustomAddress(false);
    setLoading(false);
    form.reset();
  }, []);

  useEffect(() => {
    if (!account) {
      handleClose();
      onClose();
      return;
    }
  }, [account]);

  useEffect(() => {
    if (!offer) return;

    form.setValue("unit_price", offer.unitPrice);

    if (!customAddress) {
      form.setValue("funding_receiver", offer.fundingReceiver);
    }
  }, [offer]);

  const disableConfirm = useMemo(() => {
    if (!offer) return false;

    if (loading) return true;

    return totalSelectAmount === 0 || totalPrice === 0 || isNaN(totalPrice);
  }, [offer, totalSelectAmount, totalPrice, loading]);

  if (!offer) return null;

  return (
    <Dialog
      open={!!offer}
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <div className="space-x-1.5">Confirm</div>
        </DialogHeader>
        <div className="w-full space-y-6">
          <div className="w-full space-y-2">
            <div className="text-sm">Prev Offer Data</div>
            <div className="max-h-[30vh] w-full overflow-y-scroll rounded-lg bg-primary">
              <RuneBulkDisplay
                runes={[
                  {
                    txid: offer.txid,
                    vout: offer.vout,
                    spacedName: offer.spacedName,
                    amount: offer.amount,
                    unitPrice: offer.unitPrice,
                    totalPrice: offer.totalPrice,
                  },
                ]}
                action={"edit_confirm"}
                invalidLocation={[]}
                selectedLocation={[]}
                handleExcludeRune={(txid, vout) => {}}
                handleSelectRune={(txid, vout) => {}}
              />
            </div>
          </div>

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
                              {`Price ( sats / ${offer.symbol} )`}
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
                  <div className="flex items-center space-x-1.5">
                    <span>Prev Price:</span>
                    <img
                      className="h-4 w-4"
                      src="/icons/btc.svg"
                      alt="BTC"
                    />
                    <span className="font-bold line-through">
                      {satsToBTC(parseInt(offer.totalPrice))}
                    </span>
                    {BTCPrice && totalPrice > 0 ? (
                      <span className="text-xs text-secondary line-through">
                        {`$${formatNumber(
                          parseFloat(satsToBTC(parseInt(offer.totalPrice))) *
                            BTCPrice,
                          {
                            precision: 2,
                          },
                        )}`}
                      </span>
                    ) : (
                      <span className="text-xs text-secondary line-through">
                        $-
                      </span>
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
                      "Edit"
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

export default EditModal;
