"use client";
import Image from "next/image";
import {
  generateWallet,
  getGaiaAddress,
  getStxAddress,
  Wallet,
} from "@stacks/wallet-sdk";
import { useEffect, useState } from "react";
import { connect, disconnect, isConnected, request } from "@stacks/connect";

export default function Home() {
  const [connected, setConnected] = useState(false);

  const arg = {
    secretKey:
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
    password: "123123",
  };
  const [wallet, setWallet] = useState<Wallet | null>(null);

  useEffect(() => {
    const genWallet = async () => {
      const newWallet = await generateWallet(arg);
      setWallet(newWallet);
    };

    genWallet();
  }, []);

  if (wallet?.accounts?.[0]) {
    const account = wallet.accounts[0];
    const address = getStxAddress(account, "testnet");
    console.log("getStxAddresss:", address);
    console.log("Private Key:", account.stxPrivateKey);
  }

  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <div>
        {wallet?.accounts?.[0] ? (
          <div>
            <p>Address: {getStxAddress(wallet.accounts[0], "testnet")}</p>
            <p>Stx Private Key: {wallet.accounts[0].stxPrivateKey}</p>
          </div>
        ) : (
          <p>Generating wallet...</p>
        )}
      </div>
    </div>
  );
}
