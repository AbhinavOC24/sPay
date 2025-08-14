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
      <Card className="w-full max-w-md bg-[#12161b] border-gray-800">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-[#e6edf3]">
            Create Account
          </CardTitle>
          <CardDescription className="text-[#9aa4b2]">
            Start accepting sBTC payments today
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-[#e6edf3]">
                Full Name
              </Label>
              <Input
                id="name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Enter your full name"
                className="bg-[#0b0d10] border-gray-700 text-[#e6edf3] placeholder:text-[#9aa4b2] focus:border-[#22c55e] focus:ring-[#22c55e]"
              />
              {errors.name && (
                <p className="text-[#f59e0b] text-sm">{errors.name}</p>
              )}
            </div>

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
                placeholder="Enter your email"
                className="bg-[#0b0d10] border-gray-700 text-[#e6edf3] placeholder:text-[#9aa4b2] focus:border-[#22c55e] focus:ring-[#22c55e]"
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
                placeholder="Create a password"
                className="bg-[#0b0d10] border-gray-700 text-[#e6edf3] placeholder:text-[#9aa4b2] focus:border-[#22c55e] focus:ring-[#22c55e]"
              />
              {errors.password && (
                <p className="text-[#f59e0b] text-sm">{errors.password}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-[#e6edf3]">
                Confirm Password
              </Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                placeholder="Confirm your password"
                className="bg-[#0b0d10] border-gray-700 text-[#e6edf3] placeholder:text-[#9aa4b2] focus:border-[#22c55e] focus:ring-[#22c55e]"
              />
              {errors.confirmPassword && (
                <p className="text-[#f59e0b] text-sm">
                  {errors.confirmPassword}
                </p>
              )}
            </div>

            {storeError && (
              <p className="text-[#f59e0b] text-sm">{storeError}</p>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#22c55e] hover:bg-[#16a34a] text-white font-medium py-2.5 transition-colors duration-200"
            >
              {isLoading ? "Creating Account..." : "Create Account"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-[#9aa4b2] text-sm">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-[#22c55e] hover:text-[#16a34a] font-medium transition-colors duration-200"
              >
                Sign in
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
