import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ArrowRight,
  BarChart3,
  Globe,
  Lock,
  Webhook,
  Wallet,
  FileText,
  Github,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#1F1F1F] text-white relative overflow-hidden">
      {/* Glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[1200px] bg-gradient-radial from-[#F56E0F]/30 via-[#F56E0F]/10 to-transparent blur-[100px] opacity-80" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-radial from-[#F56E0F]/20 via-[#F56E0F]/5 to-transparent blur-3xl opacity-60 animate-pulse" />
        <div
          className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-gradient-radial from-[#F56E0F]/15 via-[#F56E0F]/3 to-transparent blur-2xl opacity-40 animate-pulse"
          style={{ animationDelay: "1s" }}
        />
        <div
          className="absolute top-2/3 right-1/4 w-[300px] h-[300px] bg-gradient-radial from-[#F56E0F]/10 via-[#F56E0F]/2 to-transparent blur-2xl opacity-30 animate-pulse"
          style={{ animationDelay: "2s" }}
        />
        <div
          className="absolute bottom-1/4 left-1/3 w-[200px] h-[200px] bg-gradient-radial from-[#F56E0F]/8 to-transparent blur-xl opacity-25 animate-pulse"
          style={{ animationDelay: "0.5s" }}
        />
        <div
          className="absolute top-1/2 right-1/3 w-[250px] h-[250px] bg-gradient-radial from-[#F56E0F]/6 to-transparent blur-xl opacity-20 animate-pulse"
          style={{ animationDelay: "1.5s" }}
        />
      </div>

      {/* Navigation */}
      <nav className="border-b border-[#2C2C2C] bg-[#1F1F1F]/95 backdrop-blur supports-[backdrop-filter]:bg-[#1F1F1F]/60 relative z-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-[#F56E0F]">sPay</h1>
              <div className="hidden md:flex ml-10 space-x-4">
                <a
                  href="https://spay-docs.vercel.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#BDBDBD] hover:text-white px-3 py-2 rounded-md text-sm font-medium"
                >
                  Docs
                </a>
                <a
                  href="https://spay.gitbook.io/spay-docs/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#BDBDBD] hover:text-white px-3 py-2 rounded-md text-sm font-medium"
                >
                  GitBook Docs
                </a>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Button
                asChild
                variant="outline"
                size="sm"
                className="border border-[#2C2C2C] text-white"
              >
                <Link href="/login">Login to Dashboard</Link>
              </Button>
              <Button
                asChild
                size="sm"
                className="bg-gradient-to-r from-[#F56E0F] to-[#F56E0F]/80 hover:from-[#F56E0F]/90 hover:to-[#F56E0F]/70 text-white"
              >
                <Link href="/signup">Create Merchant Account</Link>
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#1F1F1F] via-[#1F1F1F] to-[#F56E0F]/5 z-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            Accept Bitcoin payments with{" "}
            <span className="text-[#F56E0F]">sBTC</span>.
          </h1>
          <p className="text-xl text-[#BDBDBD] mb-8 max-w-2xl mx-auto">
            Seamless, secure, and developer-friendly payment gateway.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button
              asChild
              size="lg"
              className="bg-gradient-to-r from-[#F56E0F] to-[#F56E0F]/80 hover:from-[#F56E0F]/90 hover:to-[#F56E0F]/70 text-white"
            >
              <Link href="/signup">
                Create merchant account <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border border-white text-white"
            >
              <a
                href="https://spay-docs.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className=" flex items-center gap-1 "
              >
                Docs <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Features (unchanged) */}
      <section id="features" className="py-24 bg-[#1F1F1F] relative z-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Track Payments */}
          <Card className="bg-[#2C2C2C] border border-[#2C2C2C] hover:border-[#F56E0F]/50 transition-colors group">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#F56E0F]/10 text-[#F56E0F] group-hover:bg-[#F56E0F]/20 transition-colors">
                  <BarChart3 className="h-6 w-6" />
                </div>
                <CardTitle>Track Payments</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-[#BDBDBD]">
                Monitor charges, payouts, and refunds in real time with
                analytics.
              </CardDescription>
              <div className="mt-4 h-20 bg-gradient-to-r from-[#F56E0F]/20 to-[#F56E0F]/5 rounded-lg flex items-end justify-center pb-2">
                <div className="flex items-end gap-1">
                  {[40, 60, 30, 80, 50, 70].map((h, i) => (
                    <div
                      key={i}
                      className="w-2 bg-[#F56E0F] rounded-sm"
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Merchant Dashboard */}
          <Card className="bg-[#2C2C2C] border border-[#2C2C2C] hover:border-[#F56E0F]/50 transition-colors group">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#F56E0F]/10 text-[#F56E0F] group-hover:bg-[#F56E0F]/20">
                  <BarChart3 className="h-6 w-6" />
                </div>
                <CardTitle>Merchant Dashboard</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-[#BDBDBD]">
                Manage your sBTC transactions with intuitive controls.
              </CardDescription>
              <div className="mt-4 p-3 bg-[#4B5563]/50 rounded-lg">
                <div className="space-y-2">
                  <div className="h-2 bg-[#F56E0F]/60 rounded w-3/4"></div>
                  <div className="h-2 bg-[#F56E0F]/40 rounded w-1/2"></div>
                  <div className="h-2 bg-[#F56E0F]/20 rounded w-2/3"></div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Developer Docs */}
          <Card className="bg-[#2C2C2C] border border-[#2C2C2C] hover:border-[#F56E0F]/50 group">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#F56E0F]/10 text-[#F56E0F] group-hover:bg-[#F56E0F]/20">
                  <FileText className="h-6 w-6" />
                </div>
                <CardTitle>Developer Docs</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-[#BDBDBD]">
                Well-documented API. Quick start with Vercel or GitBook.
              </CardDescription>
              <div className="mt-4 p-3 bg-[#4B5563]/50 rounded-lg font-mono text-xs">
                <div className="text-[#F56E0F]">
                  {"GET /charges/createCharge"}
                </div>
                <div className="text-[#BDBDBD] mt-1">{"// createPayment"}</div>
              </div>
            </CardContent>
          </Card>

          {/* Global Reach */}
          <Card className="bg-[#2C2C2C] border border-[#2C2C2C] hover:border-[#F56E0F]/50 group">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#F56E0F]/10 text-[#F56E0F] group-hover:bg-[#F56E0F]/20">
                  <Globe className="h-6 w-6" />
                </div>
                <CardTitle>Global Reach</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-[#BDBDBD]">
                Accept Bitcoin payments from anywhere in the world.
              </CardDescription>
              <div className="mt-4 relative h-20 bg-[#4B5563]/20 rounded-lg overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 border-2 border-[#F56E0F]/30 rounded-full flex items-center justify-center">
                    <div className="w-8 h-8 bg-[#F56E0F]/60 rounded-full animate-pulse"></div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Webhook Reliability */}
          <Card className="bg-[#2C2C2C] border border-[#2C2C2C] hover:border-[#F56E0F]/50 group">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#F56E0F]/10 text-[#F56E0F] group-hover:bg-[#F56E0F]/20">
                  <Webhook className="h-6 w-6" />
                </div>
                <CardTitle>Webhook Reliability</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-[#BDBDBD]">
                Idempotent, HMAC-signed webhooks with retries.
              </CardDescription>
              <div className="mt-4 flex items-center gap-2">
                <div className="flex-1 h-2 bg-[#4B5563]/50 rounded-full overflow-hidden">
                  <div className="h-full w-4/5 bg-[#F56E0F] rounded-full"></div>
                </div>
                <span className="text-xs text-[#F56E0F] font-medium">
                  99.9%
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Secure Wallets */}
          <Card className="bg-[#2C2C2C] border border-[#2C2C2C] hover:border-[#F56E0F]/50 group">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#F56E0F]/10 text-[#F56E0F] group-hover:bg-[#F56E0F]/20">
                  <Wallet className="h-6 w-6" />
                </div>
                <CardTitle>Secure Wallets</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-[#BDBDBD]">
                Ephemeral wallets powered by sBTC & Stacks security.
              </CardDescription>
              <div className="mt-4 flex  h-full  items-center justify-center relative">
                <Lock className="h-8 w-8 text-[#F56E0F]" />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
      {/* Footer */}
      <footer className="bg-[#2C2C2C] border-t border-[#2C2C2C] relative z-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="col-span-1 md:col-span-2">
              <h3 className="text-2xl font-bold text-[#F56E0F] mb-4">sPay</h3>
              <p className="text-[#BDBDBD] mb-4">
                The developer-friendly Bitcoin payment gateway powered by sBTC.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Documentation</h4>
              <ul className="space-y-2 text-[#BDBDBD]">
                <li>
                  <a
                    href="https://spay-docs.vercel.app/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-orange-500 flex items-center gap-1"
                  >
                    Vercel Docs <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>
                  <a
                    href="https://spay.gitbook.io/spay-docs/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-orange-500 flex items-center gap-1"
                  >
                    GitBook Docs <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/AbhinavOC24/sPay"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-orange-500 flex items-center gap-1"
                  >
                    GitHub Repo <Github className="h-3 w-3" />
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-[#BDBDBD]">
                <li>
                  <a
                    href="https://x.com/ThatPahadiKid"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-orange-500"
                  >
                    Twitter
                  </a>
                </li>
                {/* <li>
                  <a href="#" className="hover:text-orange-500">
                    Help Center
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white">
                    Status
                  </a>
                </li> */}
              </ul>
            </div>
          </div>
          <div className="border-t border-[#2C2C2C] mt-8 pt-8 text-center text-[#BDBDBD]">
            <p>Built with ❤️ for sBTC on Stacks.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
