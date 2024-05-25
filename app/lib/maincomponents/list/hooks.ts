import axios from "axios";
import { Psbt, networks } from "bitcoinjs-lib";
import { useMemo } from "react";
import useSWR from "swr";
import { create } from "zustand";

import { useToast } from "@/lib/hooks/useToast";
import { ValidAddressRuneAssetWithList } from "@/lib/types/rune";
import { getCollectionName, getNonBundlesCollectionName } from "@/lib/utils";
import { getInputExtra, isTestnetAddress } from "@/lib/utils/address-helpers";
import { toOutputScript } from "@/lib/utils/bitcoin-utils";
import { formatError } from "@/lib/utils/error-helpers";

import { useWallet } from "@/components/Wallet/hooks";

interface ListStore {
  action: "list" | "edit";
  setAction: (action: "list" | "edit") => void;

  selectedItems: ValidAddressRuneAssetWithList[];
  setSelectedItems: (selectedItems: ValidAddressRuneAssetWithList[]) => void;

  waitingSelectItems: ValidAddressRuneAssetWithList[];
  setWaitingSelectItems: (
    waitingSelectItems: ValidAddressRuneAssetWithList[],
  ) => void;

  unitPrice: string;
  setUnitPrice: (unitPrice: string) => void;

  fundingReceiver: string;
  setFundingReceiver: (fundingReceiver: string) => void;

  autoFillReceiver: boolean;
  setAutoFillReceiver: (autoFillReceiver: boolean) => void;

  closeCallBack: () => void;
}

export const useListStore = create<ListStore>((set) => ({
  action: "list",
  setAction: (action: "list" | "edit") => set({ action }),

  selectedItems: [],
  setSelectedItems: (selectedItems: ValidAddressRuneAssetWithList[]) =>
    set({ selectedItems }),

  waitingSelectItems: [],
  setWaitingSelectItems: (
    waitingSelectItems: ValidAddressRuneAssetWithList[],
  ) => set({ waitingSelectItems }),

  unitPrice: "",
  setUnitPrice: (unitPrice: string) => set({ unitPrice }),

  fundingReceiver: "",
  setFundingReceiver: (fundingReceiver: string) => set({ fundingReceiver }),

  autoFillReceiver: true,
  setAutoFillReceiver: (autoFillReceiver: boolean) => set({ autoFillReceiver }),

  closeCallBack: () => {
    set({
      selectedItems: [],
      waitingSelectItems: [],
      unitPrice: "",
      fundingReceiver: "",
      autoFillReceiver: true,
    });
  },
}));

export const useFloorPrice = () => {
  const { selectedItems } = useListStore();
  const { toast } = useToast();

  const firstItem = useMemo(() => {
    return selectedItems.length > 0 ? selectedItems[0] : null;
  }, [selectedItems]);

  const collectionName = useMemo(() => {
    if (!firstItem) return null;

    if (firstItem.inscription) {
      return getCollectionName(firstItem.name);
    } else {
      const name = getNonBundlesCollectionName(firstItem.name);

      return name ? name : null;
    }
  }, [firstItem]);

  const { data } = useSWR(
    collectionName ? `floor-price-${collectionName}` : null,
    async () => {
      if (!collectionName) {
        return;
      }

      try {
        const { data } = await axios.post<{
          code: number;
          error: boolean;
          data: {
            floorPrice: string;
            avgSalePrice: string;
          };
        }>("/api/floor-price", {
          collection_name: collectionName,
        });

        if (data.error) {
          throw new Error(data.code.toString());
        }

        return data.data;
      } catch (e) {
        console.log(e);
        toast({
          duration: 3000,
          variant: "destructive",
          title: "Fetch floor price failed",
          description: formatError(e),
        });
      }
    },
    {
      refreshInterval: 1000 * 10,
    },
  );

  return {
    price: data,
  };
};

export const useListFunctions = () => {
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

    const runeItem = payload.runes[0];

    if (payload.action === "list" && runeItem.listed) {
      throw new Error("Rune is already listed");
    }

    if (payload.action === "edit" && !runeItem.listed) {
      throw new Error("Rune is not listed");
    }

    const BTCPrice = parseFloat(payload.unitPrice) * 10 ** 8;

    const outputScript = toOutputScript(
      payload.receiver,
      isTestnetAddress(payload.receiver) ? networks.testnet : networks.bitcoin,
    );

    const psbt = new Psbt({
      network: isTestnetAddress(account.ordinals.address)
        ? networks.testnet
        : networks.bitcoin,
    });

    const outputValue = runeItem.merged
      ? Math.ceil(BTCPrice)
      : Math.ceil(BTCPrice / 2);

    if (outputValue < 546) {
      throw new Error("Some funding output value is less than 546 sats");
    }

    if (
      runeItem.rune.value >= outputValue ||
      (runeItem.inscription && runeItem.inscription.value >= outputValue)
    ) {
      throw new Error("Some input value is greater than output value");
    }

    if (runeItem.merged) {
      psbt.addInput({
        hash: runeItem.rune.txid,
        index: runeItem.rune.vout,
        witnessUtxo: {
          script: account.ordinals.script,
          value: runeItem.rune.value,
        },
        sighashType: 131,
        ...getInputExtra(account.ordinals),
      });

      psbt.addOutput({
        script: outputScript,
        value: outputValue,
      });
    } else {
      psbt.addInputs([
        {
          hash: runeItem.rune.txid,
          index: runeItem.rune.vout,
          witnessUtxo: {
            script: account.ordinals.script,
            value: runeItem.rune.value,
          },
          sighashType: 131,
          ...getInputExtra(account.ordinals),
        },
        {
          hash: runeItem.inscription!.txid,
          index: runeItem.inscription!.vout,
          witnessUtxo: {
            script: account.ordinals.script,
            value: runeItem.inscription!.value,
          },
          sighashType: 131,
          ...getInputExtra(account.ordinals),
        },
      ]);

      psbt.addOutputs([
        {
          script: outputScript,
          value: outputValue,
        },
        {
          script: outputScript,
          value: outputValue,
        },
      ]);
    }

    const signedPsbtHex = await connector.signPsbt(psbt.toHex(), {
      autoFinalized: false,
      toSignInputs: psbt.txInputs.map((input, index) => ({
        index,
        address: account.ordinals.address,
        sighashTypes: [131],
      })),
    });

    const { data } = await axios.post<{
      data: null;
      code: number;
      error: boolean;
    }>("/api/offer/create", {
      psbt: signedPsbtHex,
      address: account.ordinals.address,
      rune_id: runeItem.runeId,
      unit_price: BTCPrice.toString(),
    });

    if (data.error) {
      throw new Error(data.code.toString());
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

    const resp = await axios.post<{
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
    unlistOffer,
  };
};
