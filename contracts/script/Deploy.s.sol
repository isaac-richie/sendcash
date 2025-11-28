// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {UsernameRegistry} from "../contracts/UsernameRegistry.sol";
import {SendCash} from "../contracts/SendCash.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address usdcAddress = vm.envAddress("USDC_ADDRESS");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy UsernameRegistry
        console.log("Deploying UsernameRegistry...");
        console.log("USDC Address:", usdcAddress);
        UsernameRegistry usernameRegistry = new UsernameRegistry(usdcAddress);
        console.log("UsernameRegistry deployed to:", address(usernameRegistry));
        console.log("Registration Fee: 0 USDC (test phase - free registration)");
        console.log("Premium Fee: 0 USDC (test phase - free registration)");
        
        // Deploy SendCash
        console.log("\nDeploying SendCash...");
        SendCash sendCash = new SendCash(address(usernameRegistry));
        console.log("SendCash deployed to:", address(sendCash));
        
        vm.stopBroadcast();
        
        // Print summary
        console.log("\n=== Deployment Summary ===");
        console.log("UsernameRegistry:", address(usernameRegistry));
        console.log("SendCash:", address(sendCash));
        console.log("\nUsing Thirdweb SDK for smart wallet creation and gas sponsorship");
        console.log("Set up Thirdweb Client ID and Factory Address in backend .env");
        console.log("\nSave these addresses for backend configuration!");
    }
}

