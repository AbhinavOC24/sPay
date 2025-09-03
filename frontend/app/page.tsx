import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#101010]">
      <Card className="w-full max-w-md bg-[#1D1D1D] border border-[#8787873f]">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-[#BDBDBD]">
            sBTC Merchant Portal
          </CardTitle>
          <CardDescription>
            Secure Bitcoin payments for your business
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Login */}
          <Button asChild className="w-full bg-[#F56E0F] hover:bg-[#f56f0fd1]">
            <Link href="/login" className="text-white">
              Login to Dashboard
            </Link>
          </Button>

          {/* Signup */}
          <Button asChild className="w-full bg-[#383838] hover:bg-[#464646]">
            <Link href="/signup" className="text-white">
              Create Merchant Account
            </Link>
          </Button>

          {/* Docs Links */}
          <Button asChild className="w-full bg-[#383838] hover:bg-[#464646]">
            <a
              href="https://spay-docs.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white"
            >
              Docs (Vercel)
            </a>
          </Button>

          <Button asChild className="w-full bg-[#383838] hover:bg-[#464646]">
            <a
              href="https://spay.gitbook.io/spay-docs/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white"
            >
              Docs (GitBook)
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
