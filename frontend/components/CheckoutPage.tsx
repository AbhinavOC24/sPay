"use client";
import { useEffect, useState } from "react";
import axios from "axios";

import { STACKS_TESTNET } from "@stacks/network";
import {
  AnchorMode,
  broadcastTransaction,
  Cl,
  Pc,
  makeContractCall,
  PostConditionMode,
  postConditionToHex,
} from "@stacks/transactions";
import {
  connect,
  getLocalStorage,
  isConnected,
  openContractCall,
  request,
} from "@stacks/connect";
import ExpiredPage from "./ExpiredPage";

interface Charge {
  chargeId: string;
  address: string;
  amount: number;
  usdRate?: number;
  status: string;
  success_url?: string;
  cancel_url?: string;
  expiresAt?: string;
  txid?: string;
}

// ==== Config ====
const NETWORK = "testnet"; // "mainnet" | "testnet"
const sbtcTokenAddress = "ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token";

export default function CheckoutPage({ chargeId }: { chargeId: string }) {
  const [charge, setCharge] = useState<Charge | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [copiedAmt, setCopiedAmt] = useState(false);
  const [loading, setLoading] = useState(true); // 👈 new

  const handlePay = async () => {
    if (!charge) return;

    try {
      const walletConnect = await connect();
      const userData = getLocalStorage();
      if (!userData) return;
      // const stxAddress = userData.addresses.stx[0].address;
      const stxAddress = userData.addresses.stx.find((a) =>
        a.address.startsWith("ST")
      )?.address;
      if (!stxAddress) throw new Error("No STX address from Leather");
      console.log(userData.addresses);
      const amountInMicroSTX = charge.amount;

      const pc = Pc.principal(stxAddress)
        .willSendEq(amountInMicroSTX)
        .ft(sbtcTokenAddress, "sbtc-token");

      const response = await request("stx_callContract", {
        contract: sbtcTokenAddress,
        functionName: "transfer",
        functionArgs: [
          Cl.uint(amountInMicroSTX),
          Cl.principal(stxAddress),
          Cl.principal(charge.address),
          Cl.none(),
        ],
        network: "testnet",
        postConditions: [postConditionToHex(pc)], // wallet expects hex
        postConditionMode: "deny",
      });

      console.log(response);
    } catch (err) {
      console.error("❌ Payment failed:", err);
    }
  };

  //fetch Initial state
  useEffect(() => {
    axios
      .get(`/backend/charges/${chargeId}`, {
        headers: { "Cache-Control": "no-store" },
      })
      .then((res) => setCharge(res.data))
      .finally(() => setLoading(false))
      .catch(console.error);
  }, [chargeId]);

  useEffect(() => {
    const es = new EventSource(`/backend/charges/${chargeId}/events`);

    es.addEventListener("charge.updated", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        // console.log("SSE charge update received:", data); // Debug log

        setCharge(data);

        // Success redirection logic with 3 second timeout
        if (data.status === "CONFIRMED" && data.success_url) {
          const url = new URL(data.success_url);
          url.searchParams.set("charge_id", data.chargeId);
          if (data.txid) url.searchParams.set("txid", data.txid);
          url.searchParams.set("status", "CONFIRMED");

          // console.log("SSE - SUCCESS redirect to:", url.toString());
          // alert("SUCCESS");

          setTimeout(() => {
            window.location.href = url.toString();
          }, 3000);
        }

        // Cancel/expired redirection logic with 3 second timeout
        if (data.status === "CANCELLED" && data.cancel_url) {
          const url = new URL(data.cancel_url);
          url.searchParams.set("charge_id", data.chargeId);
          url.searchParams.set("status", data.status);

          // console.log("SSE - CANCEL redirect to:", url.toString());
          // alert(`REDIRECT TO CANCEL - Status: ${data.status}`);

          setTimeout(() => {
            window.location.href = url.toString();
          }, 3000);
        }
      } catch (err) {
        console.error("Error parsing SSE:", err);
      }
    });

    es.onerror = (error) => {
      console.error("SSE error:", error);
      es.close();

      // Fallback polling
      const pollInterval = setInterval(async () => {
        try {
          const res = await axios.get(`/backend/charges/${chargeId}`);
          console.log("Polling update:", res.data); // Debug log
          setCharge(res.data);
        } catch (err) {
          console.error("Polling error:", err);
        }
      }, 5000);

      return () => clearInterval(pollInterval);
    };

    return () => es.close();
  }, [chargeId]);

  // === Countdown ===
  useEffect(() => {
    if (!charge?.expiresAt) return;
    const expMs = new Date(charge.expiresAt).getTime();
    const interval = setInterval(() => {
      setTimeLeft(Math.max(0, Math.ceil((expMs - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [charge?.expiresAt]);

  // = == Cancel handler ===
  const handleCancel = async () => {
    try {
      await axios.post(`/backend/charges/${chargeId}/cancel`);

      if (charge?.cancel_url) {
        window.location.href = charge.cancel_url;
      }
    } catch (err) {
      console.error("Cancel failed:", err);
    }
  };

  const fmtAmount = (amt?: number) =>
    amt ? (amt / 1e8).toFixed(8).replace(/0+$/, "").replace(/\.$/, "") : "—";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#100e0b] text-[#e6edf3]">
        <div className="text-lg font-semibold animate-pulse">Loading…</div>
      </div>
    );
  }

  if ((charge && charge.status !== "EXPIRED") || timeLeft !== 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#221a13] to-[#100e0b] text-[#e6edf3] flex items-center justify-center p-6">
        <main className="bg-[#1b1612] border border-[#33271f] rounded-2xl shadow-xl max-w-3xl w-full overflow-hidden">
          {/* Header */}
          <header className="flex items-center justify-between gap-4 px-6 py-5 border-b border-[#33271f]">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-gradient-to-tr from-[#f29c24] to-[#ffa46b] shadow-[0_0_0_3px_rgba(79,70,229,0.15)]" />
              <h1 className="text-lg font-semibold">
                Complete your sBTC payment
              </h1>
            </div>
            <div
              className={`px-3 py-1 rounded-full text-xs font-bold border ${
                charge?.status === "CONFIRMED"
                  ? "text-green-500 border-green-500 bg-green-500/10"
                  : charge?.status === "PENDING"
                  ? "text-gray-400 border-gray-600 bg-gray-600/10"
                  : charge?.status === "DETECTED"
                  ? "text-yellow-500 border-yellow-500 bg-yellow-500/10"
                  : charge?.status === "CANCELLED" ||
                    charge?.status === "EXPIRED" ||
                    charge?.status === "UNDERPAID"
                  ? "text-red-500 border-red-500 bg-red-500/10"
                  : "text-gray-400 border-gray-600"
              }`}
            >
              Status: {charge?.status || "—"}
            </div>
          </header>

          {/* Body */}
          <section className="px-6 py-6">
            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
              {/* QR */}
              <div className="grid place-items-center gap-2 p-3 border border-dashed border-[#1f2733] rounded-xl">
                <img
                  src={`/backend/charges/${chargeId}/qr.png`}
                  width="180"
                  height="180"
                  alt="Payment QR code"
                  className="rounded-lg bg-[#0d1117]"
                />
                <small className="text-xs text-[#9aa4b2]">
                  Scan with your Stacks wallet
                </small>
              </div>

              {/* Main info */}
              <div className="flex flex-col gap-3">
                <div>
                  <div className="text-xs text-[#9aa4b2]">Amount</div>
                  <div className="mt-1 text-xl font-mono">
                    {fmtAmount(charge?.amount)}{" "}
                    <span className="ml-1 text-sm text-[#9aa4b2]">sBTC</span>
                    {charge?.usdRate && (
                      <span className="ml-2 text-sm text-[#9aa4b2]">
                        (≈ {charge.usdRate.toFixed(2)} USD)
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-[#9aa4b2]">Send to</div>
                  <code className="mt-1 block p-2 bg-[#29221c] border border-[#332d1f] rounded-lg text-sm font-mono break-all">
                    {charge?.address || "—"}
                  </code>
                </div>

                <div className="flex flex-wrap gap-2 mt-2">
                  <button
                    className="px-3 py-2 rounded-lg bg-[#f29c24] text-black font-semibold cursor-pointer hover:brightness-110 disabled:opacity-50"
                    disabled={charge?.status !== "PENDING"}
                    onClick={handlePay}
                  >
                    Pay with wallet
                  </button>
                  <button
                    className="px-3 py-2 rounded-lg bg-[#1b160f] border cursor-pointer border-[#332b1f] text-sm hover:brightness-110"
                    onClick={async () => {
                      navigator.clipboard.writeText(charge?.address || "");
                      setCopiedAddr(true);
                      setTimeout(() => setCopiedAddr(false), 1200);
                    }}
                  >
                    {copiedAddr ? "Copied!" : "Copy address"}
                  </button>
                  <button
                    className="px-3 py-2 rounded-lg cursor-pointer bg-[#1b160f] border border-[#332a1f] text-sm hover:brightness-110"
                    onClick={async () => {
                      const amt = fmtAmount(charge?.amount);
                      if (amt !== "—") {
                        await navigator.clipboard.writeText(amt);
                        setCopiedAmt(true);
                        setTimeout(() => setCopiedAmt(false), 1200);
                      }
                    }}
                  >
                    {copiedAmt ? "Copied!" : "Copy amount"}
                  </button>
                  <button
                    className="px-3 py-2 cursor-pointer rounded-lg bg-red-600/20 border border-red-500 text-red-400 text-sm hover:brightness-110 disabled:opacity-50"
                    disabled={charge?.status !== "PENDING"}
                    onClick={handleCancel}
                  >
                    Cancel
                  </button>
                </div>

                <div className="text-sm text-[#9aa4b2] mt-2">
                  Expires in {Math.floor(timeLeft / 60)}:
                  {String(timeLeft % 60).padStart(2, "0")}
                </div>
              </div>
            </div>

            <div className="mt-6 p-3 border border-[#33291f] bg-white/5 rounded-lg text-sm">
              {charge?.status === "PENDING"
                ? "Waiting for payment…"
                : charge?.status === "DETECTED"
                ? "Payment detected. Finalizing…"
                : charge?.status === "CONFIRMED"
                ? "Payment successful ✓"
                : charge?.status === "CANCELLED"
                ? "Checkout cancelled."
                : charge?.status === "EXPIRED"
                ? "Link expired. Return to the store."
                : "—"}
            </div>

            <small className="block mt-2 text-[#9aa4b2] text-xs">
              Keep this tab open. It updates automatically.
            </small>
          </section>

          {/* Footer */}
          <footer className="flex items-center justify-between px-6 py-4 border-t border-[#332c1f] text-xs text-[#9aa4b2]">
            <span>Powered by sBTC on Stacks</span>
            <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
          </footer>
        </main>
      </div>
    );
  }
  return <ExpiredPage chargeId={chargeId} />;
}
