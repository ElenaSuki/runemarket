import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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

  const [loading, setLoading] = useState(false);

  const onSubmit = async (value: FormSchemaType) => {
    try {
      setLoading(true);

      await editByOffer({
        offer,
        unitPrice: (parseFloat(value.unit_price) * 10 ** 8).toString(),
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

    form.setValue(
      "unit_price",
      (parseFloat(offer.unitPrice) / 10 ** 8).toString(),
    );

    if (!customAddress) {
      form.setValue("funding_receiver", offer.fundingReceiver);
    }
  }, [offer]);

  if (!offer) return null;

  return (
    <Dialog
      open={!!offer}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <div className="space-x-1.5">Confirm</div>
        </DialogHeader>
        <div className="w-full space-y-6">
          <div className="flex w-full justify-center rounded-lg bg-primary p-4">
            <div className="relative aspect-square w-48 overflow-hidden rounded-lg bg-secondary">
              <img
                className="h-full w-full"
                src={`https://ordin.s3.amazonaws.com/inscriptions/${offer?.inscriptionId}`}
                alt={offer?.spacedName}
              />
              <div className="absolute right-2 top-2 rounded-md bg-theme px-2 py-1 text-xs text-white">
                {offer ? `# ${offer.runeId}` : ""}
              </div>
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
                            <FormLabel>{`BTC Price`}</FormLabel>
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
                  <div className="flex items-center space-x-1.5">
                    <span>Prev Price:</span>
                    <img
                      className="h-4 w-4"
                      src="/icons/btc.svg"
                      alt="BTC"
                    />
                    <span className="font-bold line-through">
                      {parseFloat(offer.unitPrice) > 0
                        ? formatNumber(
                            parseFloat(satsToBTC(parseFloat(offer.unitPrice))),
                            {
                              precision: 8,
                            },
                          )
                        : "0"}
                    </span>
                    {BTCPrice && parseFloat(offer.unitPrice) > 0 ? (
                      <span className="text-xs text-secondary line-through">
                        {`$${formatNumber(
                          parseFloat(satsToBTC(parseFloat(offer.unitPrice))) *
                            BTCPrice,
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
                      {parseFloat(watchUnitPrice) > 0 ? watchUnitPrice : "0"}
                    </span>
                    {BTCPrice && parseFloat(watchUnitPrice) > 0 ? (
                      <span className="text-xs text-secondary">
                        {`$${formatNumber(
                          parseFloat(watchUnitPrice) * BTCPrice,
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
                    disabled={loading || !offer}
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
