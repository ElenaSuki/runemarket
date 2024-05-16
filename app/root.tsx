import { cssBundleHref } from "@remix-run/css-bundle";
import type { LinksFunction, MetaFunction } from "@remix-run/node";
import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime.js";
import utc from "dayjs/plugin/utc.js";
import { useEffect, useState } from "react";

import { Button } from "./components/Button";
import { Dialog, DialogContent, DialogHeader } from "./components/Dialog";
import Footer from "./components/Footer";
import Header from "./components/Header";
import WalletProvider from "./components/Wallet/provider";
import { Toaster } from "./lib/hooks/useToast";
import styles from "./tailwind.css";

dayjs.extend(relativeTime);
dayjs.extend(utc);

export const links: LinksFunction = () => [
  ...(cssBundleHref ? [{ rel: "stylesheet", href: cssBundleHref }] : []),
  { rel: "stylesheet", href: styles },
  { rel: "icon", type: "image/png", href: "/icons/favicon.png" },
];

export const meta: MetaFunction = () => {
  return [
    {
      title: "Rune Bunlder - Bundle Your Runes & Inscriptions",
    },
    {
      name: "description",
      content: "Bundle Your Runes & Inscriptions",
    },
  ];
};

export default function App() {
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const notShowAgain = window.localStorage.getItem("notShowAgain");
    if (!notShowAgain) {
      setModalOpen(true);
    }
  }, []);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        />
        <Meta />
        <Links />
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-full w-full bg-primary text-primary">
        <WalletProvider>
          <Header />
          <main className="mt-20 min-h-[calc(100vh-12rem)]">
            <div className="mx-auto max-w-screen-xl px-4 py-8">
              <Outlet />
            </div>
            <Dialog
              open={modalOpen}
              onOpenChange={(open) => {
                if (!open) {
                  window.localStorage.setItem("notShowAgain", "true");
                  setModalOpen(false);
                }
              }}
            >
              <DialogContent>
                <DialogHeader>Market Info</DialogHeader>
                <div className="w-full space-y-4">
                  <div>Update: bulk buy is now available.</div>
                  <div>
                    In order to pay for unisat api calls, RuneBundler has to
                    charge service fee, and we only charge{" "}
                    <span className="font-bold text-theme">1%</span> of the
                    buyer's total price when order placed, list action costs no
                    service fee.
                  </div>
                  <div>---------------------</div>
                  <div>更新：市场现已支持批量购买</div>
                  <div>
                    为了支付 unisat api 的调用费用，RuneBundler
                    不得不收取手续费， 我们只收取买家成单时总价{" "}
                    <span className="font-bold text-theme">1%</span>{" "}
                    的费用，挂单操作不收取任何费用。
                  </div>
                  <div className="flex w-full justify-end">
                    <Button
                      onClick={() => {
                        window.localStorage.setItem("notShowAgain", "true");
                        setModalOpen(false);
                      }}
                    >
                      OK
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </main>
          <Footer />
          <Toaster />
        </WalletProvider>
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}
