"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Copy, Check, ArrowLeft } from "lucide-react";
import { useMerchantStore } from "@/store/useMerchantStore";

export default function SettingsPage() {
  const router = useRouter();
  const { merchant, fetchMerchant, updateConfig, logout } = useMerchantStore();

  const [webhookSettings, setWebhookSettings] = useState({
    payoutStxAddress: "",
    webhookUrl: "",
    webhookSecret: "",
  });
  const [apiCredentials, setApiCredentials] = useState({
    apiKey: "",
    apiSecret: "",
  });

  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);

  useEffect(() => {
    fetchMerchant();
  }, [fetchMerchant]);

  useEffect(() => {
    if (merchant) {
      setWebhookSettings({
        payoutStxAddress: merchant.payoutStxAddress || "",
        webhookUrl: merchant.webhookUrl || "",
        webhookSecret: merchant.webhookSecret || "",
      });
      setApiCredentials({
        apiKey: merchant.apiKey || "",
        apiSecret: merchant.apiSecret || "",
      });
    }
  }, [merchant]);

  const handleWebhookChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setWebhookSettings((prev) => ({ ...prev, [name]: value }));
  };

  const saveField = async () => {
    setIsSaving(true);
    try {
      await updateConfig(
        webhookSettings.payoutStxAddress,
        webhookSettings.webhookUrl,
        webhookSettings.webhookSecret
      );
      setEditingField(null);
    } catch (err) {
      console.error("Error saving config:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-black">
      {/* Top Navigation */}
      <header className="bg-[#131313] border-b  border-[#8787873f] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              onClick={() => router.push("/dashboard")}
              variant="ghost"
              size="sm"
              className="text-[#9aa4b2] hover:text-[#e6edf3] hover:bg-[#0b0d10] p-2"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="w-8 h-8 bg-[#F56E0F] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">₿</span>
            </div>
            <div>
              <h1 className="text-[#e6edf3] font-semibold text-lg">Settings</h1>
              <p className="text-[#9aa4b2] text-sm">
                Manage your API credentials and webhooks
              </p>
            </div>
          </div>
          <Button
            onClick={handleLogout}
            variant="outline"
            className="bg-transparent border-[#8787873f] text-[#9aa4b2] hover:bg-[#0b0d10] hover:text-[#e6edf3]"
          >
            Logout
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6 max-w-4xl mx-auto">
        {/* API Credentials */}
        <Card className="bg-[#1D1D1D] border border-[#8787873f] mb-8">
          <CardHeader>
            <CardTitle className="text-[#e6edf3] text-xl">
              API Credentials
            </CardTitle>
            <p className="text-[#9aa4b2] text-sm">
              Your API keys for integrating with the sBTC payment gateway
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* API Key */}
            <div className="space-y-2">
              <Label className="text-[#e6edf3]">API Key</Label>
              <div className="relative">
                <Input
                  type={showApiKey ? "text" : "password"}
                  value={apiCredentials.apiKey}
                  readOnly
                  className="bg-[#0b0d10] border-[#8787873f] text-[#e6edf3] pr-20 font-mono text-sm"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="h-8 w-8 p-0 text-[#9aa4b2]"
                  >
                    {showApiKey ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      copyToClipboard(apiCredentials.apiKey, "apiKey")
                    }
                    className="h-8 w-8 p-0 text-[#9aa4b2]"
                  >
                    {copiedField === "apiKey" ? (
                      <Check className="w-4 h-4 text-[#ff8025]" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* API Secret */}
            <div className="space-y-2">
              <Label className="text-[#e6edf3]">API Secret</Label>
              <div className="relative">
                <Input
                  type={showApiSecret ? "text" : "password"}
                  value={apiCredentials.apiSecret}
                  readOnly
                  className="bg-[#0b0d10] border-[#8787873f] text-[#e6edf3] pr-20 font-mono text-sm"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowApiSecret(!showApiSecret)}
                    className="h-8 w-8 p-0 text-[#9aa4b2]"
                  >
                    {showApiSecret ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      copyToClipboard(apiCredentials.apiSecret, "apiSecret")
                    }
                    className="h-8 w-8 p-0 text-[#9aa4b2]"
                  >
                    {copiedField === "apiSecret" ? (
                      <Check className="w-4 h-4 text-[#F56E0F]" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      try {
                        const res = await useMerchantStore
                          .getState()
                          .rotateSecret();
                        setApiCredentials({
                          apiKey: res.apiKey,
                          apiSecret: res.apiSecret,
                        });
                      } catch (err) {
                        console.error("Failed to rotate secret", err);
                      }
                    }}
                    className="h-8 px-2 text-xs text-red-400 hover:text-red-200"
                  >
                    Rotate
                  </Button>
                </div>
              </div>
            </div>
            <p className="text-xs text-[#9aa4b2] mt-1">
              Your API Secret is sensitive. Use it only in your server backend.
              If you believe it may have been exposed, rotate it immediately
              from this page.
            </p>
          </CardContent>
        </Card>

        {/* Config Fields */}
        <Card className="bg-[#1D1D1D] border border-[#8787873f]">
          <CardHeader>
            <CardTitle className="text-[#e6edf3] text-xl">
              Webhook & Payout Settings
            </CardTitle>
            <p className="text-[#9aa4b2] text-sm">
              Configure payout address and webhook
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              {
                label: "Payout STX Address",
                name: "payoutStxAddress",
                type: "text",
                placeholder: "Enter payout STX address",
              },
              {
                label: "Webhook URL",
                name: "webhookUrl",
                type: "url",
                placeholder: "https://your-domain.com/webhook",
              },
              {
                label: "Webhook Secret",
                name: "webhookSecret",
                type: "password",
                placeholder: "Enter webhook secret",
              },
            ].map((field) => {
              const isEditing = editingField === field.name;
              return (
                <div key={field.name} className="space-y-2">
                  <Label htmlFor={field.name} className="text-[#e6edf3]">
                    {field.label}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id={field.name}
                      name={field.name}
                      type={field.type}
                      value={(webhookSettings as any)[field.name]}
                      onChange={handleWebhookChange}
                      placeholder={field.placeholder}
                      readOnly={!isEditing}
                      className={`bg-[#0b0d10] border-[#8787873f] text-[#e6edf3] ${
                        !isEditing ? "opacity-75" : ""
                      }`}
                    />
                    {isEditing ? (
                      <Button
                        size="sm"
                        className="bg-[#F56E0F] hover:bg-[#f56f0fdc] text-white"
                        onClick={saveField}
                        disabled={isSaving}
                      >
                        {isSaving ? "Saving..." : "Save"}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-[#8787873f] text-[#9aa4b2] hover:text-[#e6edf3]"
                        onClick={() => setEditingField(field.name)}
                      >
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
