import { AccountInfo } from "./lib/types";

export interface UnisatWallet {
  requestAccounts: () => Promise<string[]>;
  getAccounts: () => Promise<string[]>;
  getNetwork: () => Promise<"livenet" | "testnet">;
  getPublicKey: () => Promise<string>;
  signPsbt: (
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
  ) => Promise<string>;
  signMessage: (
    message: string,
    type: "bip322-simple" | "ecdsa",
  ) => Promise<string>;
  on(event: "accountsChanged", handler: (accounts: string[]) => void): void;
  on(
    event: "networkChanged",
    handler: (network: "livenet" | "testnet") => void,
  ): void;
  removeListener(
    event: "accountsChanged",
    handler: (accounts: string[]) => void,
  ): void;
  removeListener(
    event: "networkChanged",
    handler: (network: "livenet" | "testnet") => void,
  ): void;
}

export interface XverseWallet {
  ordinalsAddress: string;
  paymentAddress: string;

  isInstalled: () => boolean;
  connect: () => Promise<{
    ordinals: AccountInfo;
    payment: AccountInfo;
  }>;
  signPsbt: (
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
  ) => Promise<string>;
  signMessage: (
    message: string,
    type: "bip322-simple" | "ecdsa",
  ) => Promise<string>;
}

declare global {
  interface Window {
    unisat?: UnisatWallet;
  }
}

export {};
