"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Copy, Check } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings, Filter } from "lucide-react";
import { useMerchantStore } from "@/store/useMerchantStore";
import NewPaymentModal from "@/components/ui/newPaymentModal";

export default function DashboardPage() {
  const router = useRouter();
  const {
    merchant,
    charges,
    fetchMerchant,
    fetchCharges,
    logout,
    updateNewPaymentModalStatus,
  } = useMerchantStore();
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const init = async () => {
      try {
        await fetchMerchant();
        await fetchCharges();
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [fetchMerchant, fetchCharges]);

  useEffect(() => {
    if (!loading && !merchant) {
      router.push("/");
    }
  }, [loading, merchant, router]);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  // Compute stats from charges
  const stats = useMemo(() => {
    const totalPaymentsCount = charges.length;
    const totalPaymentsBtc = charges.reduce(
      (acc: number, c: { amountSbtc: number }) => acc + c.amountSbtc,
      0
    );
    const totalPaymentsUsd = charges.reduce(
      (acc: number, c: { amountUsd: number }) => acc + c.amountUsd,
      0
    );

    const pendingCharges = charges.filter(
      (c: any) => c.status.toLowerCase() === "pending"
    );
    const pendingBtc = pendingCharges.reduce(
      (acc: number, c: { amountSbtc: number }) => acc + c.amountSbtc,
      0
    );
    const pendingUsd = pendingCharges.reduce(
      (acc: number, c: { amountUsd: number }) => acc + c.amountUsd,
      0
    );

    const totalReceivedBtc = charges
      .filter((c: any) => c.status.toLowerCase() === "completed")
      .reduce(
        (acc: number, c: { amountSbtc: number }) => acc + c.amountSbtc,
        0
      );
    const totalReceivedUsd = charges
      .filter((c: any) => c.status.toLowerCase() === "completed")
      .reduce((acc: number, c: { amountUsd: number }) => acc + c.amountUsd, 0);

    return {
      totalPayments: {
        count: totalPaymentsCount,
        btc: totalPaymentsBtc,
        usd: totalPaymentsUsd,
      },
      pendingPayouts: {
        count: pendingCharges.length,
        btc: pendingBtc,
        usd: pendingUsd,
      },
      totalReceived: { btc: totalReceivedBtc, usd: totalReceivedUsd },
    };
  }, [charges]);

  const filteredTransactions =
    statusFilter === "all"
      ? charges
      : charges.filter((t) => t.status.toLowerCase() === statusFilter);
  console.log(filteredTransactions);
  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
        return <Badge className="bg-[#22C55E] text-white">Completed</Badge>;
      case "pending":
        return <Badge className="bg-[#f59e0b] text-white">Pending</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      case "expired":
        return <Badge className="bg-gray-600 text-white">Expired</Badge>;
      case "cancelled":
        return <Badge className="bg-gray-500 text-white">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-white">
        Loading...
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-[#101010]">
      {/* Header */}
      <header className="bg-[#1D1D1D] border-b border-[#1d1d1da4] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-8 h-8 bg-[#F56E0F] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">₿</span>
            </div>
            <div>
              <h1 className="text-[#e6edf3] font-semibold text-lg">
                sBTC Merchant Portal
              </h1>
              <p className="text-[#9aa4b2] text-sm">
                Welcome back, {merchant ? merchant.name : "Loading..."}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Docs links */}
            <a
              href="https://spay-docs.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#9aa4b2] hover:text-[#e6edf3] text-sm px-3 py-1 border border-[#8787873f] rounded-md"
            >
              Docs (Vercel)
            </a>
            <a
              href="https://spay.gitbook.io/spay-docs/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#9aa4b2] hover:text-[#e6edf3] text-sm px-3 py-1 border border-[#8787873f] rounded-md"
            >
              Docs (GitBook)
            </a>

            <Button
              onClick={() => router.push("/settings")}
              variant="outline"
              size="sm"
              className="bg-transparent border-[#8787873f] text-[#9aa4b2] hover:text-[#e6edf3]"
            >
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
            <Button
              onClick={handleLogout}
              variant="outline"
              className="bg-transparent border-[#8787873f] text-[#9aa4b2] hover:text-[#e6edf3]"
            >
              Logout
            </Button>
          </div>
        </div>
      </header>
      {/* Main Content */}
      <main className="p-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Total Payments */}
          <Card className="bg-[#1D1D1D] border-[#8787873f]">
            <CardHeader>
              <CardTitle className="text-[#e6edf3] text-lg font-medium">
                Total Payments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-[#e6edf3]">
                {stats.totalPayments.count}
              </p>
              <p className="text-[#e6edf3] font-medium">
                {stats.totalPayments.btc.toFixed(8)} sBTC{" "}
                <span className="text-[#9aa4b2] text-sm">
                  (${stats.totalPayments.usd.toFixed(2)})
                </span>
              </p>
            </CardContent>
          </Card>

          {/* Pending Payouts */}
          <Card className="bg-[#1D1D1D] border-[#8787873f]">
            <CardHeader>
              <CardTitle className="text-[#e6edf3] text-lg font-medium">
                Pending Payouts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-[#f59e0b]">
                {stats.pendingPayouts.count}
              </p>
              <p className="text-[#e6edf3] font-medium">
                {stats.pendingPayouts.btc.toFixed(8)} sBTC{" "}
                <span className="text-[#9aa4b2] text-sm">
                  (${stats.pendingPayouts.usd.toFixed(2)})
                </span>
              </p>
            </CardContent>
          </Card>

          {/* Total sBTC Received */}
          <Card className="bg-[#1D1D1D] border-[#8787873f]">
            <CardHeader>
              <CardTitle className="text-[#e6edf3] text-lg font-medium">
                Total sBTC Received
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-[#22C55E]">
                {stats.totalReceived.btc.toFixed(8)}
              </p>
              <p className="text-[#e6edf3] font-medium">
                sBTC{" "}
                <span className="text-[#9aa4b2] text-sm">
                  (${stats.totalReceived.usd.toFixed(2)})
                </span>
              </p>
            </CardContent>
          </Card>
        </div>
        <div
          className="bg-[#F56E0F]  rounded-xl px-4 py-2 w-fit mb-4 cursor-pointer"
          onClick={() => updateNewPaymentModalStatus(true)}
        >
          Create a Payment
        </div>

        {/* Transactions Table */}
        <Card className="bg-[#1D1D1D] border-[#8787873f]">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-[#e6edf3] text-xl">
                Recent Transactions
              </CardTitle>
              <div className="flex items-center space-x-2">
                <Filter className="w-4 h-4 text-[#9aa4b2]" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px] bg-[#0B0D10] border-[#8787873f] text-[#e6edf3]">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1D1D1D] border-[#8787873f]">
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#8787873f]">
                    <th className="text-left py-3 px-4 text-[#9aa4b2]">
                      Charge ID
                    </th>
                    <th className="text-left py-3 px-4 text-[#9aa4b2]">
                      Order Id
                    </th>
                    <th className="text-left py-3 px-4 text-[#9aa4b2]">
                      Created
                    </th>
                    <th className="text-left py-3 px-4 text-[#9aa4b2]">
                      Amount
                    </th>
                    <th className="text-left py-3 px-4 text-[#9aa4b2]">
                      Status
                    </th>
                    <th className="text-left py-3 px-4 text-[#9aa4b2]">
                      Payer
                    </th>
                  </tr>
                </thead>

                {filteredTransactions.map((t) => (
                  <tbody key={t.chargeId}>
                    <tr
                      key={t.chargeId}
                      className="border-b border-[#8787873f] hover:bg-[#1a1f26]"
                    >
                      <td className="py-3 px-4 text-[#e6edf3] text-sm">
                        {t.chargeId}
                      </td>
                      <td className="py-3 px-4 text-[#e6edf3] text-sm">
                        {t.order_id}
                      </td>
                      <td className="py-3 px-4 text-[#e6edf3]">
                        {new Date(t.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-[#e6edf3]">
                        {t.amountSbtc.toFixed(8)} sBTC{" "}
                        <span className="text-[#9aa4b2] text-sm">
                          (${t.amountUsd.toFixed(2)})
                        </span>
                      </td>
                      <td className="py-3 px-4">{getStatusBadge(t.status)}</td>
                      {/* New payer column */}
                      <td className="py-3 px-4 ">
                        {t.payerAddress ? (
                          <div className="flex items-center  gap-2">
                            {/* truncated address */}
                            <span className="text-[#e6edf3] font-mono text-xs max-w-[140px] truncate">
                              {t.payerAddress}
                            </span>

                            {/* copy button (always visible) */}
                            <button
                              onClick={async () => {
                                await navigator.clipboard.writeText(
                                  t.payerAddress
                                );
                                const btn = document.getElementById(
                                  `copy-${t.chargeId}`
                                );
                                if (btn) {
                                  btn.dataset.copied = "true";
                                  setTimeout(() => {
                                    btn.dataset.copied = "false";
                                  }, 1500);
                                }
                              }}
                              id={`copy-${t.chargeId}`}
                              data-copied="false"
                              className="text-[#9aa4b2] hover:text-[#e6edf3] transition-colors"
                              title="Copy payer address"
                            >
                              {/* default copy icon */}
                              <Copy
                                className="h-4 w-4"
                                data-show-when="false"
                              />
                              {/* copied check icon */}
                              <Check
                                className="h-4 w-4 text-green-500"
                                data-show-when="true"
                                style={{ display: "none" }}
                              />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[#9aa4b2] text-sm">—</span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                ))}
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
      <NewPaymentModal />
    </div>
  );
}
