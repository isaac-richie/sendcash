// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {SendCash} from "../contracts/SendCash.sol";

contract AddTokens is Script {
    // Deployed contract address
    address constant SEND_CASH = 0xC59947735AF0bE7FaFe3499A76AFb3D898e80E30;
    
    // Token addresses (Base Sepolia)
    address constant USDT = 0xe0D1Cdd0ff0BF2e30e6291c3b6F2DB9E7CDfACA1;
    address constant WBTC = 0x13DCec0762EcC5E666c207ab44Dc768e5e33070F;
    
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        
        SendCash sendCash = SendCash(SEND_CASH);
        
        console.log("Adding supported tokens to SendCash contract...");
        console.log("SendCash address:", address(sendCash));
        
        // Check if USDT is already supported
        bool usdtSupported = sendCash.supportedTokens(USDT);
        if (!usdtSupported) {
            console.log("\nAdding USDT...");
            sendCash.addSupportedToken(USDT);
            console.log("USDT added successfully");
        } else {
            console.log("\nUSDT already supported");
        }
        
        // Check if WBTC is already supported
        bool wbtcSupported = sendCash.supportedTokens(WBTC);
        if (!wbtcSupported) {
            console.log("\nAdding WBTC...");
            sendCash.addSupportedToken(WBTC);
            console.log("WBTC added successfully");
        } else {
            console.log("\nWBTC already supported");
        }
        
        // Verify
        console.log("\n=== Verification ===");
        console.log("USDT supported:", sendCash.supportedTokens(USDT));
        console.log("WBTC supported:", sendCash.supportedTokens(WBTC));
        
        vm.stopBroadcast();
        
        console.log("\nToken addition complete!");
    }
}

