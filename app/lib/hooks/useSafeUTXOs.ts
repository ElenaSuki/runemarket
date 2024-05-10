import useSWR from "swr";

import { useWallet } from "@/components/Wallet/hooks";

import { getUTXOsInMempool } from "../apis/mempool";
import AxiosInstance from "../axios";
import { isTestnetAddress } from "../utils/address-helpers";
import { formatError } from "../utils/error-helpers";
import { useToast } from "./useToast";

export const useSafeUTXOs = () => {
  const { account } = useWallet();
  const { toast } = useToast();

  const { data } = useSWR(
    account ? `utxos-${account.payment.address}` : null,
    async () => {
      if (!account) return [];

      try {
        const [utxos, inMempoolUTXOs] = await Promise.all([
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
          getUTXOsInMempool(account.payment.address, account.payment.network),
        ]);

        if (utxos.data.error) {
          throw new Error(utxos.data.code.toString());
        }

        const unavailableUTXOs = [
          ...inMempoolUTXOs.receive,
          ...inMempoolUTXOs.spent,
        ];

        const availableUTXOs = utxos.data.data;

        try {
          const storeUTXOs = window.localStorage.getItem(
            `${account.payment.address}-utxos`,
          );

          if (storeUTXOs) {
            const utxos: { txid: string; vout: number; value: number }[] =
              JSON.parse(storeUTXOs);

            if (utxos.length === 0) {
              window.localStorage.removeItem(
                `${account.payment.address}-utxos`,
              );
              return availableUTXOs;
            }

            const reusedUTXOs: { txid: string; vout: number; value: number }[] =
              [];

            utxos.forEach((utxo) => {
              if (
                unavailableUTXOs.find(
                  (u) => u.txid === utxo.txid && u.vout === utxo.vout,
                )
              ) {
                availableUTXOs.push(utxo);
                reusedUTXOs.push(utxo);
              }
            });

            window.localStorage.setItem(
              `${account.payment.address}-utxos`,
              JSON.stringify(reusedUTXOs),
            );
          }
        } catch (e) {}

        return availableUTXOs;
      } catch (e) {
        console.log(e);
        toast({
          variant: "destructive",
          duration: 3000,
          title: "Fetch UTXOs failed",
          description: formatError(e),
        });
      }
    },
    {
      refreshInterval: 1000 * 60,
    },
  );

  return {
    utxos: data,
  };
};
