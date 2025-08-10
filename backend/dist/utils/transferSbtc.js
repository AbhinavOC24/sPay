"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transferSbtc = transferSbtc;
const transactions_1 = require("@stacks/transactions");
const network_1 = require("@stacks/network");
const network = network_1.STACKS_TESTNET;
const SBTC_CONTRACT_ADDRESS = "ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT";
const SBTC_CONTRACT_NAME = "sbtc-token";
const ASSET_NAME = "sbtc-token"; // ✅ Added missing constant
const TRANSFER_FN = "transfer";
function asPrincipal(addr, label) {
    const v = (addr !== null && addr !== void 0 ? addr : "").trim().toUpperCase();
    if (!v)
        throw new Error(`${label} is empty/undefined`);
    if (!(0, transactions_1.validateStacksAddress)(v)) {
        throw new Error(`${label} is not a valid STX address: "${v}"`);
    }
    return (0, transactions_1.standardPrincipalCV)(v);
}
/**
 * Sign with the temp wallet key and pass the SAME temp address as `sender`.
 */
function transferSbtc(senderKey, // temp wallet private key (saved on charge)
senderAddress, // temp wallet ST... address (saved on charge)
recipientAddress, // merchant payout ST... address (testnet)
amountMicroSBTC) {
    return __awaiter(this, void 0, void 0, function* () {
        const senderCV = asPrincipal(senderAddress, "senderAddress");
        const recipientCV = asPrincipal(recipientAddress, "recipientAddress");
        // ✅ Create post condition using the modern Pc helper
        const postConditions = [
            transactions_1.Pc.principal(senderAddress)
                .willSendEq(amountMicroSBTC)
                .ft(`${SBTC_CONTRACT_ADDRESS}.${SBTC_CONTRACT_NAME}`, ASSET_NAME),
        ];
        const tx = yield (0, transactions_1.makeContractCall)({
            contractAddress: SBTC_CONTRACT_ADDRESS,
            contractName: SBTC_CONTRACT_NAME,
            functionName: TRANSFER_FN,
            functionArgs: [(0, transactions_1.uintCV)(amountMicroSBTC), senderCV, recipientCV, (0, transactions_1.noneCV)()],
            senderKey, // ← signs as the temp wallet (tx-sender)
            network,
            postConditionMode: transactions_1.PostConditionMode.Deny,
            postConditions, // ✅ properly formatted post conditions
        });
        const result = yield (0, transactions_1.broadcastTransaction)({ transaction: tx, network });
        return result; // { txid }
    });
}
//# sourceMappingURL=transferSbtc.js.map