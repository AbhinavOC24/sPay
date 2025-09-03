// stores/useMerchantStore.ts
"use client";

import { create } from "zustand";
import axios from "axios";

interface Merchant {
  id: string;
  name: string;
  email: string;
  apiKey: string;
  apiSecret: string;
  payoutStxAddress?: string;
  webhookUrl?: string;
  webhookSecret?: string;
}

interface Charge {
  chargeId: string;
  createdAt: string;
  amountSbtc: number;
  amountUsd: number;
  payerAddress: string;
  status: string;
  order_id: string;
}

interface RotateSecretResponse {
  message: string;
  apiKey: string;
  apiSecret: string;
}

interface MerchantStore {
  merchant: Merchant | null;
  charges: Charge[];
  isLoading: boolean;
  error: string | null;
  newPaymentModalStatus: boolean;
  fetchMerchant: () => Promise<void>;
  fetchCharges: () => Promise<void>;
  rotateSecret: () => Promise<RotateSecretResponse>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateNewPaymentModalStatus: (status: boolean) => void;
  updateConfig: (
    payoutStxAddress: string,
    webhookUrl: string,
    webhookSecret: string
  ) => Promise<void>;
}

export const useMerchantStore = create<MerchantStore>((set, get) => ({
  merchant: null,
  charges: [],
  isLoading: false,
  error: null,
  newPaymentModalStatus: false,
  updateNewPaymentModalStatus: (status) =>
    set({ newPaymentModalStatus: status }),
  fetchMerchant: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await axios.get(`/backend/merchants/me`, {
        withCredentials: true,
      });
      set({ merchant: res.data });
    } catch (err: any) {
      set({ error: err.response?.data?.error || "Failed to fetch merchant" });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchCharges: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await axios.get(`backend/merchants/charges`, {
        withCredentials: true,
      });
      set({ charges: res.data.charges });
    } catch (err: any) {
      set({ error: err.response?.data?.error || "Failed to fetch charges" });
    } finally {
      set({ isLoading: false });
    }
  },

  rotateSecret: async (): Promise<RotateSecretResponse> => {
    const res = await axios.post<RotateSecretResponse>(
      "backend/merchants/api-secret/rotate",
      {},
      { withCredentials: true }
    );
    const currentMerchant = get().merchant;
    if (currentMerchant) {
      set({
        merchant: {
          ...currentMerchant,
          apiKey: res.data.apiKey,
          apiSecret: res.data.apiSecret,
        },
      });
    }

    return res.data;
  },
  signup: async (name, email, password) => {
    set({ isLoading: true, error: null });
    try {
      await axios.post(
        `/backend/merchants/signup`,
        { name, email, password },
        { withCredentials: true }
      );
      await useMerchantStore.getState().fetchMerchant();
    } catch (err: any) {
      set({
        error: err.response?.data?.error || "Signup failed",
      });
    } finally {
      set({ isLoading: false });
    }
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      await axios.post(
        `backend/merchants/login`,
        { email, password },
        { withCredentials: true }
      );
      await useMerchantStore.getState().fetchMerchant();
    } catch (err: any) {
      set({
        error: err.response?.data?.error || "Login failed",
      });
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    set({ isLoading: true, error: null });
    try {
      await axios.post(
        `backend/merchants/logout`,
        {},
        { withCredentials: true }
      );
      set({ merchant: null, charges: [] });
    } catch (err: any) {
      set({
        error: err.response?.data?.error || "Logout failed",
      });
    } finally {
      set({ isLoading: false });
    }
  },

  updateConfig: async (
    payoutStxAddress?: string,
    webhookUrl?: string,
    webhookSecret?: string
  ) => {
    set({ isLoading: true, error: null });

    try {
      const body: Record<string, string> = {};
      if (payoutStxAddress) body.payoutStxAddress = payoutStxAddress;
      if (webhookUrl) body.webhookUrl = webhookUrl;
      if (webhookSecret) body.webhookSecret = webhookSecret;

      const res = await fetch(`/backend/merchants/config`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Update failed");
      }

      const updated = await res.json();
      set({ merchant: { ...get().merchant, ...updated }, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
}));
