import { generateWallet, getStxAddress } from "@stacks/wallet-sdk";

export async function deriveHotWallet(mnemonic: string) {
  const wallet = await generateWallet({
    secretKey: mnemonic,
    password: "hackathon",
  });
  const account = wallet.accounts[0];
  if (!account) throw new Error("No account[0] in wallet");
  return {
    stxPrivateKey: account.stxPrivateKey,
    stxAddress: getStxAddress(account, "testnet"),
  };
}
