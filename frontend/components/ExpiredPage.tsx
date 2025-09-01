"use client";
import { useEffect, useState } from "react";
import axios from "axios";

interface Charge {
  chargeId: string;
  amount: number;
  usdRate?: number;
  cancel_url?: string;
  status: string;
  expiresAt?: string;
}

export default function ExpiredPage({ chargeId }: { chargeId: string }) {
  const [charge, setCharge] = useState<Charge | null>(null);
  const [copied, setCopied] = useState(false);
  const [ts, setTs] = useState<string>("");

  const fmtAmount = (amt?: number) =>
    amt ? (amt / 1e8).toFixed(8).replace(/0+$/, "").replace(/\.$/, "") : "—";

  useEffect(() => {
    setTs(new Date().toLocaleString());

    axios
      .get(`/backend/charges/${chargeId}`, {
        headers: { "Cache-Control": "no-store" },
      })
      .then((res) => setCharge(res.data))
      .catch(() => {});
  }, [chargeId]);

  return (
    <div className="min-h-screen bg-[#100e0b] flex items-center justify-center p-6 text-[#e6edf3]">
      <main className="bg-[#1b1612] border border-[#372d1f] rounded-2xl shadow-xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <header className="flex items-center gap-3 px-6 py-5 border-b border-[#372b1f]">
          <span
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border border-red-500 bg-red-500/10 text-red-500"
            title="This checkout link has expired"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M12 6v6l4 2"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
              />
            </svg>
            EXPIRED
          </span>
          <h1 className="text-lg font-semibold">Checkout link expired</h1>
        </header>

        {/* Body */}
        <section className="px-6 py-6">
          <p className="text-[#9aa4b2] text-sm leading-relaxed">
            This payment link is no longer valid. Price locks last for a short
            window to account for BTC volatility. Please return to the store to
            get a fresh link.
          </p>

          <div className="mt-5 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#9aa4b2]">Charge ID</span>
              <span className="font-mono">{charge?.chargeId || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#9aa4b2]">Requested (sBTC)</span>
              <span className="font-mono">{fmtAmount(charge?.amount)}</span>
            </div>
            {charge?.usdRate && (
              <div className="flex justify-between">
                <span className="text-[#9aa4b2]">≈ USD </span>
                <span className="font-mono">{charge.usdRate.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3 mt-6">
            {charge?.cancel_url && (
              <a
                href={charge.cancel_url}
                className="px-4 py-2 rounded-lg bg-[#372d1f] text-[#e6edf3] font-semibold border border-[#1f2937] hover:brightness-110"
              >
                Return to store
              </a>
            )}
            <button
              className="px-4 py-2 rounded-lg cursor-pointer border border-[#372e1f] text-sm hover:brightness-110"
              onClick={() => location.reload()}
            >
              Refresh page
            </button>
            <button
              className="px-4 py-2 rounded-lg border cursor-pointer border-[#372d1f] text-sm hover:brightness-110"
              onClick={async () => {
                await navigator.clipboard.writeText(charge?.chargeId || "");
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
            >
              {copied ? "Copied!" : "Copy ID"}
            </button>
          </div>

          <div className="mt-4 text-xs text-[#9aa4b2]">
            If you believe this is a mistake, contact the merchant and share
            your Charge ID.
          </div>
        </section>

        {/* Footer */}
        <footer className="px-6 py-4 border-t border-[#372b1f] text-xs text-[#9aa4b2] flex justify-between items-center">
          <span>Powered by sBTC on Stacks</span>
          <span>{ts}</span>
        </footer>
      </main>
    </div>
  );
}
