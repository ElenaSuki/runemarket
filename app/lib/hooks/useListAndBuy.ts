import { Psbt, networks } from "bitcoinjs-lib";

import { useWallet } from "@/components/Wallet/hooks";

import AxiosInstance from "../axios";
import { RuneOfferType } from "../types/market";
import { ValidAddressRuneAssetWithList } from "../types/rune";
import { getInputExtra, isTestnetAddress } from "../utils/address-helpers";
import { toOutputScript } from "../utils/bitcoin-utils";

export const useListAndBuy = () => {
  const { account, connector, setModalOpen } = useWallet();

  const listOffer = async (payload: {
    unitPrice: string;
    receiver: string;
    runes: ValidAddressRuneAssetWithList[];
    action: "list" | "edit";
  }) => {
    if (!account || !connector) {
      setModalOpen(true);
      return;
    }

    if (payload.runes.length === 0) {
      throw new Error("No runes selected");
    }

    const runeAsset = payload.runes[0];

    const outputScript = toOutputScript(
      payload.receiver,
      isTestnetAddress(payload.receiver) ? networks.testnet : networks.bitcoin,
    );

    const psbt = new Psbt({
      network: isTestnetAddress(account.ordinals.address)
        ? networks.testnet
        : networks.bitcoin,
    });

    for (const rune of payload.runes) {
      if (payload.action === "edit" && !rune.listed) continue;

      if (payload.action === "list" && rune.listed) continue;

      if (rune.type === "nft" && rune.inscription) {
        const outputValue =
          rune.inscription.txid === rune.txid &&
          rune.inscription.vout === rune.vout
            ? Math.ceil(parseInt(rune.amount) * parseFloat(payload.unitPrice))
            : Math.ceil(
                (parseInt(rune.amount) * parseFloat(payload.unitPrice)) / 2,
              );

        if (outputValue < 546) {
          throw new Error("Some funding output value is less than 546 sats");
        }

        if (rune.value >= outputValue) {
          throw new Error("Some input value is greater than output value");
        }

        if (rune.inscription.value >= outputValue) {
          throw new Error("Some input value is greater than output value");
        }

        if (
          rune.inscription.txid === rune.txid &&
          rune.inscription.vout === rune.vout
        ) {
          psbt.addInput({
            hash: rune.txid,
            index: rune.vout,
            witnessUtxo: {
              script: account.ordinals.script,
              value: rune.value,
            },
            sighashType: 131,
            ...getInputExtra(account.ordinals),
          });

          psbt.addOutput({
            script: outputScript,
            value: outputValue,
          });
        } else {
          psbt.addInput({
            hash: rune.inscription.txid,
            index: rune.inscription.vout,
            witnessUtxo: {
              script: account.ordinals.script,
              value: rune.inscription.value,
            },
            sighashType: 131,
            ...getInputExtra(account.ordinals),
          });

          psbt.addInput({
            hash: rune.txid,
            index: rune.vout,
            witnessUtxo: {
              script: account.ordinals.script,
              value: rune.value,
            },
            sighashType: 131,
            ...getInputExtra(account.ordinals),
          });

          psbt.addOutput({
            script: outputScript,
            value: outputValue,
          });

          psbt.addOutput({
            script: outputScript,
            value: outputValue,
          });
        }
      } else {
        const outputValue = Math.ceil(
          parseInt(rune.amount) * parseFloat(payload.unitPrice),
        );

        if (outputValue < 546) {
          throw new Error("Some funding output value is less than 546 sats");
        }

        if (rune.value >= outputValue) {
          throw new Error("Some input value is greater than output value");
        }

        psbt.addInput({
          hash: rune.txid,
          index: rune.vout,
          witnessUtxo: {
            script: account.ordinals.script,
            value: rune.value,
          },
          sighashType: 131,
          ...getInputExtra(account.ordinals),
        });

        psbt.addOutput({
          script: outputScript,
          value: outputValue,
        });
      }
    }

    const signedPsbtHex = await connector.signPsbt(psbt.toHex(), {
      autoFinalized: false,
      toSignInputs: psbt.txInputs.map((input, index) => ({
        index,
        address: account.ordinals.address,
        sighashTypes: [131],
      })),
    });

    const { data } = await AxiosInstance.post<{
      data: null;
      code: number;
      error: boolean;
    }>(
      runeAsset.type === "nft"
        ? "/api/offer/collection/create"
        : "/api/offer/create",
      {
        psbt: signedPsbtHex,
        address: account.ordinals.address,
        rune_id: runeAsset.runeId,
        unit_price: payload.unitPrice,
      },
    );

    if (data.error) {
      throw new Error(data.code.toString());
    }
  };

  const editByOffer = async (payload: {
    offer?: RuneOfferType;
    unitPrice: string;
    receiver: string;
  }) => {
    if (!account || !connector) {
      setModalOpen(true);
      return;
    }

    if (!payload.offer) {
      throw new Error("No offer selected");
    }

    const outputScript = toOutputScript(
      payload.receiver,
      isTestnetAddress(payload.receiver) ? networks.testnet : networks.bitcoin,
    );

    const offerPsbt = Psbt.fromHex(payload.offer.unsignedPsbt);

    const outputValue =
      offerPsbt.txInputs.length === 1
        ? Math.ceil(payload.offer.amount * parseFloat(payload.unitPrice))
        : Math.ceil((payload.offer.amount * parseFloat(payload.unitPrice)) / 2);

    if (outputValue < 546) {
      throw new Error("Some funding output value is less than 546 sats");
    }

    if (offerPsbt.txInputs.length === 1) {
      const witnessUTXO = offerPsbt.data.inputs[0].witnessUtxo;

      if (!witnessUTXO) {
        throw new Error("No witness UTXO found");
      }

      const psbt = new Psbt({
        network: isTestnetAddress(account.ordinals.address)
          ? networks.testnet
          : networks.bitcoin,
      });

      psbt.addInput({
        hash: payload.offer.txid,
        index: payload.offer.vout,
        witnessUtxo: witnessUTXO,
        sighashType: 131,
        ...getInputExtra(account.ordinals),
      });

      psbt.addOutput({
        script: outputScript,
        value: outputValue,
      });

      const signedPsbtHex = await connector.signPsbt(psbt.toHex(), {
        autoFinalized: false,
        toSignInputs: psbt.txInputs.map((input, index) => ({
          index,
          address: account.ordinals.address,
          sighashTypes: [131],
        })),
      });

      const { data } = await AxiosInstance.post<{
        data: null;
        code: number;
        error: boolean;
      }>(
        payload.offer.inscriptionId
          ? "/api/offer/collection/create"
          : "/api/offer/create",
        {
          psbt: signedPsbtHex,
          address: account.ordinals.address,
          rune_id: payload.offer.runeId,
          unit_price: payload.unitPrice,
        },
      );

      if (data.error) {
        throw new Error(data.code.toString());
      }
    } else if (offerPsbt.txInputs.length === 2) {
      const psbt = new Psbt({
        network: isTestnetAddress(account.ordinals.address)
          ? networks.testnet
          : networks.bitcoin,
      });

      for (let i = 0; i < offerPsbt.data.inputs.length; i++) {
        const inputData = offerPsbt.data.inputs[i];
        const witnessUTXO = inputData.witnessUtxo;
        const txInput = offerPsbt.txInputs[i];

        if (!witnessUTXO) {
          throw new Error("No witness UTXO found");
        }

        psbt.addInput({
          hash: txInput.hash,
          index: txInput.index,
          witnessUtxo: witnessUTXO,
          sighashType: 131,
          ...getInputExtra(account.ordinals),
        });

        psbt.addOutput({
          script: outputScript,
          value: outputValue,
        });
      }

      const signedPsbtHex = await connector.signPsbt(psbt.toHex(), {
        autoFinalized: false,
        toSignInputs: psbt.txInputs.map((input, index) => ({
          index,
          address: account.ordinals.address,
          sighashTypes: [131],
        })),
      });

      const { data } = await AxiosInstance.post<{
        data: null;
        code: number;
        error: boolean;
      }>("/api/offer/collection/create", {
        psbt: signedPsbtHex,
        address: account.ordinals.address,
        rune_id: payload.offer.runeId,
        unit_price: payload.unitPrice,
      });

      if (data.error) {
        throw new Error(data.code.toString());
      }
    } else {
      throw new Error("Invalid offer");
    }
  };

  const unlistOffer = async (payload: { offerIds: number[] }) => {
    if (!account || !connector) {
      setModalOpen(true);
      return;
    }

    if (payload.offerIds.length === 0) {
      throw new Error("No offer selected");
    }

    const message = `unlist offers ${payload.offerIds.join(",")} by ${account.ordinals.address}`;

    const signature = await connector.signMessage(
      message,
      account.ordinals.type === "p2tr" ? "bip322-simple" : "ecdsa",
    );

    const resp = await AxiosInstance.post<{
      data: null;
      code: number;
      error: boolean;
    }>("/api/offer/unlist", {
      address: account.ordinals.address,
      signature,
      pubkey: account.ordinals.pubkey.toString("hex"),
      address_type: account.ordinals.type,
      offers: payload.offerIds,
    });

    if (resp.data.error) {
      throw new Error(resp.data.code.toString());
    }
  };

  return {
    listOffer,
    editByOffer,
    unlistOffer,
  };
};
