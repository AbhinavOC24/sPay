import {
  makeContractCall,
  broadcastTransaction,
  uintCV,
  standardPrincipalCV,
  AnchorMode,
} from "@stacks/transactions";
import { STACKS_TESTNET } from "@stacks/network";

const network = STACKS_TESTNET; // this is already a ready-to-use testnet config
const SBTC_CONTRACT_ADDRESS = "SP000000000000000000002Q6VF78";
const SBTC_CONTRACT_NAME = "sbtc";
const TRANSFER_FN = "transfer";

/**
 * Transfer SBTC from a temporary wallet to merchant
 * @param senderKey Private key of the temp wallet
 * @param senderAddress STX address of temp wallet
 * @param recipientAddress Merchant's STX address
 * @param amountMicroSBTC Amount in micro-sbtc (1 SBTC = 1_000_000 micro-sbtc)
 */

export async function transferSbtc(
  senderKey: string,
  senderAddress: string,
  recipientAddress: string,
  amountMicroSBTC: bigint
) {
  try {
    const tx = await makeContractCall({
      contractAddress: SBTC_CONTRACT_ADDRESS,
      contractName: SBTC_CONTRACT_NAME,
      functionName: TRANSFER_FN,
      functionArgs: [
        uintCV(amountMicroSBTC),
        standardPrincipalCV(recipientAddress),
        standardPrincipalCV(senderAddress),
      ],
      senderKey,
      network,
    });

    const result = await broadcastTransaction({
      transaction: tx,
      network,
    });
    return result;
  } catch (error) {
    console.log("Errror from sbtc Transfer", error);
  }
}
