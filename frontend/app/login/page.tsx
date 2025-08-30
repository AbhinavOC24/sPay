"use client";

import type React from "react";
import { useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMerchantStore } from "@/store/useMerchantStore";
import left_bg from "../../public/login_left.svg";
import Image from "next/image";
export default function LoginPage() {
  const router = useRouter();

  const login = useMerchantStore((state) => state.login);
  const storeError = useMerchantStore((state) => state.error);
  const storeLoading = useMerchantStore((state) => state.isLoading); // ✅ fixed key

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Please enter a valid email";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    await login(formData.email, formData.password);

    const merchant = useMerchantStore.getState().merchant;
    if (merchant) {
      router.push("/dashboard");
    }
  };

  return (
    <div className="min-h-screen bg-[#101010] flex items-center justify-center p-4">
      <Image src={left_bg} alt="IMg" height={588} />
      <div className="px-16 h-[592px] bg-[#1D1D1D]  border border-[#8787873f] flex flex-col justify-center items-center gap-8">
        <div className="   w-full flex flex-col justify-center items-center">
          <div className="text-3xl font-bold text-center w-full text-[#e6edf3]">
            Welcome Back
          </div>
          <div className="text-[#BDBDBD]   text-[16px] text-center w-full">
            Sign in to your merchant dashboard
          </div>
        </div>
        <div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                className="bg-[#383838]  w-80 h-11 border-[#8787873f] text-[#e6edf3] placeholder:text-[#9aa4b2] focus:border-[#22c55e] focus:ring-[#22c55e]"
                placeholder="Enter your email"
              />
              {errors.email && (
                <p className="text-[#f59e0b] text-sm">{errors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Input
                id="password"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleInputChange}
                className="border border-[#8787873f] w-80 h-11 text-[#e6edf3] placeholder:text-[#9aa4b2] focus:border-[#22c55e] focus:ring-[#22c55e]"
                placeholder="Enter your password"
              />
              {errors.password && (
                <p className="text-[#f59e0b] text-sm">{errors.password}</p>
              )}
            </div>

            {storeError && (
              <p className="text-[#f59e0b] text-sm">{storeError}</p>
            )}

            <Button
              type="submit"
              disabled={storeLoading}
              className="w-80 h-11 bg-[#F56E0F] hover:bg-[#f56f0fd2] text-white font-medium py-2.5 transition-colors duration-200"
            >
              {storeLoading ? "Signing In..." : "Sign In"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-[#9aa4b2] text-sm">
              Don't have an account?{" "}
              <Link
                href="/signup"
                className="text-[#F56E0F] hover:text-[#f56f0fba] font-medium transition-colors duration-200"
              >
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
