"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const init = async () => {
      try {
        await fetchMerchant();
        await fetchCharges();
      } catch (err) {
        console.error("❌ Merchant fetch failed:", err);
        router.push("/"); // kick back to home
      }
    };
    init();
  }, [fetchMerchant, fetchCharges, router]);

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

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
        return <Badge className="bg-[#22c55e] text-white">Completed</Badge>;
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

  return (
    <div className="min-h-screen bg-[#0b0d10]">
      {/* Header */}
      <header className="bg-[#12161b] border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-8 h-8 bg-[#22c55e] rounded-lg flex items-center justify-center">
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
            <Button
              onClick={() => router.push("/settings")}
              variant="outline"
              size="sm"
              className="bg-transparent border-gray-700 text-[#9aa4b2] hover:text-[#e6edf3]"
            >
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
            <Button
              onClick={handleLogout}
              variant="outline"
              className="bg-transparent border-gray-700 text-[#9aa4b2] hover:text-[#e6edf3]"
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
          <Card className="bg-[#12161b] border-gray-800">
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
          <Card className="bg-[#12161b] border-gray-800">
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
          <Card className="bg-[#12161b] border-gray-800">
            <CardHeader>
              <CardTitle className="text-[#e6edf3] text-lg font-medium">
                Total sBTC Received
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-[#22c55e]">
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
          className="bg-[#22c55e]  rounded-xl px-4 py-2 w-fit mb-4 cursor-pointer"
          onClick={() => updateNewPaymentModalStatus(true)}
        >
          Create a Payment
        </div>

        {/* Transactions Table */}
        <Card className="bg-[#12161b] border-gray-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-[#e6edf3] text-xl">
                Recent Transactions
              </CardTitle>
              <div className="flex items-center space-x-2">
                <Filter className="w-4 h-4 text-[#9aa4b2]" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px] bg-[#0b0d10] border-gray-700 text-[#e6edf3]">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#12161b] border-gray-700">
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
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-3 px-4 text-[#9aa4b2]">
                      Charge ID
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
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((t) => (
                    <tr
                      key={t.chargeId}
                      className="border-b border-gray-800 hover:bg-[#1a1f26]"
                    >
                      <td className="py-3 px-4 text-[#e6edf3]  text-sm">
                        {t.chargeId}
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
      <NewPaymentModal />
    </div>
  );
}
