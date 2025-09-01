import {
  makeContractCall,
  broadcastTransaction,
  uintCV,
  standardPrincipalCV,
  noneCV,
  validateStacksAddress,
  AnchorMode,
  PostConditionMode,
  Pc,
} from "@stacks/transactions";
import { STACKS_TESTNET } from "@stacks/network";
import { ReadableStreamDefaultController } from "stream/web";

const network = STACKS_TESTNET;
const SBTC_CONTRACT_ADDRESS = "ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT";
const SBTC_CONTRACT_NAME = "sbtc-token";
const ASSET_NAME = "sbtc-token";
const TRANSFER_FN = "transfer";

function asPrincipal(addr: string, label: string) {
  const v = (addr ?? "").trim().toUpperCase();
  if (!v) throw new Error(`${label} is empty/undefined`);
  if (!validateStacksAddress(v)) {
    throw new Error(`${label} is not a valid STX address: "${v}"`);
  }
  return standardPrincipalCV(v);
}

/**
 * Sign with the temp wallet key and pass the SAME temp address as `sender`.
 */
export async function transferSbtc(
  senderKey: string, // temp wallet private key (saved on charge)
  senderAddress: string, // temp wallet ST... address (saved on charge)
  recipientAddress: string, // merchant payout ST... address (testnet)
  amountMicroSBTC: bigint
) {
  const senderCV = asPrincipal(senderAddress, "senderAddress");
  const recipientCV = asPrincipal(recipientAddress, "recipientAddress");

  const postConditions = [
    Pc.principal(senderAddress)
      .willSendEq(amountMicroSBTC)
      .ft(`${SBTC_CONTRACT_ADDRESS}.${SBTC_CONTRACT_NAME}`, ASSET_NAME),
  ];

  const tx = await makeContractCall({
    contractAddress: SBTC_CONTRACT_ADDRESS,
    contractName: SBTC_CONTRACT_NAME,
    functionName: TRANSFER_FN,
    functionArgs: [uintCV(amountMicroSBTC), senderCV, recipientCV, noneCV()],
    senderKey, // signs as the temp wallet (tx-sender)
    network,
    postConditionMode: PostConditionMode.Deny,
    postConditions,
  });

  const result = await broadcastTransaction({ transaction: tx, network });
  console.log(ReadableStreamDefaultController);
  return result; // { txid }
}
