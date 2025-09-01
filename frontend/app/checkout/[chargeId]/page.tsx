import CheckoutPage from "@/components/CheckoutPage";

export default async function Page({
  params,
}: {
  params: Promise<{ chargeId: string }>;
}) {
  const { chargeId } = await params; // ✅ await params

  return <CheckoutPage chargeId={chargeId} />;
}
