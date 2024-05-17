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

import { useStoreRuneAssets } from "../hooks/useFetchAddressBalance";
import { useFloorPrice } from "../hooks/useFloorPrice";

const FormSchema = z.object({
  unit_price: z.string().min(1),
  funding_receiver: z.string().min(1),
});

type FormSchemaType = z.infer<typeof FormSchema>;

const CollectionListModal: React.FC<{
  onSuccess: () => void;
}> = ({ onSuccess }) => {
  const { selectedRunes, action, setSelectedRunes, setWaitSelectedRunes } =
    useStoreRuneAssets();

  const { price } = useFloorPrice();

  const { account } = useWallet();
  const { toast } = useToast();
  const { BTCPrice } = useBTCPrice();
  const { listOffer } = useListAndBuy();

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

  const isMerged = useMemo(() => {
    if (selectedRunes.length === 0) return false;

    return (
      selectedRunes[0].txid === selectedRunes[0].inscription?.txid &&
      selectedRunes[0].vout === selectedRunes[0].inscription?.vout
    );
  }, [selectedRunes]);

  const [loading, setLoading] = useState(false);

  const onSubmit = async (value: FormSchemaType) => {
    try {
      if (action !== "list" && action !== "edit") {
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
        action,
      });

      onSuccess();
      onClose();
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

  const onClose = useCallback(() => {
    setSelectedRunes([]);
    setWaitSelectedRunes([]);

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

  useEffect(() => {
    if (selectedRunes.length === 0 || action !== "edit") return;

    form.setValue(
      "unit_price",
      (parseInt(selectedRunes[0].listed!.unitPrice) / 10 ** 8).toString(),
    );

    if (!customAddress) {
      form.setValue(
        "funding_receiver",
        selectedRunes[0].listed!.fundingReceiver,
      );
    }
  }, [selectedRunes, action]);

  const disableConfirm = useMemo(() => {
    if (loading) return true;

    return selectedRunes.length === 0 || totalPrice === 0 || isNaN(totalPrice);
  }, [selectedRunes, totalPrice, loading]);

  return (
    <Dialog
      open={selectedRunes.length > 0}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <div className="space-x-1.5">
            <span>{action === "list" ? "List" : "Edit"}</span>
            <span className="font-bold text-theme">{runeItem?.spacedRune}</span>
          </div>
        </DialogHeader>
        <div className="w-full space-y-6">
          <div className="flex w-full justify-center rounded-lg bg-primary p-4">
            <div className="relative aspect-square w-48 overflow-hidden rounded-lg bg-secondary">
              <img
                className="h-full w-full"
                src={`https://ordin.s3.amazonaws.com/inscriptions/${runeItem?.inscription?.inscriptionId}`}
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
                                    parseFloat(
                                      runeItem?.listed?.unitPrice || "0",
                                    ),
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
                                  parseFloat(
                                    runeItem?.listed?.unitPrice || "0",
                                  ),
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
                          {parseFloat(watchUnitPrice) > 0
                            ? watchUnitPrice
                            : "0"}
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
                    </>
                  ) : (
                    <>
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
                          {parseFloat(watchUnitPrice) > 0
                            ? watchUnitPrice
                            : "0"}
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
                      {!isMerged && (
                        <>
                          <div className="text-sm text-red-400">
                            Warning: your rune token and inscription not in the
                            same UTXO
                          </div>
                          <div className="text-sm text-red-400">
                            Your funding will be split to 2 UTXOs
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
                <div className="flex w-full justify-end">
                  <Button
                    disabled={disableConfirm}
                    type="submit"
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
              </form>
            </Form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CollectionListModal;
