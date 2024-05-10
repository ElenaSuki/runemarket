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
import { useWallet } from "@/components/Wallet/hooks";

import { useStoreRuneAssets } from "@/routes/assets.$address/hooks/useFetchAddressBalance";
import { useFloorPrice } from "@/routes/assets.$address/hooks/useFloorPrice";

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

  const [step, setStep] = useState<"select" | "confirm">("select");

  const runeItem = useMemo(() => {
    return selectedRunes.length > 0 ? selectedRunes[0] : null;
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
    if (selectedRunes.length === 0) return 0;

    return Math.ceil(parseFloat(watchUnitPrice) * 10 ** 8);
  }, [selectedRunes, watchUnitPrice]);

  const [loading, setLoading] = useState(false);

  const onSubmit = async (value: FormSchemaType) => {
    try {
      if (action !== "list") {
        throw new Error("Invalid action");
      }

      if (!runeItem) {
        throw new Error("No rune selected");
      }

      setLoading(true);

      await listOffer({
        unitPrice: (parseFloat(value.unit_price) * 10 ** 8).toString(),
        receiver: value.funding_receiver,
        runes: [runeItem],
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

    setStep("select");
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

    return selectedRunes.length === 0 || totalPrice === 0 || isNaN(totalPrice);
  }, [selectedRunes, totalPrice, loading]);

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
            <span>{step === "select" ? "Select Item To List" : "Confirm"}</span>
          </div>
        </DialogHeader>
        {step === "select" && (
          <div className="w-full">
            <div className="flex max-h-[40vh] flex-col space-y-4 overflow-y-scroll rounded-lg bg-primary p-3">
              {waitSelectedRunes.map((rune) => (
                <div
                  onClick={() => {
                    setSelectedRunes([rune]);
                    setStep("confirm");
                  }}
                  key={rune.runeId}
                  className="flex w-full cursor-pointer items-center space-x-4 rounded-lg border border-transparent transition-colors hover:border-theme hover:bg-secondary"
                >
                  <div className="relative aspect-square w-16 overflow-hidden rounded-lg bg-secondary">
                    <img
                      className="h-full w-full"
                      src={`https://ordinals.com/content/${rune.inscription?.inscriptionId}`}
                      alt={rune.spacedRune}
                    />
                  </div>
                  <div className="space-y-2">
                    <div>{rune.spacedRune}</div>
                    <div className="text-sm text-secondary">{`# ${rune.runeId}`}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {step === "confirm" && (
          <div className="w-full space-y-6">
            <div className="flex w-full justify-center rounded-lg bg-primary p-4">
              <div className="relative aspect-square w-48 overflow-hidden rounded-lg bg-secondary">
                <img
                  className="h-full w-full"
                  src={`https://ordinals.com/content/${runeItem?.inscription?.inscriptionId}`}
                  alt={runeItem?.spacedRune}
                />
                <div className="absolute right-2 top-2 rounded-md bg-theme px-2 py-1 text-xs text-white">
                  {runeItem ? `# ${runeItem.runeId}` : ""}
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
                                parseFloat(
                                  satsToBTC(parseInt(price.floorPrice)),
                                ),
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
                  <div className="flex w-full justify-between">
                    <Button
                      variant="primary"
                      disabled={loading}
                      onClick={() => {
                        setStep("select");
                        setSelectedRunes([]);
                      }}
                      className="flex items-center justify-center"
                    >
                      Prev
                    </Button>
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
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ListModal;
