import { Psbt } from "bitcoinjs-lib";

import { useWallet } from "@/components/Wallet/hooks";

import { UTXO } from "../types";
import { getInputExtra } from "../utils/address-helpers";
import { estimateTxVbytes } from "../utils/bitcoin-utils";

export const useSplitUTXO = () => {
  const { account, connector } = useWallet();

  const splitUTXOs = async (utxos: UTXO[], feeRate: number) => {
    if (!account || !connector) {
      throw new Error("Wallet not connected");
    }

    const sortedUTXOs = utxos.sort((a, b) => a.value - b.value);

    if (
      sortedUTXOs.length > 2 &&
      sortedUTXOs[0].value <= 1000 &&
      sortedUTXOs[1].value <= 1000
    ) {
      return {
        paddingUTXOs: sortedUTXOs.slice(0, 2),
        feeUTXOs: sortedUTXOs.slice(2),
      };
    }

    const paddingUnitValue = 600;
    let splitPsbt: Psbt | undefined;
    let consumedUTXO: UTXO | undefined;
    for (let i = 2; i <= 11; i++) {
      const transactionFee = Math.ceil(estimateTxVbytes(1, i) * feeRate);

      const matchedUTXO = sortedUTXOs.find(
        (utxo) => utxo.value >= transactionFee + paddingUnitValue * i,
      );

      if (!matchedUTXO) break;

      consumedUTXO = matchedUTXO;
      const psbt = new Psbt({ network: account.payment.network });

      psbt.addInput({
        hash: matchedUTXO.txid,
        index: matchedUTXO.vout,
        witnessUtxo: {
          value: matchedUTXO.value,
          script: account.payment.script,
        },
        ...getInputExtra(account.payment),
      });

      for (let j = 0; j < i - 1; j++) {
        psbt.addOutput({
          address: account.payment.address,
          value: paddingUnitValue,
        });
      }
      psbt.addOutput({
        address: account.payment.address,
        value: matchedUTXO.value - transactionFee - paddingUnitValue * (i - 1),
      });

      splitPsbt = psbt;
    }

    if (!splitPsbt || !consumedUTXO) {
      throw new Error("Have no available UTXO to pad transaction.");
    }

    const signedPsbtHex = await connector.signPsbt(splitPsbt.toHex(), {
      autoFinalized: true,
      toSignInputs: splitPsbt.data.inputs.map((_, index) => ({
        index,
        address: account.payment.address,
      })),
    });

    const txid = Psbt.fromHex(signedPsbtHex).extractTransaction().getId();

    const createdUTXOs = splitPsbt.txOutputs.map((output, index) => ({
      txid,
      vout: index,
      value: output.value,
      script_pubkey: output.script.toString("hex"),
    }));

    return {
      paddingUTXOs: createdUTXOs.slice(0, 2),
      feeUTXOs: [
        ...utxos.filter(
          (utxo) =>
            utxo.txid !== consumedUTXO?.txid ||
            utxo.vout !== consumedUTXO?.vout,
        ),
        ...createdUTXOs.slice(2),
      ],
      splitPsbtHex: signedPsbtHex,
    };
  };

  return {
    splitUTXOs,
  };
};
