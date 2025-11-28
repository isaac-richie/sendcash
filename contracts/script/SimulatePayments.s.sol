// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {UsernameRegistry} from "../contracts/UsernameRegistry.sol";
import {SendCash} from "../contracts/SendCash.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SimulatePayments is Script {
    // Deployed contract addresses
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
        console.log("=== Payment Flow Simulation ===");
        console.log("Deployer Address:", deployer);
        
        // Check USDC balance
        uint256 usdcBalance = usdc.balanceOf(deployer);
        console.log("\nDeployer USDC Balance:", usdcBalance);
        
        // Register two test usernames for simulation
        console.log("\n=== Registering Test Users ===");
        string memory aliceUsername = "alice_sim";
        string memory bobUsername = "bob_sim";
        
        // Check current username for deployer
        string memory currentUsername = registry.addressToUsername(deployer);
        if (bytes(currentUsername).length > 0) {
            console.log("Deployer already has username:", currentUsername);
        } else {
            // Register alice
            if (registry.isUsernameAvailable(aliceUsername)) {
                registry.registerUsername(aliceUsername);
                console.log("Registered:", aliceUsername);
            } else {
                console.log(aliceUsername, "already registered");
            }
        }
        
        // For bob, we need a different address
        // Let's use a deterministic address for bob
        address bobAddress = address(uint160(uint256(keccak256(abi.encodePacked("bob_sim")))));
        console.log("Bob address (simulated):", bobAddress);
        
        // Check if we can send payment
        console.log("\n=== Payment Simulation ===");
        address aliceAddress = registry.usernameToAddress(aliceUsername);
        console.log("Alice address:", aliceAddress);
        console.log("Alice username:", registry.addressToUsername(aliceAddress));
        
        // Check if USDC is supported
        bool usdcSupported = sendCash.supportedTokens(USDC);
        console.log("USDC supported:", usdcSupported);
        
        if (!usdcSupported) {
            console.log("Adding USDC as supported token...");
            sendCash.addSupportedToken(USDC);
        }
        
        // Simulate fee calculation for different amounts
        console.log("\n=== Fee Calculation Examples ===");
        uint256[] memory amounts = new uint256[](5);
        amounts[0] = 1 * 10**6;      // $1
        amounts[1] = 10 * 10**6;     // $10
        amounts[2] = 100 * 10**6;    // $100
        amounts[3] = 1000 * 10**6;   // $1000
        amounts[4] = 10000 * 10**6;  // $10000
        
        for (uint256 i = 0; i < amounts.length; i++) {
            uint256 amount = amounts[i];
            uint256 fee = sendCash.calculateFee(amount);
            uint256 recipientGets = amount - fee;
            console.log("Amount:", amount / 10**6, "USDC");
            console.log("  Fee (0.5%):", fee / 10**6, "USDC");
            console.log("  Recipient gets:", recipientGets / 10**6, "USDC");
        }
        
        // Check contract state
        console.log("\n=== Contract State ===");
        address registryOwner = registry.owner();
        address sendCashOwner = sendCash.owner();
        console.log("UsernameRegistry owner:", registryOwner);
        console.log("SendCash owner:", sendCashOwner);
        console.log("Registration fee:", registry.registrationFee());
        console.log("Premium fee:", registry.premiumFee());
        
        vm.stopBroadcast();
        console.log("\n=== Simulation Complete ===");
    }
}

