// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {UsernameRegistry} from "../contracts/UsernameRegistry.sol";
import {SendCash} from "../contracts/SendCash.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Simulate is Script {
    // Deployed contract addresses (update after deployment)
    address constant USERNAME_REGISTRY = 0x31a01592aC3B973D1228ff63fe723514aB4c2e4D;
    address constant SEND_CASH = 0xC59947735AF0bE7FaFe3499A76AFb3D898e80E30;
    address constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        
        UsernameRegistry registry = UsernameRegistry(USERNAME_REGISTRY);
        SendCash sendCash = SendCash(SEND_CASH);
        IERC20 usdc = IERC20(USDC);
        
        address deployer = vm.addr(deployerPrivateKey);
        console.log("Simulator Address:", deployer);
        console.log("Balance:", deployer.balance);
        
        // Simulation 1: Check registration fees
        console.log("\n=== Simulation 1: Check Registration Fees ===");
        uint256 regFee = registry.registrationFee();
        uint256 premiumFee = registry.premiumFee();
        console.log("Registration Fee:", regFee, "(should be 0)");
        console.log("Premium Fee:", premiumFee, "(should be 0)");
        
        // Simulation 2: Register a test username
        console.log("\n=== Simulation 2: Register Test Username ===");
        string memory testUsername = "testsim";
        
        // Check if available
        bool isAvailable = registry.isUsernameAvailable(testUsername);
        console.log("Username available:", isAvailable);
        
        if (isAvailable) {
            // Register username (should be free)
            registry.registerUsername(testUsername);
            console.log("Username registered successfully!");
            
            // Verify registration
            address registeredAddress = registry.usernameToAddress(testUsername);
            string memory registeredUsername = registry.addressToUsername(deployer);
            console.log("Registered address:", registeredAddress);
            console.log("Registered username:", registeredUsername);
        } else {
            console.log("Username already taken, skipping registration");
        }
        
        // Simulation 3: Check SendCash contract
        console.log("\n=== Simulation 3: Check SendCash Contract ===");
        address registryAddress = address(sendCash.usernameRegistry());
        console.log("SendCash linked to UsernameRegistry:", registryAddress);
        console.log("Fee percentage:", sendCash.FEE_PERCENTAGE(), "basis points (0.5%)");
        
        // Simulation 4: Calculate fee example
        console.log("\n=== Simulation 4: Fee Calculation Example ===");
        uint256 testAmount = 100 * 10**6; // 100 USDC (6 decimals)
        uint256 fee = sendCash.calculateFee(testAmount);
        uint256 recipientAmount = testAmount - fee;
        console.log("Amount: 100 USDC");
        console.log("Fee (0.5%):", fee, "(0.5 USDC)");
        console.log("Recipient receives:", recipientAmount, "(99.5 USDC)");
        
        // Simulation 5: Add USDC as supported token
        console.log("\n=== Simulation 5: Add USDC as Supported Token ===");
        bool usdcSupported = sendCash.supportedTokens(USDC);
        console.log("USDC currently supported:", usdcSupported);
        
        if (!usdcSupported) {
            console.log("Adding USDC as supported token...");
            sendCash.addSupportedToken(USDC);
            bool nowSupported = sendCash.supportedTokens(USDC);
            console.log("USDC now supported:", nowSupported);
        } else {
            console.log("USDC already supported!");
        }
        
        vm.stopBroadcast();
        
        console.log("\n=== Simulation Complete ===");
        console.log("All simulations ran successfully!");
    }
}

