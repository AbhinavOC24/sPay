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
    <div className="min-h-screen bg-[#0b0d10] flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-[#12161b] border-gray-800">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-[#e6edf3]">
            Welcome Back
          </CardTitle>
          <CardDescription className="text-[#9aa4b2]">
            Sign in to your merchant dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[#e6edf3]">
                Email Address
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                className="bg-[#0b0d10] border-gray-700 text-[#e6edf3] placeholder:text-[#9aa4b2] focus:border-[#22c55e] focus:ring-[#22c55e]"
                placeholder="Enter your email"
              />
              {errors.email && (
                <p className="text-[#f59e0b] text-sm">{errors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-[#e6edf3]">
                Password
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleInputChange}
                className="bg-[#0b0d10] border-gray-700 text-[#e6edf3] placeholder:text-[#9aa4b2] focus:border-[#22c55e] focus:ring-[#22c55e]"
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
              className="w-full bg-[#22c55e] hover:bg-[#16a34a] text-white font-medium py-2.5 transition-colors duration-200"
            >
              {storeLoading ? "Signing In..." : "Sign In"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-[#9aa4b2] text-sm">
              Don't have an account?{" "}
              <Link
                href="/signup"
                className="text-[#22c55e] hover:text-[#16a34a] font-medium transition-colors duration-200"
              >
                Create one
              </Link>
            </p>
          </div>

          <div className="mt-4 text-center">
            <Link
              href="/forgot-password"
              className="text-[#9aa4b2] hover:text-[#e6edf3] text-sm transition-colors duration-200"
            >
              Forgot your password?
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
