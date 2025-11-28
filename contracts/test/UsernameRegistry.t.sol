// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/UsernameRegistry.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Mock USDC token for testing
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {
        _mint(msg.sender, 1000000 * 10**6); // Mint 1M USDC
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

contract UsernameRegistryTest is Test {
    UsernameRegistry public registry;
    MockUSDC public usdc;
    address public owner = address(1);
    address public user1 = address(2);
    address public user2 = address(3);

    function setUp() public {
        // Deploy mock USDC
        usdc = new MockUSDC();
        
        // Deploy registry
        vm.prank(owner);
        registry = new UsernameRegistry(address(usdc));

        // Give users some USDC
        usdc.transfer(user1, 100 * 10**6); // 100 USDC
        usdc.transfer(user2, 100 * 10**6); // 100 USDC
    }

    function testRegisterUsername() public {
        vm.startPrank(user1);
        
        // Register username (no fee required in test phase)
        registry.registerUsername("alice");
        
        // Verify registration
        assertEq(registry.usernameToAddress("alice"), user1);
        assertEq(registry.addressToUsername(user1), "alice");
        
        vm.stopPrank();
    }

    function testRegisterUsernameNoFeeRequired() public {
        vm.startPrank(user1);
        
        // Registration fee is 0 in test phase, so no approval needed
        // Can register directly without USDC
        registry.registerUsername("alice");
        
        // Verify registration worked
        assertEq(registry.usernameToAddress("alice"), user1);
        
        vm.stopPrank();
    }

    function testRegisterPremiumUsername() public {
        vm.startPrank(user1);
        
        // Register premium username (no fee required in test phase)
        registry.registerPremiumUsername("vip");
        
        // Verify premium
        assertTrue(registry.premiumUsernames("vip"));
        assertEq(registry.usernameToAddress("vip"), user1);
        
        vm.stopPrank();
    }

    function testCannotRegisterTakenUsername() public {
        vm.startPrank(user1);
        usdc.approve(address(registry), 1 * 10**6);
        registry.registerUsername("alice");
        vm.stopPrank();

        // User2 tries to take same username
        vm.startPrank(user2);
        usdc.approve(address(registry), 1 * 10**6);
        vm.expectRevert();
        registry.registerUsername("alice");
        vm.stopPrank();
    }

    function testUpdateUsername() public {
        vm.startPrank(user1);
        usdc.approve(address(registry), 1 * 10**6);
        registry.registerUsername("alice");
        
        // Update to new username
        registry.updateUsername("alice_new");
        
        // Verify old username is freed
        assertEq(registry.usernameToAddress("alice"), address(0));
        // Verify new username is set
        assertEq(registry.usernameToAddress("alice_new"), user1);
        assertEq(registry.addressToUsername(user1), "alice_new");
        
        vm.stopPrank();
    }

    function testCannotUpdatePremiumUsername() public {
        vm.startPrank(user1);
        usdc.approve(address(registry), 10 * 10**6);
        registry.registerPremiumUsername("vip");
        
        // Try to update premium username - should fail
        vm.expectRevert();
        registry.updateUsername("vip_new");
        
        vm.stopPrank();
    }

    function testIsValidUsername() public view {
        assertTrue(registry.isValidUsername("alice"));
        assertTrue(registry.isValidUsername("alice123"));
        assertTrue(registry.isValidUsername("alice_123"));
        assertFalse(registry.isValidUsername("alice-123")); // Has dash
        assertFalse(registry.isValidUsername("alice 123")); // Has space
        assertFalse(registry.isValidUsername("")); // Empty
    }

    function testWithdrawFees() public {
        vm.startPrank(user1);
        registry.registerUsername("alice");
        vm.stopPrank();

        vm.startPrank(user2);
        registry.registerUsername("bob");
        vm.stopPrank();

        // In test phase, fees are 0, so withdrawFees should revert
        vm.prank(owner);
        vm.expectRevert("No fees to withdraw");
        registry.withdrawFees();
    }
}

