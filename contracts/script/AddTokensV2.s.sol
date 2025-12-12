// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {SendCashV2} from "../contracts/SendCashV2.sol";

/**
 * @title AddTokensV2
 * @dev Script to add supported tokens to SendCashV2 contract
 * Usage: forge script script/AddTokensV2.s.sol:AddTokensV2 --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast
 */
contract AddTokensV2 is Script {
    // Deployed SendCashV2 contract address (update after deployment)
    address constant SEND_CASH_V2 = 0x0000000000000000000000000000000000000000; // TODO: Update with deployed address
    
    // Token addresses (Base Sepolia)
    address constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address constant USDT = 0xe0D1Cdd0ff0BF2e30e6291c3b6F2DB9E7CDfACA1;
    address constant WBTC = 0x13DCec0762EcC5E666c207ab44Dc768e5e33070f;
    address constant DAI = 0x0000000000000000000000000000000000000000; // TODO: Update with DAI address on Base Sepolia
    
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        
        SendCashV2 sendCash = SendCashV2(SEND_CASH_V2);
        
        console.log("Adding supported tokens to SendCashV2 contract...");
        console.log("SendCashV2 address:", address(sendCash));
        
        // Add USDC
        bool usdcSupported = sendCash.supportedTokens(USDC);
        if (!usdcSupported) {
            console.log("\nAdding USDC...");
            sendCash.addSupportedToken(USDC);
            console.log("USDC added successfully");
        } else {
            console.log("\nUSDC already supported");
        }
        
        // Add USDT
        bool usdtSupported = sendCash.supportedTokens(USDT);
        if (!usdtSupported) {
            console.log("\nAdding USDT...");
            sendCash.addSupportedToken(USDT);
            console.log("USDT added successfully");
        } else {
            console.log("\nUSDT already supported");
        }
        
        // Add WBTC
        bool wbtcSupported = sendCash.supportedTokens(WBTC);
        if (!wbtcSupported) {
            console.log("\nAdding WBTC...");
            sendCash.addSupportedToken(WBTC);
            console.log("WBTC added successfully");
        } else {
            console.log("\nWBTC already supported");
        }
        
        // Add DAI
        bool daiSupported = sendCash.supportedTokens(DAI);
        if (DAI != address(0) && !daiSupported) {
            console.log("\nAdding DAI...");
            sendCash.addSupportedToken(DAI);
            console.log("DAI added successfully");
        } else if (DAI == address(0)) {
            console.log("\n⚠️  DAI address not set - skipping");
        } else {
            console.log("\nDAI already supported");
        }
        
        // Verify
        console.log("\n=== Verification ===");
        console.log("USDC supported:", sendCash.supportedTokens(USDC));
        console.log("USDT supported:", sendCash.supportedTokens(USDT));
        console.log("WBTC supported:", sendCash.supportedTokens(WBTC));
        if (DAI != address(0)) {
            console.log("DAI supported:", sendCash.supportedTokens(DAI));
        }
        
        vm.stopBroadcast();
        
        console.log("\n✅ Token addition complete!");
    }
}
