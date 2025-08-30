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
import bg_left from "../../public/login_left.svg";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMerchantStore } from "@/store/useMerchantStore";
import Image from "next/image";
import { LucideEggFried } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const { signup, merchant, error: storeError, isLoading } = useMerchantStore();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
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
    if (!formData.name.trim()) newErrors.name = "Name is required";
    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Please enter a valid email";
    }
    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
    }
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password";
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    await signup(formData.name, formData.email, formData.password);

    if (useMerchantStore.getState().merchant) {
      router.push("/dashboard");
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0d10] flex items-center justify-center p-4">
      {/* Left background image like login */}
      <Image src={bg_left} alt="IMG" height={588} />

      {/* Signup panel */}
      <div className="px-14 py-[64px]  bg-[#1D1D1D]  border border-[#8787873f] flex flex-col justify-center items-center gap-8  max-w-md">
        <div className="w-full flex flex-col gap-8">
          <div className="w-full  flex flex-col justify-center items-center ">
            <div className="text-[44px] font-bold text-center w-[380px]  text-[#e6edf3]">
              Create Account
            </div>
            <div className="text-[#BDBDBD] text-[16px] text-center w-full">
              Start accepting sBTC payments today
            </div>
          </div>

          <div className="w-full flex flex-col gap-2">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Full Name */}
              <div className="">
                <Input
                  id="name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Enter your full name"
                  className="bg-[#383838] border border-[#8787873f] w-full h-11 text-[#e6edf3] placeholder:text-[#9aa4b2] focus:border-[#22c55e] focus:ring-[#22c55e]"
                />
                {errors.name && (
                  <p className="text-[#f59e0b] text-sm">{errors.name}</p>
                )}
              </div>

              {/* Email */}
              <div className="">
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="Enter your email"
                  className="bg-[#383838] border border-[#8787873f] w-full h-11 text-[#e6edf3] placeholder:text-[#9aa4b2] focus:border-[#22c55e] focus:ring-[#22c55e]"
                />
                {errors.email && (
                  <p className="text-[#f59e0b] text-sm">{errors.email}</p>
                )}
              </div>

              {/* Password */}
              <div className="">
                <Input
                  id="password"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="Create a password"
                  className="bg-[#383838] border border-[#8787873f] w-full h-11 text-[#e6edf3] placeholder:text-[#9aa4b2] focus:border-[#22c55e] focus:ring-[#22c55e]"
                />
                {errors.password && (
                  <p className="text-[#f59e0b] text-sm">{errors.password}</p>
                )}
              </div>

              {/* Confirm Password */}
              <div className="">
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  placeholder="Confirm your password"
                  className="bg-[#383838] border border-[#8787873f] w-full h-11 text-[#e6edf3] placeholder:text-[#9aa4b2] focus:border-[#22c55e] focus:ring-[#22c55e]"
                />
                {errors.confirmPassword && (
                  <p className="text-[#f59e0b] text-sm">
                    {errors.confirmPassword}
                  </p>
                )}
              </div>

              {/* Store error */}
              {storeError && (
                <p className="text-[#f59e0b] text-sm">{storeError}</p>
              )}

              {/* Submit button */}
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 bg-[#F56E0F] hover:bg-[#f56f0fbe] text-white font-medium py-2.5 transition-colors duration-200"
              >
                {isLoading ? "Creating Account..." : "Create Account"}
              </Button>
            </form>

            {/* Bottom text */}
            <div className="mt-6 text-center">
              <p className="text-[#9aa4b2] text-sm">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="text-[#F56E0F] hover:text-[#f56f0fce] font-medium transition-colors duration-200"
                >
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
