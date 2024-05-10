import { Psbt } from "bitcoinjs-lib";
import { Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getTransaction, pushTx } from "@/lib/apis/mempool";
import AxiosInstance from "@/lib/axios";
import { useToast } from "@/lib/hooks/useToast";
import { UTXO } from "@/lib/types";
import { AddressRuneAsset } from "@/lib/types/rune";
import {
  calculateTotalFee,
  cn,
  formatAddress,
  formatNumber,
} from "@/lib/utils";
import { getInputExtra, isTestnetAddress } from "@/lib/utils/address-helpers";
import {
  coinselect,
  estimateTxVbytes,
  toOutputScript,
} from "@/lib/utils/bitcoin-utils";
import { formatError } from "@/lib/utils/error-helpers";

import { Button } from "@/components/Button";
import CopyButton from "@/components/CopyButton";
import GasFeeSelector from "@/components/GasFeeSelector";
import { Input } from "@/components/Input";
import { useWallet } from "@/components/Wallet/hooks";

export default function RBFPage() {
  const { account, connector, setModalOpen } = useWallet();
  const { toast } = useToast();

  const [selectedUTXO, setSelectedUTXO] = useState<UTXO>();
  const [txid, setTxid] = useState("");
  const [pushedTxid, setPushedTxid] = useState("");
  const [prevGasFee, setPrevGasFee] = useState(0);
  const [feeRate, setFeeRate] = useState(0);
  const [step, setStep] = useState<"input" | "confirm" | "success">("input");

  const [loading, setLoading] = useState(false);

  const totalFee = useMemo(() => {
    const vsize = estimateTxVbytes(2, 2);

    return feeRate * vsize;
  }, [feeRate]);

  const fetchTransaction = async () => {
    if (!account) {
      setModalOpen(true);
      return;
    }

    try {
      setLoading(true);

      if (!txid) {
        throw new Error("Transaction hash is required");
      }

      const transaction = await getTransaction(txid, account.payment.network);

      if (!transaction) {
        throw new Error("Transaction not found");
      }

      if (transaction.status.confirmed) {
        throw new Error("Transaction is already confirmed");
      }

      let matchedUTXO: UTXO | undefined = undefined;

      for (const input of transaction.vin) {
        if (input.prevout.scriptpubkey_address === account.payment.address) {
          matchedUTXO = {
            txid: input.txid,
            vout: input.vout,
            value: input.prevout.value,
          };

          break;
        }
      }

      if (!matchedUTXO) {
        throw new Error("Each input does not match account address");
      }

      const totalFee = await calculateTotalFee(
        account.payment.network,
        transaction.txid,
        0,
      );

      setSelectedUTXO(matchedUTXO);
      setPrevGasFee(totalFee);
      setStep("confirm");
    } catch (e) {
      console.log(e);
      toast({
        variant: "destructive",
        duration: 3000,
        title: "Check transaction failed",
        description: formatError(e),
      });
    } finally {
      setLoading(false);
    }
  };

  const buildTransaction = async () => {
    if (!account || !connector) {
      setModalOpen(true);
      return;
    }

    try {
      if (step !== "confirm") {
        throw new Error("Invalid step");
      }

      if (!selectedUTXO) {
        throw new Error("UTXO to be canceled not found");
      }

      if (prevGasFee >= totalFee) {
        throw new Error("Fee rate must be higher than prev fee rate");
      }

      setLoading(true);

      const [utxos, runeUTXOs] = await Promise.all([
        AxiosInstance.post<{
          code: number;
          error: boolean;
          data: {
            txid: string;
            vout: number;
            value: number;
          }[];
        }>("/api/address/utxos", {
          address: account.payment.address,
          network: isTestnetAddress(account.payment.address)
            ? "testnet"
            : "bitcoin",
        }),
        AxiosInstance.post<{
          code: number;
          error: boolean;
          data: AddressRuneAsset[];
        }>("/api/address/rune-utxos", {
          address: account.payment.address,
          network: isTestnetAddress(account.payment.address)
            ? "testnet"
            : "bitcoin",
        }),
      ]);

      if (utxos.data.error) {
        throw new Error(utxos.data.code.toString());
      }

      if (runeUTXOs.data.error) {
        throw new Error(runeUTXOs.data.code.toString());
      }

      const availableUTXOs = utxos.data.data.filter((utxo) => {
        return !runeUTXOs.data.data.find(
          (runeUTXO) =>
            runeUTXO.txid === utxo.txid && runeUTXO.vout === utxo.vout,
        );
      });

      const { feeInputs, outputs } = coinselect(
        account.payment,
        availableUTXOs,
        [
          {
            script: toOutputScript(
              account.payment.address,
              account.payment.network,
            ),
            value: selectedUTXO.value,
          },
        ],
        feeRate,
        [
          {
            value: selectedUTXO.value,
          },
        ],
      );

      const psbt = new Psbt({
        network: account.payment.network,
      });

      psbt.addInput({
        hash: selectedUTXO.txid,
        index: selectedUTXO.vout,
        witnessUtxo: {
          script: account.payment.script,
          value: selectedUTXO.value,
        },
        ...getInputExtra(account.payment),
      });

      feeInputs.forEach((input) => {
        psbt.addInput(input);
      });

      outputs.forEach((output) => {
        psbt.addOutput(output);
      });

      const signedPsbt = await connector.signPsbt(psbt.toHex(), {
        autoFinalized: true,
      });

      const rawTx = Psbt.fromHex(signedPsbt).extractTransaction().toHex();

      const refund = psbt.txOutputs.length > 1 ? psbt.txOutputs[1] : undefined;

      const pushedTx = await pushTx(account.payment.network, rawTx);

      if (refund) {
        const storeUTXOs = window.localStorage.getItem(
          `${account.payment.address}-utxos`,
        );

        if (storeUTXOs) {
          try {
            const utxos: { txid: string; vout: number; value: number }[] =
              JSON.parse(storeUTXOs);

            utxos.push({
              txid: pushedTx,
              vout: 1,
              value: refund.value,
            });

            window.localStorage.setItem(
              `${account.payment.address}-utxos`,
              JSON.stringify(utxos),
            );
          } catch (e) {}
        } else {
          const utxos: { txid: string; vout: number; value: number }[] = [];
          utxos.push({
            txid: pushedTx,
            vout: 1,
            value: refund.value,
          });
          window.localStorage.setItem(
            `${account.payment.address}-utxos`,
            JSON.stringify(utxos),
          );
        }
      }

      setPushedTxid(pushedTx);
      setStep("success");
    } catch (e) {
      console.log(e);
      toast({
        variant: "destructive",
        duration: 3000,
        title: "Build transaction failed",
        description: formatError(e),
      });
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setSelectedUTXO(undefined);
    setPrevGasFee(0);
    setFeeRate(0);
    setStep("input");
    setTxid("");
    setPushedTxid("");
    setLoading(false);
  };

  useEffect(() => {
    if (!account) {
      clear();
    }
  }, [account]);

  return (
    <div className="mx-auto flex w-full max-w-screen-sm flex-col items-center justify-center space-y-6 rounded-lg bg-secondary px-6 py-8">
      {step === "input" && (
        <>
          <div className="w-full text-center text-lg font-medium">
            Input Transaction Hash To Start RBF
          </div>
          <div className="text-sm text-red-400">
            Warning: you can only replace a transaction that contains your UTXO
            input.
          </div>
          <div className="relative flex w-full items-center">
            <Input
              className="bg-primary pr-10 transition-colors focus:bg-card"
              value={txid}
              onChange={(e) => setTxid(e.target.value)}
            />
            <X
              onClick={() => {
                setTxid("");
              }}
              className={cn(
                "absolute right-3 h-5 w-5 cursor-pointer text-secondary transition-colors hover:text-theme",
                {
                  hidden: !txid,
                },
              )}
            />
          </div>
          <div className="flex w-full justify-end">
            <Button
              disabled={loading}
              onClick={() => fetchTransaction()}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Next"}
            </Button>
          </div>
        </>
      )}
      {step === "confirm" && (
        <>
          <div className="w-full space-y-6 rounded-lg bg-card p-4">
            <div className="space-y-2">
              <div className="font-medium">Transaction Hash</div>
              <div className="break-all text-sm text-secondary">{txid}</div>
            </div>
            <div className="space-y-2">
              <div className="font-medium">UTXO Value</div>
              <div className="break-all text-sm text-secondary">
                {selectedUTXO ? formatNumber(selectedUTXO.value) : 0}
              </div>
            </div>
          </div>
          <GasFeeSelector
            feeRate={feeRate}
            onFeeRateChange={(feeRate) => setFeeRate(feeRate)}
          />
          <div className="flex w-full flex-col items-end space-y-2">
            <div className="flex w-full items-center justify-end space-x-1 text-sm">
              <div>Prev network fee:</div>
              <div className="line-through">{formatNumber(prevGasFee)}</div>
              <div>sats</div>
            </div>
            <div className="flex w-full items-center justify-end space-x-1 text-sm">
              <div>Current network fee:</div>
              <div
                className={cn("text-sm", {
                  "text-red-400": totalFee <= prevGasFee,
                  "text-green-400": totalFee > prevGasFee,
                })}
              >
                {formatNumber(totalFee)}
              </div>
              <div>sats</div>
            </div>
          </div>
          <div className="flex w-full justify-between">
            <Button
              variant="primary"
              onClick={() => setStep("input")}
            >
              Prev
            </Button>
            <Button
              disabled={loading || !selectedUTXO || prevGasFee >= totalFee}
              onClick={() => buildTransaction()}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Confirm"
              )}
            </Button>
          </div>
        </>
      )}
      {step === "success" && (
        <>
          <div className="w-full space-y-2 rounded-lg bg-card p-4">
            <div className="w-full text-center font-medium">
              Transaction Pushed
            </div>
            <div className="flex items-center justify-center space-x-2">
              <a
                href={`https://mempool.space/tx/${pushedTxid}`}
                target="_blank"
                className="text-sm text-secondary transition-colors hover:text-theme"
                rel="noreferrer"
              >
                {formatAddress(pushedTxid, 12)}
              </a>
              <CopyButton text={pushedTxid} />
            </div>
          </div>
          <div className="flex w-full justify-end">
            <Button onClick={clear}>OK</Button>
          </div>
        </>
      )}
    </div>
  );
}
