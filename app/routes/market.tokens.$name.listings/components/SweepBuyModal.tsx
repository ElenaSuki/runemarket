import { Psbt, networks } from "bitcoinjs-lib";
import { Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { checkUTXOBalance } from "@/lib/apis/unisat/api";
import AxiosInstance from "@/lib/axios";
import { useBTCPrice } from "@/lib/hooks/useBTCPrice";
import { useSafeUTXOs } from "@/lib/hooks/useSafeUTXOs";
import { useToast } from "@/lib/hooks/useToast";
import { RuneOfferType } from "@/lib/types/market";
import { cn, formatNumber, satsToBTC, sleep } from "@/lib/utils";
import {
  detectScriptToAddressType,
  isTestnetAddress,
  reverseBuffer,
} from "@/lib/utils/address-helpers";
import { coinselect, toOutputScript } from "@/lib/utils/bitcoin-utils";
import { formatError } from "@/lib/utils/error-helpers";
import { encodeOpReturn } from "@/lib/utils/runes-builder";
import { Edict, RuneStone } from "@/lib/utils/runes-builder/type";

import { Button } from "@/components/Button";
import { Dialog, DialogContent, DialogHeader } from "@/components/Dialog";
import GasFeeSelector from "@/components/GasFeeSelector";
import { Input } from "@/components/Input";
import RuneBulkDisplay from "@/components/RuneBulkDisplay";
import { Slider } from "@/components/Slider";
import { useWallet } from "@/components/Wallet/hooks";

const SweepBuyModal: React.FC<{
  open: boolean;
  offers: RuneOfferType[];
  onClose: (invalidOfferLocation: string[]) => void;
  onSuccess: (payload: {
    txId: string;
    amount: number;
    price: string;
    runeName: string;
  }) => void;
}> = ({ open, onClose, offers, onSuccess }) => {
  const { BTCPrice } = useBTCPrice();
  const { toast } = useToast();
  const { account, connector, setModalOpen } = useWallet();
  const { utxos } = useSafeUTXOs();

  const [step, setStep] = useState<"select" | "confirm">("select");
  const [selectedOffers, setSelectedOffers] = useState<RuneOfferType[]>([]);
  const [excludedOffersId, setExcludedOffersId] = useState<number[]>([]);
  const [selectCount, setSelectCount] = useState(0);
  const [checking, setChecking] = useState(false);
  const [invalidOfferLocation, setInvalidOfferLocation] = useState<string[]>(
    [],
  );
  const [feeRate, setFeeRate] = useState(0);
  const [receiver, setReceiver] = useState("");
  const [customReceiver, setCustomReceiver] = useState(false);

  const [avgAmount, setAvgAmount] = useState("0");

  const runeName = useMemo(() => {
    if (offers.length === 0) return "";

    return offers[0].spacedName;
  }, [offers]);

  const maxCount = useMemo(() => {
    return offers.length - excludedOffersId.length > 20
      ? 20
      : offers.length - excludedOffersId.length;
  }, [offers, excludedOffersId]);

  const totalPrice = useMemo(() => {
    return selectedOffers
      .filter(
        (offer) =>
          !invalidOfferLocation.includes(`${offer.txid}:${offer.vout}`),
      )
      .reduce((acc, offer) => {
        return acc + parseInt(offer.totalPrice);
      }, 0);
  }, [selectedOffers, invalidOfferLocation]);

  const totalQuantity = useMemo(() => {
    return selectedOffers
      .filter(
        (offer) =>
          !invalidOfferLocation.includes(`${offer.txid}:${offer.vout}`),
      )
      .reduce((acc, offer) => {
        return acc + offer.amount;
      }, 0);
  }, [selectedOffers, invalidOfferLocation]);

  const remainQuantity = useMemo(() => {
    const intAvgAmount = parseInt(avgAmount);
    if (intAvgAmount === 0) return 0;

    return totalQuantity % intAvgAmount;
  }, [totalQuantity, avgAmount]);

  const splitOutputCount = useMemo(() => {
    const intAvgAmount = parseInt(avgAmount);
    if (intAvgAmount === 0) return 0;

    return (
      Math.floor(totalQuantity / intAvgAmount) + (remainQuantity > 0 ? 1 : 0)
    );
  }, [totalQuantity, avgAmount, remainQuantity]);

  const handleSelectOffer = (count: number) => {
    setSelectCount(count);

    const selected = offers
      .filter((offer) => {
        return !excludedOffersId.includes(offer.id);
      })
      .slice(0, count);

    setSelectedOffers(selected);
  };

  const handleExcludeOffer = (txid: string, vout: number) => {
    const offer = offers.find(
      (offer) => offer.txid === txid && offer.vout === vout,
    );

    if (!offer) return;

    setExcludedOffersId((prev) => [...prev, offer.id]);
    const newCount = selectCount - 1;
    handleSelectOffer(newCount);
  };

  const handleBuy = async () => {
    try {
      if (!account || !connector) {
        setModalOpen(true);
        return;
      }

      if (!receiver) {
        throw new Error("Receiver is required");
      }

      if (!utxos) {
        throw new Error("No UTXO available");
      }

      const validOffers = selectedOffers.filter(
        (offer) =>
          !invalidOfferLocation.includes(`${offer.txid}:${offer.vout}`),
      );

      if (validOffers.length === 0) {
        throw new Error("No valid offer");
      }

      setChecking(true);

      const psbt = new Psbt({
        network: account.payment.network,
      });

      const offerInputData: {
        txid: string;
        index: number;
        witnessUTXO: {
          script: Buffer;
          value: number;
        };
      }[] = [];

      const targets: {
        script: Buffer;
        value: number;
      }[] = [];

      // check if split output
      if (splitOutputCount > 1) {
        const payload: RuneStone = {};

        const rune = selectedOffers[0];
        const [runeBlock, runeIndex] = selectedOffers[0].runeId.split(":");

        if (remainQuantity > 0) {
          const amount = BigInt(avgAmount) * 10n ** BigInt(rune.divisibility);
          const remain =
            BigInt(remainQuantity) * 10n ** BigInt(rune.divisibility);

          const edicts: Edict[] = [];

          for (let i = 0; i < splitOutputCount; i++) {
            edicts.push({
              id: {
                block: parseInt(runeBlock),
                tx: parseInt(runeIndex),
              },
              amount,
              output: i + validOffers.length + 1,
            });
          }

          edicts.push({
            id: {
              block: parseInt(runeBlock),
              tx: parseInt(runeIndex),
            },
            amount: remain,
            output: edicts[edicts.length - 1].output + 1,
          });

          payload.edicts = edicts;
        } else {
          const amount = BigInt(avgAmount) * 10n ** BigInt(rune.divisibility);

          const edicts: Edict[] = [];

          for (let i = 0; i < splitOutputCount; i++) {
            edicts.push({
              id: {
                block: parseInt(runeBlock),
                tx: parseInt(runeIndex),
              },
              amount,
              output: i + validOffers.length + 1,
            });
          }

          payload.edicts = edicts;
        }

        const encoded = encodeOpReturn(payload);

        targets.push({
          script: Buffer.from(encoded, "hex"),
          value: 0,
        });
      } else {
        targets.push({
          script: toOutputScript(
            receiver,
            isTestnetAddress(receiver) ? networks.testnet : networks.bitcoin,
          ),
          value: 546,
        });
      }

      validOffers.forEach((offer) => {
        const offerPsbt = Psbt.fromHex(offer.unsignedPsbt, {
          network: isTestnetAddress(offer.lister)
            ? networks.testnet
            : networks.bitcoin,
        });

        if (
          offerPsbt.txInputs.length !== 1 ||
          offerPsbt.txOutputs.length !== 1
        ) {
          setInvalidOfferLocation((prev) => [
            ...prev,
            `${offer.txid}:${offer.vout}`,
          ]);
          return;
        }

        const txInput = offerPsbt.txInputs[0];
        const witnessUTXO = offerPsbt.data.inputs[0].witnessUtxo;
        const txOutput = offerPsbt.txOutputs[0];

        if (!witnessUTXO) {
          setInvalidOfferLocation((prev) => [
            ...prev,
            `${offer.txid}:${offer.vout}`,
          ]);
          return;
        }

        offerInputData.push({
          txid: reverseBuffer(txInput.hash).toString("hex"),
          index: txInput.index,
          witnessUTXO: {
            script: witnessUTXO.script,
            value: witnessUTXO.value,
          },
        });

        targets.push({
          script: txOutput.script,
          value: txOutput.value,
        });
      });

      // split rune
      if (splitOutputCount > 1) {
        for (let i = 0; i < splitOutputCount; i++) {
          targets.push({
            script: toOutputScript(
              receiver,
              isTestnetAddress(receiver) ? networks.testnet : networks.bitcoin,
            ),
            value: 546,
          });
        }
      }

      const { feeInputs, outputs } = coinselect(
        account.payment,
        utxos,
        targets,
        feeRate,
        offerInputData.map((input) => ({
          value: input.witnessUTXO.value,
        })),
      );

      const signedIndex: number[] = [];

      psbt.addInput(feeInputs[0]);
      signedIndex.push(0);

      offerInputData.map((input) => {
        psbt.addInput({
          hash: input.txid,
          index: input.index,
          witnessUtxo: input.witnessUTXO,
          sighashType: 131,
          sequence: 0xffffffff,
        });
      });

      if (feeInputs.length > 1) {
        feeInputs.slice(1).forEach((input) => {
          psbt.addInput(input);
          signedIndex.push(psbt.inputCount - 1);
        });
      }

      outputs.forEach((output) => {
        psbt.addOutput(output);
      });

      const signedPsbtHex = await connector.signPsbt(psbt.toHex(), {
        autoFinalized: false,
        toSignInputs: signedIndex.map((index) => ({
          index,
          address: account.payment.address,
        })),
      });

      const { data } = await AxiosInstance.post<{
        code: number;
        error: boolean;
        data: {
          txid: string;
        };
      }>("/api/order/create", {
        psbt: signedPsbtHex,
        buyer: account.payment.address,
        item_receiver: receiver,
        sign_indexs: signedIndex,
        offer_ids: selectedOffers.map((offer) => offer.id),
        padding_count: 0,
      });

      if (data.error) {
        throw new Error(data.code.toString());
      }

      const signedPsbt = Psbt.fromHex(signedPsbtHex);
      const lastVout = signedPsbt.txOutputs[signedPsbt.txOutputs.length - 1];
      const lastVoutAddress = detectScriptToAddressType(
        lastVout.script.toString("hex"),
      );

      if (lastVout.value > 546 && lastVoutAddress === account.payment.address) {
        const storeUTXOs = window.localStorage.getItem(
          `${account.payment.address}-utxos`,
        );

        if (storeUTXOs) {
          try {
            const utxos: { txid: string; vout: number; value: number }[] =
              JSON.parse(storeUTXOs);

            utxos.push({
              txid: data.data.txid,
              vout: signedPsbt.txOutputs.length - 1,
              value: lastVout.value,
            });

            window.localStorage.setItem(
              `${account.payment.address}-utxos`,
              JSON.stringify(utxos),
            );
          } catch (e) {}
        } else {
          const utxos: { txid: string; vout: number; value: number }[] = [];
          utxos.push({
            txid: data.data.txid,
            vout: signedPsbt.txOutputs.length - 1,
            value: lastVout.value,
          });
          window.localStorage.setItem(
            `${account.payment.address}-utxos`,
            JSON.stringify(utxos),
          );
        }
      }

      onClose(invalidOfferLocation);
      onSuccess({
        txId: data.data.txid,
        amount: totalQuantity,
        price: totalPrice.toString(),
        runeName,
      });
    } catch (e) {
      toast({
        variant: "destructive",
        duration: 3000,
        title: "Buy failed",
        description: formatError(e),
      });
    } finally {
      setChecking(false);
    }
  };

  const handleClose = () => {
    const invalidOffers = invalidOfferLocation;

    setStep("select");
    setSelectedOffers([]);
    setExcludedOffersId([]);
    setSelectCount(0);
    setChecking(false);
    setInvalidOfferLocation([]);
    setFeeRate(0);
    setReceiver("");
    setCustomReceiver(false);
    onClose(invalidOffers);
  };

  const checkOffersValidity = async () => {
    try {
      setChecking(true);

      const chunk: RuneOfferType[][] = [];

      for (let i = 0; i < selectedOffers.length; i += 3) {
        chunk.push(selectedOffers.slice(i, i + 3));
      }

      for (const offerList of chunk) {
        await sleep(1500);
        const result = await Promise.all(
          offerList.map((offer) =>
            checkUTXOBalance(
              isTestnetAddress(offer.lister)
                ? networks.testnet
                : networks.bitcoin,
              offer.txid,
              offer.vout,
            ),
          ),
        );

        result.forEach((rune, index) => {
          if (rune.length !== 1) {
            setInvalidOfferLocation((prev) => [
              ...prev,
              `${offerList[index].txid}:${offerList[index].vout}`,
            ]);
            return;
          }

          if (rune[0].runeId !== offerList[index].runeId) {
            setInvalidOfferLocation((prev) => [
              ...prev,
              `${offerList[index].txid}:${offerList[index].vout}`,
            ]);
            return;
          }

          const amount =
            BigInt(rune[0].amount) / 10n ** BigInt(rune[0].divisibility);

          if (parseInt(amount.toString()) !== offerList[index].amount) {
            setInvalidOfferLocation((prev) => [
              ...prev,
              `${offerList[index].txid}:${offerList[index].vout}`,
            ]);
            return;
          }
        });
      }
    } catch (e) {
      toast({
        variant: "destructive",
        duration: 3000,
        title: "Check offer validity failed",
        description: formatError(e),
      });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (step === "confirm") {
      checkOffersValidity();
    }
  }, [step]);

  useEffect(() => {
    if (account && !customReceiver) {
      setReceiver(account.ordinals.address);
    }
  }, [account, customReceiver]);

  useEffect(() => {
    setAvgAmount(totalQuantity.toString());
  }, [totalQuantity]);

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          {step === "select" ? `Sweep ${runeName}` : "Confirm"}
        </DialogHeader>
        {step === "select" && (
          <>
            <div className="w-full space-y-6">
              <div className="flex items-center space-x-4">
                <Slider
                  step={1}
                  min={0}
                  max={maxCount}
                  value={[selectCount]}
                  onValueChange={([value]) => {
                    handleSelectOffer(value);
                  }}
                />
                <Input
                  className="w-12"
                  type="number"
                  value={selectCount}
                  onChange={(e) => {
                    const value = e.target.value;

                    if (!value) return;

                    if (value.includes("e")) return;

                    const intValue = parseInt(value);

                    if (intValue > maxCount) {
                      handleSelectOffer(maxCount);
                    } else {
                      handleSelectOffer(intValue);
                    }
                  }}
                />
              </div>
              <div className="flex h-40 w-full overflow-y-scroll rounded-lg border">
                {selectedOffers.length > 0 ? (
                  <RuneBulkDisplay
                    runes={selectedOffers}
                    action="buy"
                    invalidLocation={[]}
                    selectedLocation={[]}
                    handleExcludeRune={handleExcludeOffer}
                    handleSelectRune={() => {}}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    No Offer Selected
                  </div>
                )}
              </div>
            </div>
            <div className="flex w-full items-center justify-between space-x-2">
              <Button
                variant="primary"
                onClick={handleClose}
              >
                Cancel
              </Button>
              <Button
                disabled={selectedOffers.length === 0}
                onClick={() => {
                  setStep("confirm");
                }}
              >
                Confirm
              </Button>
            </div>
          </>
        )}
        {step === "confirm" && (
          <>
            <div className="w-full space-y-6">
              <div className="flex h-40 w-full overflow-y-scroll rounded-lg border">
                <RuneBulkDisplay
                  runes={selectedOffers}
                  action="buy_confirm"
                  invalidLocation={invalidOfferLocation}
                  selectedLocation={[]}
                  handleExcludeRune={() => {}}
                  handleSelectRune={() => {}}
                />
              </div>
              <div className="w-full space-y-2">
                <div>Receiver</div>
                <div className="relative flex items-center">
                  <Input
                    className="pr-10"
                    value={receiver}
                    onChange={(e) => setReceiver(e.target.value)}
                  />
                  <X
                    onClick={() => {
                      setCustomReceiver(true);
                      setReceiver("");
                    }}
                    className={cn(
                      "absolute right-3 h-5 w-5 cursor-pointer text-secondary transition-colors hover:text-theme",
                      {
                        hidden: !receiver,
                      },
                    )}
                  />
                </div>
                <div>Per Output Amount</div>
                <div className="relative flex items-center">
                  <Input
                    className="pr-10"
                    type="number"
                    step={1}
                    min={0}
                    max={totalQuantity}
                    value={avgAmount === "0" ? "" : avgAmount}
                    onChange={(e) => {
                      if (!e.target.value) {
                        setAvgAmount("0");
                        return;
                      }

                      if (e.target.value.includes("e")) return;

                      const intValue = parseInt(e.target.value);

                      if (intValue > totalQuantity) {
                        setAvgAmount(totalQuantity.toString());
                      } else {
                        setAvgAmount(e.target.value);
                      }
                    }}
                  />
                  <X
                    onClick={() => {
                      setAvgAmount("0");
                    }}
                    className={cn(
                      "absolute right-3 h-5 w-5 cursor-pointer text-secondary transition-colors hover:text-theme",
                      {
                        hidden: avgAmount === "0",
                      },
                    )}
                  />
                </div>
                <div>Gas Fee</div>
                <GasFeeSelector
                  feeRate={feeRate}
                  onFeeRateChange={(feeRate) => setFeeRate(feeRate)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex w-full items-center justify-between space-x-2">
                <div className="text-sm">Total Quantity</div>
                <div className="text-sm">{formatNumber(totalQuantity)}</div>
              </div>
              <div className="flex w-full items-center justify-between space-x-2">
                <div className="text-sm">Split Quantity</div>
                <div className="text-sm">
                  {remainQuantity > 0
                    ? `${formatNumber(splitOutputCount - 1)} count × ${formatNumber(parseInt(avgAmount))} quantity + ${formatNumber(remainQuantity)} quantity`
                    : `${formatNumber(splitOutputCount)} count × ${formatNumber(parseInt(avgAmount))} quantity`}
                </div>
              </div>
              <div className="flex w-full items-center justify-between space-x-2">
                <div className="text-sm">Service Fee</div>
                <div className="text-sm">0</div>
              </div>
              <div className="flex w-full items-center justify-between space-x-2">
                <div className="text-sm">Total Price</div>

                <div className="flex items-center space-x-2">
                  <img
                    className="h-4 w-4"
                    src="/icons/btc.svg"
                    alt="BTC"
                  />
                  <div className="text-sm text-theme">
                    {satsToBTC(parseInt(totalPrice.toString()))}
                  </div>
                  {BTCPrice ? (
                    <div className="text-sm text-secondary">
                      {`$ ${formatNumber(
                        parseFloat(satsToBTC(totalPrice)) * BTCPrice,
                        { precision: 2 },
                      )}`}
                    </div>
                  ) : (
                    <div className="text-sm text-secondary">$ -</div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex w-full items-center justify-between space-x-2">
              <Button
                variant="primary"
                onClick={() => setStep("select")}
              >
                Prev
              </Button>
              <Button
                onClick={handleBuy}
                disabled={
                  selectedOffers.length === 0 ||
                  checking ||
                  invalidOfferLocation.length === selectedOffers.length
                }
              >
                {checking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Buy"
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SweepBuyModal;
