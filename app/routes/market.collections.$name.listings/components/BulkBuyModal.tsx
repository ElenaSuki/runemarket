import { Psbt, networks } from "bitcoinjs-lib";
import { Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { pushTx } from "@/lib/apis/mempool";
import AxiosInstance from "@/lib/axios";
import { SERVICE_FEE_ADDRESS } from "@/lib/config";
import { useBTCPrice } from "@/lib/hooks/useBTCPrice";
import { useSafeUTXOs } from "@/lib/hooks/useSafeUTXOs";
import { useSplitUTXO } from "@/lib/hooks/useSplitUTXO";
import { useToast } from "@/lib/hooks/useToast";
import { RuneOfferType } from "@/lib/types/market";
import { cn, formatNumber, satsToBTC } from "@/lib/utils";
import {
  getInputExtra,
  isTestnetAddress,
  reverseBuffer,
} from "@/lib/utils/address-helpers";
import { coinselect, toOutputScript } from "@/lib/utils/bitcoin-utils";
import { formatError } from "@/lib/utils/error-helpers";
import { encodeOpReturn } from "@/lib/utils/runes-builder";

import { Button } from "@/components/Button";
import { Dialog, DialogContent, DialogHeader } from "@/components/Dialog";
import GasFeeSelector from "@/components/GasFeeSelector";
import { Input } from "@/components/Input";
import { useWallet } from "@/components/Wallet/hooks";

const BulkBuyModal: React.FC<{
  open: boolean;
  setOpen: (open: boolean) => void;
  offers: RuneOfferType[];
  onClose: (invalidIds: number[]) => void;
  onSuccess: (payload: {
    txId: string;
    price: string;
    inscriptionIds: string[];
  }) => void;
}> = ({ open, setOpen, offers, onClose, onSuccess }) => {
  const { toast } = useToast();
  const { account, connector, setModalOpen } = useWallet();
  const { BTCPrice } = useBTCPrice();
  const { utxos } = useSafeUTXOs();
  const { splitUTXOs } = useSplitUTXO();

  const [checking, setChecking] = useState(false);
  const [invalidOfferIds, setInvalidOfferIds] = useState<number[]>([]);
  const [feeRate, setFeeRate] = useState(0);
  const [receiver, setReceiver] = useState("");
  const [customReceiver, setCustomReceiver] = useState(false);

  const totalCount = useMemo(
    () => offers.length - invalidOfferIds.length,
    [offers, invalidOfferIds],
  );
  const validOffers = useMemo(
    () => offers.filter((offer) => !invalidOfferIds.includes(offer.id)),
    [offers, invalidOfferIds],
  );
  const totalPrice = useMemo(
    () =>
      validOffers.reduce((acc, offer) => acc + parseInt(offer.unitPrice), 0),
    [validOffers],
  );

  const serviceFee = useMemo(() => {
    return Math.floor(totalPrice / 100);
  }, [totalPrice]);

  const checkOffersValidity = async () => {
    try {
      setChecking(true);

      if (offers.length === 0) return;

      const { data } = await AxiosInstance.post<{
        code: number;
        error: boolean;
        data: number[];
      }>("/api/offer/check", {
        ids: offers.map((offer) => offer.id),
      });

      if (data.error) {
        throw new Error(data.code.toString());
      }

      offers.forEach((offer) => {
        if (!data.data.includes(offer.id)) {
          setInvalidOfferIds((prev) => [...prev, offer.id]);
        }
      });
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

  const handleBuy = async () => {
    if (!account || !connector) {
      setModalOpen(true);
      return;
    }

    try {
      if (validOffers.length === 0) {
        throw new Error("No valid offers");
      }

      if (!receiver) {
        throw new Error("Receiver is required");
      }

      if (!utxos) {
        throw new Error("No UTXO available");
      }

      setChecking(true);

      const { paddingUTXOs, feeUTXOs, splitPsbtHex } = await splitUTXOs(
        utxos,
        feeRate,
        totalCount + 1,
      );

      const psbt = new Psbt({
        network: account.payment.network,
      });

      const offerInscriptionInputData: Map<
        string,
        {
          txid: string;
          index: number;
          witnessUTXO: {
            script: Buffer;
            value: number;
          };
        }
      > = new Map();

      const offerRuneInputData: Map<
        string,
        {
          txid: string;
          index: number;
          witnessUTXO: {
            script: Buffer;
            value: number;
          };
        }
      > = new Map();

      const targets: {
        script: Buffer;
        value: number;
      }[] = [];

      targets.push({
        script: account.payment.script,
        value: paddingUTXOs.reduce((acc, utxo) => acc + utxo.value, 0),
      });

      const itemOutput: {
        script: Buffer;
        value: number;
      }[] = [];

      const inscriptionPaymentOutput: {
        script: Buffer;
        value: number;
      }[] = [];

      const runePaymentOutput: {
        script: Buffer;
        value: number;
      }[] = [];

      const sortedOffers = validOffers.sort((a, b) => {
        const [aBlock, aTx] = a.runeId.split(":");
        const [bBlock, bTx] = b.runeId.split(":");

        if (parseInt(aBlock) !== parseInt(bBlock)) {
          return parseInt(aBlock) - parseInt(bBlock);
        }
        return parseInt(aTx) - parseInt(bTx);
      });

      sortedOffers.forEach((offer) => {
        const offerPsbt = Psbt.fromHex(offer.unsignedPsbt, {
          network: isTestnetAddress(offer.lister)
            ? networks.testnet
            : networks.bitcoin,
        });

        if (offerPsbt.txInputs.length > 2 || offerPsbt.txOutputs.length > 2) {
          setInvalidOfferIds((prev) => [...prev, offer.id]);
          return;
        }

        for (let i = 0; i < offerPsbt.txInputs.length; i++) {
          const txInput = offerPsbt.txInputs[i];
          const witnessUTXO = offerPsbt.data.inputs[i].witnessUtxo;
          const txOutput = offerPsbt.txOutputs[i];

          if (!witnessUTXO) {
            setInvalidOfferIds((prev) => [...prev, offer.id]);
            return;
          }

          const reverseTxid = reverseBuffer(txInput.hash).toString("hex");

          if (offerPsbt.txInputs.length === 1) {
            offerInscriptionInputData.set(offer.id.toString(), {
              txid: reverseTxid,
              index: txInput.index,
              witnessUTXO: {
                script: witnessUTXO.script,
                value: witnessUTXO.value,
              },
            });

            offerRuneInputData.set(offer.id.toString(), {
              txid: reverseTxid,
              index: txInput.index,
              witnessUTXO: {
                script: witnessUTXO.script,
                value: witnessUTXO.value,
              },
            });

            itemOutput.push({
              script: toOutputScript(
                receiver,
                isTestnetAddress(receiver)
                  ? networks.testnet
                  : networks.bitcoin,
              ),
              value: witnessUTXO.value,
            });
            inscriptionPaymentOutput.push({
              script: txOutput.script,
              value: txOutput.value,
            });
          } else {
            if (i === 0) {
              offerInscriptionInputData.set(offer.id.toString(), {
                txid: reverseTxid,
                index: txInput.index,
                witnessUTXO: {
                  script: witnessUTXO.script,
                  value: witnessUTXO.value,
                },
              });
              itemOutput.push({
                script: toOutputScript(
                  receiver,
                  isTestnetAddress(receiver)
                    ? networks.testnet
                    : networks.bitcoin,
                ),
                value: witnessUTXO.value,
              });
              inscriptionPaymentOutput.push({
                script: txOutput.script,
                value: txOutput.value,
              });
            } else if (i === 1) {
              offerRuneInputData.set(offer.id.toString(), {
                txid: reverseTxid,
                index: txInput.index,
                witnessUTXO: {
                  script: witnessUTXO.script,
                  value: witnessUTXO.value,
                },
              });
              runePaymentOutput.push({
                script: txOutput.script,
                value: txOutput.value,
              });
            }
          }
        }
      });

      targets.push(
        ...itemOutput,
        ...inscriptionPaymentOutput,
        ...runePaymentOutput,
        {
          script: toOutputScript(SERVICE_FEE_ADDRESS),
          value: serviceFee,
        },
      );

      const opReturnCode = encodeOpReturn({
        edicts: sortedOffers.map((offer, index) => ({
          id: {
            block: parseInt(offer.runeId.split(":")[0]),
            tx: parseInt(offer.runeId.split(":")[1]),
          },
          output: index + 1,
          amount: 0n,
        })),
      });

      targets.push({
        script: Buffer.from(opReturnCode, "hex"),
        value: 0,
      });

      const inscriptionInputs = Array.from(offerInscriptionInputData.values());
      const runeInputs = Array.from(offerRuneInputData.values());
      const notSameInputs = runeInputs.filter((input) => {
        const match = inscriptionInputs.find((inscriptionInput) => {
          return (
            inscriptionInput.txid === input.txid &&
            inscriptionInput.index === input.index
          );
        });

        return !match;
      });

      const { feeInputs, outputs } = coinselect(
        account.payment,
        feeUTXOs,
        targets,
        feeRate,
        [
          ...paddingUTXOs.map((utxo) => ({ value: utxo.value })),
          ...inscriptionInputs.map((input) => ({
            value: input.witnessUTXO.value,
          })),
          ...notSameInputs.map((input) => ({
            value: input.witnessUTXO.value,
          })),
        ],
      );

      const signedIndex: number[] = [];

      paddingUTXOs.forEach((utxo, index) => {
        signedIndex.push(index);

        psbt.addInput({
          hash: utxo.txid,
          index: utxo.vout,
          witnessUtxo: {
            value: utxo.value,
            script: account.payment.script,
          },
          ...getInputExtra(account.payment),
        });
      });

      inscriptionInputs.map((input) => {
        psbt.addInput({
          hash: input.txid,
          index: input.index,
          witnessUtxo: input.witnessUTXO,
          sighashType: 131,
          sequence: 0xffffffff,
        });
      });

      notSameInputs.map((input) => {
        psbt.addInput({
          hash: input.txid,
          index: input.index,
          witnessUtxo: input.witnessUTXO,
          sighashType: 131,
          sequence: 0xffffffff,
        });
      });

      feeInputs.forEach((input) => {
        psbt.addInput(input);
        signedIndex.push(psbt.inputCount - 1);
      });

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

      if (splitPsbtHex) {
        const signedSplitPsbt = Psbt.fromHex(splitPsbtHex);

        await pushTx(
          account.payment.network,
          signedSplitPsbt.extractTransaction().toHex(),
        );
      }

      const { data } = await AxiosInstance.post<{
        code: number;
        error: boolean;
        data: {
          txid: string;
        };
      }>("/api/order/bulk/create", {
        psbt: signedPsbtHex,
        buyer: account.payment.address,
        item_receiver: receiver,
        sign_indexs: signedIndex,
        offer_ids: validOffers.map((offer) => offer.id),
      });

      if (data.error) {
        throw new Error(data.code.toString());
      }

      const signedPsbt = Psbt.fromHex(signedPsbtHex);
      const lastVout = signedPsbt.txOutputs[signedPsbt.txOutputs.length - 1];

      if (lastVout.value > 546) {
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

      onSuccess({
        txId: data.data.txid,
        price: totalPrice.toString(),
        inscriptionIds: validOffers.map((offer) => offer.inscriptionId),
      });
      onClose(invalidOfferIds);
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
    const invalidOffers = invalidOfferIds;
    setChecking(false);
    setInvalidOfferIds([]);
    setFeeRate(0);
    setReceiver("");
    setCustomReceiver(false);
    onClose(invalidOffers);
    setOpen(false);
  };

  useEffect(() => {
    if (open && offers.length > 0) {
      checkOffersValidity();
    }
  }, [open, offers]);

  useEffect(() => {
    if (offers.length !== 0 && account && !customReceiver) {
      setReceiver(account.ordinals.address);
    }
  }, [account, customReceiver, offers]);

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
        <DialogHeader>Confirm</DialogHeader>
        <div className="w-full space-y-6">
          <div className="w-full overflow-hidden rounded-lg bg-primary">
            <div className="max-h-[200px] w-full divide-y overflow-y-scroll">
              {offers.map((offer) => (
                <div
                  key={offer.id}
                  className="relative flex w-full items-center justify-between p-2"
                >
                  <div className="space-y-2">
                    {offer.inscriptionId && (
                      <img
                        className="h-12 w-12 rounded-lg"
                        src={`https://ordinals.com/content/${offer.inscriptionId}`}
                        alt={offer.spacedName}
                      />
                    )}

                    <div className="text-sm">{offer.spacedName}</div>
                  </div>
                  <div className="flex flex-col items-end space-y-2">
                    <div className="flex items-center space-x-2">
                      <img
                        className="h-4 w-4"
                        src="/icons/btc.svg"
                        alt="BTC"
                      />
                      <div className="text-sm">
                        {satsToBTC(parseInt(offer.unitPrice))}
                      </div>
                    </div>

                    <div className="flex items-center justify-end space-x-2">
                      <div className="text-xs text-secondary">
                        {BTCPrice
                          ? `$ ${formatNumber(
                              parseFloat(satsToBTC(parseInt(offer.unitPrice))) *
                                BTCPrice,
                              {
                                precision: 2,
                              },
                            )}`
                          : "$ -"}
                      </div>
                    </div>
                  </div>
                  {invalidOfferIds.includes(offer.id) && (
                    <div className="absolute bottom-0 left-0 right-0 top-0 flex items-center justify-center bg-red-400 opacity-25">
                      Invalid
                    </div>
                  )}
                </div>
              ))}
            </div>
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
            <div>Gas Fee</div>
            <GasFeeSelector
              feeRate={feeRate}
              onFeeRateChange={(feeRate) => setFeeRate(feeRate)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex w-full items-center justify-between space-x-2">
            <div className="text-sm">Service Fee (1%)</div>
            <div className="text-sm">{serviceFee} sats</div>
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
        <div className="flex w-full justify-end">
          <Button
            onClick={handleBuy}
            disabled={checking || totalCount === 0}
          >
            {checking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : totalCount === 0 ? (
              "No valid offers"
            ) : (
              "Buy"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BulkBuyModal;
