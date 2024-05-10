import { address as AddressUtils, Psbt, networks } from "bitcoinjs-lib";
import {
  AddressPurpose,
  BitcoinNetworkType,
  SignTransactionOptions,
  getAddress,
  signMessage,
  signTransaction,
} from "sats-connect";

import { AccountInfo } from "@/lib/types";

import { XverseWallet } from "@/global";

export class XverseWalletInstance implements XverseWallet {
  paymentAddress: string = "";
  ordinalsAddress: string = "";

  isInstalled() {
    return !!window.XverseProviders;
  }

  async connect(): Promise<{
    ordinals: AccountInfo;
    payment: AccountInfo;
  }> {
    return new Promise((resolve, reject) => {
      if (!this.isInstalled()) {
        reject("Xverse wallet not installed");
      }

      getAddress({
        payload: {
          purposes: [AddressPurpose.Ordinals, AddressPurpose.Payment],
          message: "Sign in to runebundler.com",
          network: {
            type: BitcoinNetworkType.Mainnet,
          },
        },

        onFinish: (resp) => {
          const ordinalsAddress = resp.addresses.find(
            (a) => a.purpose === AddressPurpose.Ordinals,
          );
          if (!ordinalsAddress) {
            reject("No ordinals address found");
            return;
          }
          const paymentAddress = resp.addresses.find(
            (a) => a.purpose === AddressPurpose.Payment,
          );
          if (!paymentAddress) {
            reject("No payment address found");
            return;
          }

          const network = networks.bitcoin;

          this.ordinalsAddress = ordinalsAddress.address;
          this.paymentAddress = paymentAddress.address;

          resolve({
            ordinals: {
              address: ordinalsAddress.address,
              network,
              script: AddressUtils.toOutputScript(
                ordinalsAddress.address,
                network,
              ),
              pubkey: Buffer.from(`03${ordinalsAddress.publicKey}`, "hex"),
              type: "p2tr",
            },
            payment: {
              address: paymentAddress.address,
              network,
              script: AddressUtils.toOutputScript(
                paymentAddress.address,
                network,
              ),
              pubkey: Buffer.from(paymentAddress.publicKey, "hex"),
              type: "p2sh",
            },
          });
        },

        onCancel: () => {
          reject("User rejected address request");
        },
      });
    });
  }

  async signPsbt(
    psbtHex: string,
    options?: {
      autoFinalized?: boolean;
      toSignInputs?: {
        index: number;
        address?: string;
        publicKey?: string;
        sighashTypes?: number[];
        disableTweakSigner?: boolean;
      }[];
    },
  ): Promise<string> {
    const psbt = Psbt.fromHex(psbtHex);

    return new Promise((resolve, reject) => {
      const inputsToSign = options?.toSignInputs
        ? options?.toSignInputs.reduce(
            (
              prev: SignTransactionOptions["payload"]["inputsToSign"],
              input,
            ) => {
              if (!input.address) return prev;

              return [
                ...prev,
                {
                  address: input.address,
                  signingIndexes: [input.index],
                  sigHash: input.sighashTypes ? input.sighashTypes[0] : 0,
                },
              ];
            },
            [],
          )
        : [];

      const signInputIndexes = inputsToSign.reduce(
        (prev: number[], input) => [...prev, ...input.signingIndexes],
        [],
      );

      try {
        signTransaction({
          payload: {
            network: {
              type: BitcoinNetworkType.Mainnet,
            },
            message: "Sign Transaction",
            psbtBase64: psbt.toBase64(),
            broadcast: false,
            inputsToSign,
          },
          onFinish: (resp) => {
            let psbt = Psbt.fromBase64(resp.psbtBase64);

            if (options?.autoFinalized !== false) {
              for (let i of signInputIndexes) {
                psbt.finalizeInput(i);
              }
            }
            resolve(psbt.toHex());
          },
          onCancel: () => {
            reject("User rejected transaction signing");
          },
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  async signMessage(
    message: string,
    type: "bip322-simple" | "ecdsa",
  ): Promise<string> {
    if (!this.ordinalsAddress) {
      throw new Error("No ordinals address connected");
    }

    return new Promise(async (resolve, reject) => {
      await signMessage({
        payload: {
          network: {
            type: BitcoinNetworkType.Mainnet,
          },
          address: this.ordinalsAddress || "",
          message,
        },
        onFinish: (resp: string) => {
          resolve(resp);
        },
        onCancel: () => {
          reject("User rejected message signing");
        },
      });
    });
  }
}
