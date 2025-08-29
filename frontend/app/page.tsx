"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useEffect } from "react";
import axios from "axios";

import { useRouter } from "next/navigation";
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const checkMerchant = async () => {
      try {
        const res = await axios.get(`/backend/api/merchants/me`, {
          withCredentials: true,
        });

        if (res.data && res.data.id) {
          router.push("/dashboard");
        }
      } catch (err) {
        console.log("No active merchant session");
      }
    };

    checkMerchant();
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">
            sBTC Merchant Portal
          </CardTitle>
          <CardDescription>
            Secure Bitcoin payments for your business
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button asChild className="w-full">
            <Link href="/login">Login to Dashboard</Link>
          </Button>
          <Button asChild variant="outline" className="w-full bg-transparent">
            <Link href="/signup">Create Merchant Account</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
