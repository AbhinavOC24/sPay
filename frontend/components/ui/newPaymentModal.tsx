"use client";

import { useState } from "react";
import { useMerchantStore } from "@/store/useMerchantStore";
import axios from "axios";

export default function NewPaymentModal() {
  const {
    newPaymentModalStatus,
    updateNewPaymentModalStatus,
    merchant,
    fetchCharges,
  } = useMerchantStore();

  const [errors, setErrors] = useState<{ amount?: string; order_id?: string }>(
    {}
  );

  const [loading, setLoading] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState({
    amount: "", // 👈 keep as string
    order_id: "",
    success_url: "",
    cancel_url: "",
    manual: true,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value }); // 👈 don't Number() here
  };

  const validate = () => {
    const newErrors: { amount?: string; order_id?: string } = {};
    const amountNum = Number(form.amount);

    if (!form.amount || isNaN(amountNum) || amountNum <= 0) {
      newErrors.amount = "Amount must be greater than 0";
    }
    if (!form.order_id.trim()) {
      newErrors.order_id = "Order ID is required";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      setLoading(true);
      const idempotencyKey = crypto.randomUUID();
      const res = await axios.post(
        `/backend/charges/createCharge`,
        {
          ...form,
          amount: Number(form.amount), // 👈 convert only here
        },
        {
          headers: {
            "Idempotency-Key": idempotencyKey,
            Authorization: `Bearer ${merchant?.apiKey}:${merchant?.apiSecret}`,
          },
          withCredentials: true,
        }
      );
      setPaymentUrl(res.data.paymentUrl);
    } catch (err) {
      console.error("❌ Failed to create charge:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (paymentUrl) {
      await navigator.clipboard.writeText(paymentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  if (!newPaymentModalStatus) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      {/* Background dim */}
      <div
        className="absolute inset-0 bg-black opacity-60"
        onClick={() => updateNewPaymentModalStatus(false)}
      />

      {/* Modal content */}
      <div className="relative bg-[#1D1D1D] border border-[#8787873f]  p-6 rounded-lg shadow-lg w-full max-w-md z-10">
        <h2 className="text-xl font-bold text-[#e6edf3]   mb-4">
          Create a New Payment
        </h2>

        {!paymentUrl ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <input
                type="number"
                name="amount"
                min="0.00000001"
                step="0.00000001"
                value={form.amount}
                onChange={handleChange}
                placeholder="Amount (sBTC)"
                className="w-full p-2 rounded bg-[#0b0d10] border border-[#8787873f] text-[#e6edf3]"
                required
              />
              {errors.amount && (
                <p className="text-red-500 text-sm mt-1">{errors.amount}</p>
              )}
            </div>

            <div>
              <input
                type="text"
                name="order_id"
                value={form.order_id}
                onChange={handleChange}
                placeholder="Order ID"
                className="w-full p-2 rounded bg-[#0b0d10] border border-[#8787873f] text-[#e6edf3]"
                required
              />
              {errors.order_id && (
                <p className="text-red-500 text-sm mt-1">{errors.order_id}</p>
              )}
            </div>

            <input
              type="url"
              name="success_url"
              value={form.success_url}
              onChange={handleChange}
              placeholder="Success URL (optional)"
              className="w-full p-2 rounded bg-[#0b0d10] border border-[#8787873f] text-[#e6edf3]"
            />
            <input
              type="url"
              name="cancel_url"
              value={form.cancel_url}
              onChange={handleChange}
              placeholder="Cancel URL (optional)"
              className="w-full p-2 rounded bg-[#0b0d10] border border-[#8787873f] text-[#e6edf3]"
            />

            <div className="flex justify-end space-x-3 mt-4">
              <button
                type="button"
                onClick={() => updateNewPaymentModalStatus(false)}
                className="px-4 py-2 rounded bg-[#303030] text-[#e6edf3] hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded bg-[#F56E0F] text-white hover:bg-[#f56f0fdb] disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-[#e6edf3]">✅ Payment created successfully!</p>
            <div className="flex items-center bg-[#0b0d10] border border-[#8787873f] rounded px-3 py-2">
              <span className="text-[#F56E0F] break-all text-sm flex-1">
                {paymentUrl}
              </span>
              <button
                onClick={handleCopy}
                className="ml-3 px-3 py-1 rounded bg-[#F56E0F] text-white hover:bg-[#f56f0fcc] text-sm"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>

            <div className="flex justify-end gap-3">
              <div className="flex justify-end space-x-3">
                <a
                  href={paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded bg-[#F56E0F] text-white hover:bg-[#f56f0fce]"
                >
                  Go to Checkout
                </a>
              </div>

              <button
                onClick={async () => {
                  updateNewPaymentModalStatus(false);
                  setForm({
                    amount: "",
                    success_url: "",
                    cancel_url: "",
                    order_id: "",
                    manual: true,
                  });
                  setPaymentUrl(null);
                  setErrors({});
                  await fetchCharges();
                }}
                className="px-4 py-2 rounded bg-gray-700 text-[#e6edf3] hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
