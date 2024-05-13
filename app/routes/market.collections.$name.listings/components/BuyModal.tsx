import { Psbt, networks } from "bitcoinjs-lib";
import { Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { pushTx } from "@/lib/apis/mempool";
import AxiosInstance from "@/lib/axios";
import { useBTCPrice } from "@/lib/hooks/useBTCPrice";
import { useSafeUTXOs } from "@/lib/hooks/useSafeUTXOs";
import { useSplitUTXO } from "@/lib/hooks/useSplitUTXO";
import { useToast } from "@/lib/hooks/useToast";
import { RuneOfferType } from "@/lib/types/market";
import { cn, formatNumber, satsToBTC } from "@/lib/utils";
import {
  detectScriptToAddressType,
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

const BuyModal: React.FC<{
  offer?: RuneOfferType;
  onClose: (invalidIds: number[]) => void;
  onSuccess: (payload: {
    txId: string;
    price: string;
    inscriptionId: string;
  }) => void;
}> = ({ offer, onClose, onSuccess }) => {
  const { BTCPrice } = useBTCPrice();
  const { toast } = useToast();
  const { account, connector, setModalOpen } = useWallet();
  const { utxos } = useSafeUTXOs();
  const { splitUTXOs } = useSplitUTXO();

  const [checking, setChecking] = useState(false);
  const [invalidOfferIds, setInvalidOfferIds] = useState<number[]>([]);
  const [feeRate, setFeeRate] = useState(0);
  const [receiver, setReceiver] = useState("");
  const [customReceiver, setCustomReceiver] = useState(false);

  const totalPrice = useMemo(() => {
    if (!offer || invalidOfferIds.length > 0) return 0;

    return parseInt(offer.totalPrice);
  }, [offer, invalidOfferIds]);

  const handleBuy = async () => {
    try {
      if (!offer || invalidOfferIds.length > 0) {
        throw new Error("No valid offer");
      }

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

      const { paddingUTXOs, feeUTXOs, splitPsbtHex } = await splitUTXOs(
        utxos,
        feeRate,
      );

      targets.push(
        {
          script: account.payment.script,
          value: paddingUTXOs.reduce((acc, utxo) => acc + utxo.value, 0),
        },
        {
          script: toOutputScript(
            receiver,
            isTestnetAddress(receiver) ? networks.testnet : networks.bitcoin,
          ),
          value: 546,
        },
      );

      const offerPsbt = Psbt.fromHex(offer.unsignedPsbt, {
        network: isTestnetAddress(offer.lister)
          ? networks.testnet
          : networks.bitcoin,
      });

      if (offerPsbt.txInputs.length > 2 || offerPsbt.txOutputs.length > 2) {
        setInvalidOfferIds([offer.id]);
        return;
      }

      for (let i = 0; i < offerPsbt.txInputs.length; i++) {
        const txInput = offerPsbt.txInputs[i];
        const witnessUTXO = offerPsbt.data.inputs[i].witnessUtxo;
        const txOutput = offerPsbt.txOutputs[i];

        if (!witnessUTXO) {
          setInvalidOfferIds([offer.id]);
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
      }

      const opReturnCode = encodeOpReturn({
        edicts: [
          {
            id: {
              block: parseInt(offer.runeId.split(":")[0]),
              tx: parseInt(offer.runeId.split(":")[1]),
            },
            output: 1,
            amount: 1n,
          },
        ],
      });

      targets.push({
        script: Buffer.from(opReturnCode, "hex"),
        value: 0,
      });

      const { feeInputs, outputs } = coinselect(
        account.payment,
        feeUTXOs,
        targets,
        feeRate,
        [
          ...paddingUTXOs.map((utxo) => ({ value: utxo.value })),
          ...offerInputData.map((input) => ({
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

      offerInputData.map((input) => {
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
      }>("/api/order/create", {
        psbt: signedPsbtHex,
        buyer: account.payment.address,
        item_receiver: receiver,
        sign_indexs: signedIndex,
        offer_ids: [offer.id],
        padding_count: paddingUTXOs.length - 1,
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

      onClose(invalidOfferIds);
      onSuccess({
        txId: data.data.txid,
        price: totalPrice.toString(),
        inscriptionId: offer?.inscriptionId,
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
    const invalidOffers = invalidOfferIds;
    setChecking(false);
    setInvalidOfferIds([]);
    setFeeRate(0);
    setReceiver("");
    setCustomReceiver(false);
    onClose(invalidOffers);
  };

  const checkOffersValidity = async () => {
    try {
      setChecking(true);

      if (!offer) return;

      const { data } = await AxiosInstance.post<{
        code: number;
        error: boolean;
        data: number[];
      }>("/api/offer/check", {
        ids: [offer.id],
      });

      if (data.error) {
        throw new Error(data.code.toString());
      }

      if (!data.data.includes(offer.id)) {
        setInvalidOfferIds([offer.id]);
        return;
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
    if (!offer) return;

    checkOffersValidity();
  }, [offer]);

  useEffect(() => {
    if (offer && account && !customReceiver) {
      setReceiver(account.ordinals.address);
    }
  }, [account, customReceiver, offer]);

  if (!offer) return null;

  return (
    <Dialog
      open={!!offer}
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>Confirm</DialogHeader>
        <div className="w-full space-y-6">
          <div className="flex w-full justify-center rounded-lg bg-primary p-4">
            <div className="relative aspect-square w-48 overflow-hidden rounded-lg bg-secondary">
              <img
                className="h-full w-full"
                src={`https://ordinals.com/content/${offer?.inscriptionId}`}
                alt={offer?.spacedName}
              />
              <div className="absolute right-2 top-2 rounded-md bg-theme px-2 py-1 text-xs text-white">
                {offer ? `# ${offer.runeId}` : ""}
              </div>
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
        <div className="flex w-full justify-end">
          <Button
            onClick={handleBuy}
            disabled={!offer || checking || invalidOfferIds.length > 0}
          >
            {checking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : invalidOfferIds.length > 0 ? (
              "Invalid Offer"
            ) : (
              "Buy"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BuyModal;
