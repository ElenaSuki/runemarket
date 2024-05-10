import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { useToast } from "@/lib/hooks/useToast";
import { formatError } from "@/lib/utils/error-helpers";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../Dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "../Drawer";
import { useWallet } from "./hooks";

const WalletConnector: React.FC = () => {
  const { isMobile } = useMediaQuery();

  return isMobile ? <MobileWalletModal /> : <DesktopWalletModal />;
};

const MobileWalletModal: React.FC = () => {
  const { connect, modalOpen, setModalOpen } = useWallet();
  const { toast } = useToast();

  const handleConnect = async (wallet: "unisat" | "xverse") => {
    try {
      await connect(wallet);
      setModalOpen(false);
    } catch (e) {
      console.log(e);
      toast({
        duration: 2000,
        variant: "destructive",
        title: "Connect wallet failed",
        description: formatError(e),
      });
    }
  };

  return (
    <Drawer
      open={modalOpen}
      onOpenChange={setModalOpen}
    >
      <DrawerContent className="space-y-4 px-4 pb-8">
        <DrawerHeader>
          <DrawerTitle>Connect Wallet</DrawerTitle>
        </DrawerHeader>
        <div className="flex flex-col space-y-2">
          <div
            onClick={() => handleConnect("unisat")}
            className="group flex w-full cursor-pointer items-center space-x-4 rounded-lg bg-secondary p-4 transition-colors hover:bg-theme"
          >
            <img
              className="h-10 w-10"
              src="/icons/wallet-unisat.svg"
              alt="unisat wallet"
            />
            <div className="text-lg transition-colors group-hover:text-white">
              Unisat Wallet
            </div>
          </div>
          <div
            onClick={() => handleConnect("xverse")}
            className="group flex w-full cursor-pointer items-center space-x-4 rounded-lg bg-secondary p-4 transition-colors hover:bg-theme"
          >
            <img
              className="h-10 w-10"
              src="/icons/wallet-xverse.svg"
              alt="xverse wallet"
            />
            <div className="text-lg transition-colors group-hover:text-white">
              Xverse Wallet
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

const DesktopWalletModal: React.FC = () => {
  const { connect, modalOpen, setModalOpen } = useWallet();
  const { toast } = useToast();

  const handleConnect = async (wallet: "unisat" | "xverse") => {
    try {
      await connect(wallet);
      setModalOpen(false);
    } catch (e) {
      console.log(e);
      toast({
        duration: 2000,
        variant: "destructive",
        title: "Connect wallet failed",
        description: formatError(e),
      });
    }
  };

  return (
    <Dialog
      open={modalOpen}
      onOpenChange={setModalOpen}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Wallet</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col space-y-2">
          <div
            onClick={() => handleConnect("unisat")}
            className="group flex w-full cursor-pointer items-center space-x-4 rounded-lg bg-secondary p-4 transition-colors hover:bg-theme"
          >
            <img
              className="h-10 w-10"
              src="/icons/wallet-unisat.svg"
              alt="unisat wallet"
            />
            <div className="text-lg transition-colors group-hover:text-white">
              Unisat Wallet
            </div>
          </div>
          <div
            onClick={() => handleConnect("xverse")}
            className="group flex w-full cursor-pointer items-center space-x-4 rounded-lg bg-secondary p-4 transition-colors hover:bg-theme"
          >
            <img
              className="h-10 w-10"
              src="/icons/wallet-xverse.svg"
              alt="xverse wallet"
            />
            <div className="text-lg transition-colors group-hover:text-white">
              Xverse Wallet
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WalletConnector;
