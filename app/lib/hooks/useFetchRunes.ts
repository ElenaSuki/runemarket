import axios from "axios";
import { networks } from "bitcoinjs-lib";
import { useEffect, useState } from "react";

import { getUTXOsInMempool } from "../apis/mempool";
import { ValidAddressRuneAssetWithList } from "../types/rune";
import { isTestnetAddress } from "../utils/address-helpers";
import { formatError } from "../utils/error-helpers";
import { useToast } from "./useToast";

export const useFetchRunes = (address: string) => {
  const { toast } = useToast();

  const [runes, setRunes] = useState<ValidAddressRuneAssetWithList[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRunes = async () => {
    if (!address) return [];

    try {
      setLoading(true);

      const { data: runes } = await axios.post<{
        code: number;
        error: boolean;
        data: ValidAddressRuneAssetWithList[];
      }>("/api/address/balance", {
        address,
        network: isTestnetAddress(address) ? "testnet" : "bitcoin",
      });

      if (runes.error) {
        throw new Error(runes.code.toString());
      }

      const offerList: {
        id: number;
        runeId: string;
        unitPrice: string;
        totalPrice: string;
        fundingReceiver: string;
        txid: string;
        vout: number;
        inscriptionId: string;
      }[] = [];

      const { data: offers } = await axios.post<{
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
          inscriptionId: string;
        }[];
      }>("/api/address/offers", {
        address,
      });

      if (offers.error) {
        throw new Error(offers.code.toString());
      }

      offerList.push(...offers.data);

      const { receive, spent } = await getUTXOsInMempool(
        address,
        isTestnetAddress(address) ? networks.testnet : networks.bitcoin,
      );

      const validRunes = runes.data.filter((rune) => {
        return (
          !spent.find(
            (utxo) =>
              utxo.txid === rune.rune.txid && utxo.vout === rune.rune.vout,
          ) &&
          !receive.find(
            (utxo) =>
              utxo.txid === rune.rune.txid && utxo.vout === rune.rune.vout,
          )
        );
      });

      validRunes.forEach((rune) => {
        rune.listed = offerList.find(
          (offer) =>
            offer.txid === rune.rune.txid && offer.vout === rune.rune.vout,
        );
      });

      setRunes(validRunes);
    } catch (e) {
      toast({
        variant: "destructive",
        duration: 3000,
        title: "Fetch runes failed",
        description: formatError(e),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (address) {
      fetchRunes();
    } else {
      setRunes([]);
    }
  }, [address]);

  return {
    runes,
    loading,
    setLoading,
    fetchRunes,
  };
};
