import { useNavigate } from "@remix-run/react";
import { Fuel, Link2, Link2Off, Menu, Wallet } from "lucide-react";
import { useEffect, useState } from "react";

import { useGasFee } from "@/lib/hooks/useGasFee";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { formatAddress } from "@/lib/utils";

import { Button } from "../Button";
import CopyButton from "../CopyButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../DropdownMenu";
import { Sheet, SheetContent } from "../Sheet";
import { useWallet } from "../Wallet/hooks";

const Header: React.FC = () => {
  const { account, setModalOpen, disconnect } = useWallet();
  const { isMobile } = useMediaQuery();
  const nagigate = useNavigate();
  const { gasFee } = useGasFee();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [avgGasFee, setAvgGasFee] = useState(0);

  useEffect(() => {
    if (!gasFee) return;

    const avg = gasFee.find((item) => item.title === "Medium Priority");

    if (avg) {
      setAvgGasFee(avg.value);
    }
  }, [gasFee]);

  return (
    <header className="fixed left-0 top-0 z-20 flex h-20 w-full items-center bg-secondary px-4 text-white shadow">
      <div className="relative flex h-full w-full items-center justify-between space-x-4">
        <div className="flex shrink-0 items-center space-x-10">
          <div
            className="flex cursor-pointer items-center space-x-3 text-primary transition-colors hover:text-theme"
            onClick={() => nagigate("/")}
          >
            <img
              className="h-7 sm:h-10"
              src="/icons/logo.svg"
              alt="runebunlder"
            />
          </div>
        </div>
        <div className="flex shrink-0 items-center space-x-2">
          <a
            href="https://twitter.com/runebundler"
            target="_blank"
            className="h-4 w-4 opacity-100 transition-opacity hover:opacity-75 sm:h-6 sm:w-6"
          >
            <img
              src="/icons/twitter.svg"
              alt="twitter"
            />
          </a>
          <a
            href="https://t.me/runebundler"
            target="_blank"
            className="h-4 w-4 opacity-100 transition-opacity hover:opacity-75 sm:h-6 sm:w-6"
          >
            <img
              src="/icons/telegram.svg"
              alt="telegram"
            />
          </a>
          <div className="flex items-center space-x-1">
            <Fuel className="h-4 w-4 sm:h-5 sm:w-5" />
            <div className="text-nowrap text-sm">{avgGasFee} sat / vB</div>
          </div>
          {!account && !isMobile && (
            <Button onClick={() => setModalOpen(true)}>Connect</Button>
          )}
          {account && !isMobile && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="">
                  <Wallet className="mr-2 h-4 w-4" />
                  {formatAddress(account.ordinals.address, 6)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() =>
                    nagigate(`/assets/${account.ordinals.address}`)
                  }
                >
                  My Assets
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => disconnect(account.ordinals.address)}
                >
                  Disconnect
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Menu
            className="h-5 w-5 cursor-pointer text-primary transition-colors hover:text-theme md:hidden"
            onClick={() => setSheetOpen(!sheetOpen)}
          />
        </div>
      </div>
      <Sheet
        open={isMobile && sheetOpen}
        onOpenChange={setSheetOpen}
      >
        <SheetContent className="space-y-6 pt-12">
          <div className="border-b py-2 text-2xl font-medium">Account</div>
          <div className="space-y-3">
            {account && (
              <>
                <div className="flex items-center justify-between">
                  <div>{formatAddress(account.ordinals.address, 6)}</div>
                  <CopyButton text={account.ordinals.address} />
                </div>
                <div
                  onClick={() =>
                    nagigate(`/assets/${account.ordinals.address}`)
                  }
                  className="flex w-full cursor-pointer items-center space-x-3 rounded-lg bg-secondary p-6 text-primary transition-colors hover:bg-theme hover:text-white"
                >
                  <Wallet className="h-6 w-6" />
                  <span className="text-xl">My Assets</span>
                </div>
                <div
                  onClick={() => disconnect(account.ordinals.address)}
                  className="flex w-full cursor-pointer items-center space-x-3 rounded-lg bg-secondary p-6 text-primary transition-colors hover:bg-theme hover:text-white"
                >
                  <Link2Off className="h-6 w-6" />
                  <span className="text-xl">Disconnect</span>
                </div>
              </>
            )}
            {!account && (
              <div
                onClick={() => setModalOpen(true)}
                className="flex w-full cursor-pointer items-center space-x-3 rounded-lg bg-secondary p-6 text-primary transition-colors hover:bg-theme hover:text-white"
              >
                <Link2 className="h-6 w-6" />
                <span className="text-xl">Connect</span>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
};

export default Header;
