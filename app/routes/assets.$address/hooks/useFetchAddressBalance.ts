import { networks } from "bitcoinjs-lib";
import { useEffect } from "react";
import useSWR from "swr";
import { create } from "zustand";

import { getUTXOsInMempool } from "@/lib/apis/mempool";
import AxiosInstance from "@/lib/axios";
import { useToast } from "@/lib/hooks/useToast";
import { ValidAddressRuneAssetWithList } from "@/lib/types/rune";
import { isTestnetAddress } from "@/lib/utils/address-helpers";
import { formatError } from "@/lib/utils/error-helpers";

import { useWallet } from "@/components/Wallet/hooks";

interface RuneAssetStore {
  selectedRunes: ValidAddressRuneAssetWithList[];
  waitSelectedRunes: ValidAddressRuneAssetWithList[];
  action: "list" | "unlist" | "edit";
  type: "token" | "collection";

  setSelectedRunes: (rune: ValidAddressRuneAssetWithList[]) => void;
  setWaitSelectedRunes: (rune: ValidAddressRuneAssetWithList[]) => void;
  setAction: (action: "list" | "unlist" | "edit") => void;
  setType: (type: "token" | "collection") => void;
}

export const useStoreRuneAssets = create<RuneAssetStore>((set) => ({
  selectedRunes: [],
  waitSelectedRunes: [],
  action: "list",
  type: "token",

  setSelectedRunes: (rune) => set({ selectedRunes: rune }),
  setWaitSelectedRunes: (rune) => set({ waitSelectedRunes: rune }),
  setAction: (action) => set({ action }),
  setType: (type) => set({ type }),
}));

export const useFetchAddressBalance = (address: string) => {
  const { toast } = useToast();
  const { account } = useWallet();

  const { data, mutate, isLoading, isValidating } = useSWR(
    address ? `${address}-rune-balance` : null,
    async () => {
      try {
        const runeBalace = await AxiosInstance.post<{
          code: number;
          error: boolean;
          data: ValidAddressRuneAssetWithList[];
        }>("/api/address/balance", {
          address,
          network: isTestnetAddress(address) ? "testnet" : "bitcoin",
        });

        if (runeBalace.data.error) {
          throw new Error(runeBalace.data.code.toString());
        }

        const offers: {
          id: number;
          runeId: string;
          unitPrice: string;
          totalPrice: string;
          fundingReceiver: string;
          txid: string;
          vout: number;
        }[] = [];

        if (account && account.ordinals.address === address) {
          const { data } = await AxiosInstance.post<{
            code: number;
            error: string;
            data: {
              id: number;
              runeId: string;
              unitPrice: string;
              totalPrice: string;
              fundingReceiver: string;
              txid: string;
              vout: number;
            }[];
          }>("/api/address/offers", {
            address,
          });

          if (data.error) {
            throw new Error(data.code.toString());
          }

          data.data.forEach((offer) => {
            offers.push(offer);
          });
        }

        const { receive, spent } = await getUTXOsInMempool(
          address,
          isTestnetAddress(address) ? networks.testnet : networks.bitcoin,
        );

        const validRunes = runeBalace.data.data.filter((rune) => {
          return (
            !spent.find(
              (utxo) => utxo.txid === rune.txid && utxo.vout === rune.vout,
            ) &&
            !receive.find(
              (utxo) => utxo.txid === rune.txid && utxo.vout === rune.vout,
            )
          );
        });

        validRunes.forEach((rune) => {
          rune.listed = offers.find(
            (offer) => offer.txid === rune.txid && offer.vout === rune.vout,
          );
        });

        return validRunes;
      } catch (e) {
        console.error(e);
        toast({
          variant: "destructive",
          duration: 3000,
          title: "Fetch rune assets failed",
          description: formatError(e),
        });
        return [];
      }
    },
    { refreshInterval: 1000 * 60 },
  );

  useEffect(() => {
    mutate();
  }, [address, account]);

  return {
    runes: data,
    runesLoading: isLoading,
    runesValidating: isValidating,
    refreshRunes: mutate,
  };
};
