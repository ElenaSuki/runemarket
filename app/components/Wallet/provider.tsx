import { address as AddressUtils, networks } from "bitcoinjs-lib";
import { createContext, useEffect, useState } from "react";

import { AccountInfo } from "@/lib/types";
import { detectAccountType } from "@/lib/utils/address-helpers";

import { UnisatWallet, XverseWallet } from "@/global";

import WalletConnector from ".";
import { XverseWalletInstance } from "./connector";

export const WalletContext = createContext<{
  modalOpen: boolean;
  setModalOpen: (open: boolean) => void;
  walletName: string;
  connector?: UnisatWallet | XverseWallet;
  account?: {
    payment: AccountInfo;
    ordinals: AccountInfo;
  };
  connect: (wallet: "unisat" | "xverse") => Promise<void>;
  disconnect: (address: string) => void;
} | null>(null);

const WalletProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [walletName, setWalletName] = useState("");
  const [connectors, setConnectors] = useState<{
    unisat: UnisatWallet | null;
    xverse: XverseWallet | null;
  }>({
    unisat: null,
    xverse: null,
  });
  const [connector, setConnector] = useState<
    UnisatWallet | XverseWallet | null
  >(null);
  const [account, setAccount] = useState<
    | {
        payment: AccountInfo;
        ordinals: AccountInfo;
      }
    | undefined
  >();

  const connect = async (wallet: "unisat" | "xverse") => {
    if (wallet === "unisat") {
      const connectorInstance = connectors[wallet];

      if (!connectorInstance) {
        throw new Error(`Wallet ${wallet} not installed`);
      }

      const walletNetwork = await connectorInstance.getNetwork();

      if (walletNetwork === "testnet") {
        throw new Error("Testnet not supported");
      }

      const network = networks.bitcoin;

      const addressList = await connectorInstance.requestAccounts();
      const pubkey = await connectorInstance.getPublicKey();

      const address = addressList[0];
      const addressType = detectAccountType(address, network);

      const autoConnect = window.localStorage.getItem(
        `address-auto-connect-${address}`,
      );

      if (!autoConnect) {
        const message = `Connect to runebundler.com use address ${address}`;
        await connectorInstance.signMessage(
          message,
          addressType === "p2tr" ? "bip322-simple" : "ecdsa",
        );

        window.localStorage.setItem(`address-auto-connect-${address}`, "true");
      }

      const script = AddressUtils.toOutputScript(address, network);

      setConnector(connectorInstance);
      setAccount({
        payment: {
          address,
          network,
          pubkey: Buffer.from(pubkey, "hex"),
          script,
          type: addressType,
        },
        ordinals: {
          address,
          network,
          pubkey: Buffer.from(pubkey, "hex"),
          script,
          type: addressType,
        },
      });

      connectorInstance.on("accountsChanged", () => {
        window.sessionStorage.setItem("disconnect", "true");
        setConnector(null);
        setAccount(undefined);
        setWalletName("");
      });

      connectorInstance.on("networkChanged", () => {
        window.sessionStorage.setItem("disconnect", "true");
        setConnector(null);
        setAccount(undefined);
        setWalletName("");
      });
    } else if (wallet === "xverse") {
      const connectorInstance = connectors[wallet];

      if (!connectorInstance) {
        throw new Error(`Wallet ${wallet} not installed`);
      }

      const accountInfo = await connectorInstance.connect();

      const autoConnect = window.localStorage.getItem(
        `address-auto-connect-${accountInfo.ordinals.address}`,
      );

      if (!autoConnect) {
        const message = `Connect to runebundler.com use address ${accountInfo.ordinals.address}`;
        await connectorInstance.signMessage(message, "bip322-simple");

        window.localStorage.setItem(
          `address-auto-connect-${accountInfo.ordinals.address}`,
          "true",
        );
      }

      setAccount(accountInfo);
      setConnector(connectorInstance);
    }

    setWalletName(wallet);

    window.sessionStorage.removeItem("disconnect");
    window.localStorage.setItem("wallet", wallet);
  };

  const disconnect = (address: string) => {
    window.localStorage.removeItem(`address-auto-connect-${address}`);
    window.localStorage.removeItem("wallet");
    setConnector(null);
    setAccount(undefined);
    setWalletName("");
  };

  useEffect(() => {
    const unisatWallet = window.unisat;
    const xverseWalletInstalled = window.XverseProviders;

    const connectorsObj: {
      unisat: UnisatWallet | null;
      xverse: XverseWallet | null;
    } = {
      unisat: null,
      xverse: null,
    };

    if (unisatWallet) {
      connectorsObj.unisat = unisatWallet;
    }

    if (xverseWalletInstalled) {
      const xverseWallet = new XverseWalletInstance();
      connectorsObj.xverse = xverseWallet;
    }

    setConnectors(connectorsObj);
  }, []);

  const connectWallet = async () => {
    const disconnect = window.sessionStorage.getItem("disconnect");
    const wallet = window.localStorage.getItem("wallet") as "unisat" | "xverse";
    const walletInstance = connectors[wallet];

    if (!account && !disconnect && wallet && walletInstance) {
      await connect(wallet);
    }
  };

  useEffect(() => {
    connectWallet();
  }, [account, connectors]);

  return (
    <WalletContext.Provider
      value={{
        modalOpen,
        setModalOpen,
        walletName,
        connector: connector ? connector : undefined,
        account,
        connect,
        disconnect,
      }}
    >
      {children}
      <WalletConnector />
    </WalletContext.Provider>
  );
};

export default WalletProvider;
