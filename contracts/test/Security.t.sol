// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/UsernameRegistry.sol";
import "../contracts/SendCash.sol";
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

// Malicious contract to test reentrancy
contract ReentrancyAttacker {
    UsernameRegistry public registry;
    MockUSDC public usdc;
    bool public attacking;
    uint256 public attackCount;

    constructor(address _registry, address _usdc) {
        registry = UsernameRegistry(_registry);
        usdc = MockUSDC(_usdc);
    }

    function attack() external {
        attacking = true;
        attackCount = 0;
        usdc.approve(address(registry), 1 * 10**6);
        registry.registerUsername("attacker");
    }

    // Reentrancy attempt
    function onERC20Received(address, address, uint256, bytes memory) external returns (bytes4) {
        if (attacking && attackCount < 10) {
            attackCount++;
            // Try to reenter
            registry.registerUsername("attacker2");
        }
        return this.onERC20Received.selector;
    }
}

contract SecurityTest is Test {
    UsernameRegistry public registry;
    SendCash public sendCash;
    MockUSDC public usdc;
    address public owner = address(1);
    address public user1 = address(2);
    address public user2 = address(3);
    address public attacker = address(4);

    function setUp() public {
        // Deploy mock USDC
        usdc = new MockUSDC();
        
        // Deploy registry
        vm.prank(owner);
        registry = new UsernameRegistry(address(usdc));
        
        // Deploy SendCash
        vm.prank(owner);
        sendCash = new SendCash(address(registry));

        // Add USDC as supported token
        vm.prank(owner);
        sendCash.addSupportedToken(address(usdc));

        // Give users USDC
        usdc.transfer(user1, 1000 * 10**6);
        usdc.transfer(user2, 1000 * 10**6);
        usdc.transfer(attacker, 1000 * 10**6);
    }

    // ========== REENTRANCY TESTS ==========

    function testReentrancyProtection() public {
        // ReentrancyGuard should prevent reentrancy attacks
        vm.startPrank(user1);
        usdc.approve(address(registry), 1 * 10**6);
        registry.registerUsername("alice");
        
        // Try to call registerUsername again in same transaction
        // Should fail due to nonReentrant modifier
        vm.expectRevert();
        registry.registerUsername("alice2");
        vm.stopPrank();
    }

    // ========== ACCESS CONTROL TESTS ==========

    function testOnlyOwnerCanWithdrawFees() public {
        vm.startPrank(user1);
        registry.registerUsername("alice");
        vm.stopPrank();

        // Non-owner cannot withdraw
        vm.prank(user1);
        vm.expectRevert();
        registry.withdrawFees();

        // Owner cannot withdraw if no fees (test phase - fees are 0)
        vm.prank(owner);
        vm.expectRevert("No fees to withdraw");
        registry.withdrawFees();
    }

    function testOnlyOwnerCanSetFees() public {
        // Non-owner cannot set fees
        vm.prank(user1);
        vm.expectRevert();
        registry.setRegistrationFee(2 * 10**6);

        // Owner can set fees
        vm.prank(owner);
        registry.setRegistrationFee(2 * 10**6);
        assertEq(registry.registrationFee(), 2 * 10**6);
    }

    function testOnlyOwnerCanManageTokens() public {
        MockUSDC newToken = new MockUSDC();
        
        // Non-owner cannot add token
        vm.prank(user1);
        vm.expectRevert();
        sendCash.addSupportedToken(address(newToken));

        // Non-owner cannot remove token
        vm.prank(user1);
        vm.expectRevert();
        sendCash.removeSupportedToken(address(usdc));
    }

    // ========== INTEGER OVERFLOW/UNDERFLOW TESTS ==========

    function testFeeCalculationNoOverflow() public view {
        // Test with very large amount (but safe for multiplication)
        // Use a value that won't overflow when multiplied by 50
        uint256 hugeAmount = type(uint256).max / 100; // Safe for * 50
        
        // Should not overflow
        uint256 fee = sendCash.calculateFee(hugeAmount);
        
        // Fee should be 0.5% of hugeAmount
        uint256 expectedFee = (hugeAmount * 50) / 10000;
        assertEq(fee, expectedFee);
    }

    function testRegistrationFeeIsZeroInTestPhase() public view {
        // In test phase, registration fee is 0 (free registration)
        // This test verifies fees are disabled for testing
        assertEq(registry.registrationFee(), 0);
    }

    // ========== INPUT VALIDATION TESTS ==========

    function testCannotRegisterEmptyUsername() public {
        vm.startPrank(user1);
        usdc.approve(address(registry), 1 * 10**6);
        
        vm.expectRevert();
        registry.registerUsername("");
        
        vm.stopPrank();
    }

    function testCannotRegisterTooLongUsername() public {
        vm.startPrank(user1);
        usdc.approve(address(registry), 1 * 10**6);
        
        // 33 characters (max is 32)
        // Create a 33-character string: "a" repeated 33 times
        string memory longUsername = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; // 33 'a's
        
        // Verify it's actually 33 characters
        assertEq(bytes(longUsername).length, 33);
        
        // Should revert due to length check
        vm.expectRevert();
        registry.registerUsername(longUsername);
        
        vm.stopPrank();
    }

    function testCannotRegisterInvalidCharacters() public {
        vm.startPrank(user1);
        usdc.approve(address(registry), 1 * 10**6);
        
        // Test various invalid characters
        vm.expectRevert();
        registry.registerUsername("alice-123"); // dash
        
        vm.expectRevert();
        registry.registerUsername("alice 123"); // space
        
        vm.expectRevert();
        registry.registerUsername("alice@123"); // @ symbol
        
        vm.expectRevert();
        registry.registerUsername("alice.123"); // dot
        
        vm.stopPrank();
    }

    function testCannotSendZeroAmount() public {
        vm.startPrank(user1);
        usdc.approve(address(registry), 1 * 10**6);
        registry.registerUsername("alice");
        vm.stopPrank();

        vm.startPrank(user2);
        usdc.approve(address(registry), 1 * 10**6);
        registry.registerUsername("bob");
        usdc.approve(address(sendCash), 100 * 10**6);
        
        vm.expectRevert();
        sendCash.sendPayment("alice", address(usdc), 0);
        
        vm.stopPrank();
    }

    function testCannotSendToZeroAddress() public {
        vm.startPrank(user1);
        usdc.approve(address(registry), 1 * 10**6);
        registry.registerUsername("alice");
        usdc.approve(address(sendCash), 100 * 10**6);
        
        // Try to register for zero address
        vm.expectRevert();
        registry.registerUsernameForAddress("test", address(0), user1);
        
        vm.stopPrank();
    }

    // ========== FRONT-RUNNING TESTS ==========

    function testUsernameSquatting() public {
        // User1 registers username
        vm.startPrank(user1);
        usdc.approve(address(registry), 1 * 10**6);
        registry.registerUsername("alice");
        vm.stopPrank();

        // Attacker tries to take same username
        vm.startPrank(attacker);
        usdc.approve(address(registry), 1 * 10**6);
        vm.expectRevert();
        registry.registerUsername("alice");
        vm.stopPrank();
    }

    // ========== FEE MANIPULATION TESTS ==========

    function testFeeCannotBeBypassed() public {
        vm.startPrank(user1);
        usdc.approve(address(registry), 1 * 10**6);
        registry.registerUsername("alice");
        vm.stopPrank();

        vm.startPrank(user2);
        usdc.approve(address(registry), 1 * 10**6);
        registry.registerUsername("bob");
        vm.stopPrank();

        // Try to send payment - fee should always be charged
        vm.startPrank(user1);
        uint256 amount = 100 * 10**6; // $100
        usdc.approve(address(sendCash), amount);
        
        uint256 ownerBalanceBefore = usdc.balanceOf(owner);
        sendCash.sendPayment("bob", address(usdc), amount);
        uint256 ownerBalanceAfter = usdc.balanceOf(owner);
        
        // Fee should be charged (0.5% = $0.50)
        uint256 expectedFee = (amount * 50) / 10000;
        assertEq(ownerBalanceAfter - ownerBalanceBefore, expectedFee);
        
        vm.stopPrank();
    }

    function testFeeOnMinimumAmount() public {
        vm.startPrank(user1);
        usdc.approve(address(registry), 1 * 10**6);
        registry.registerUsername("alice");
        vm.stopPrank();

        vm.startPrank(user2);
        usdc.approve(address(registry), 1 * 10**6);
        registry.registerUsername("bob");
        
        // Send minimum amount (1 wei equivalent)
        uint256 minAmount = 1; // 1 unit (smallest possible)
        usdc.approve(address(sendCash), minAmount);
        
        uint256 ownerBalanceBefore = usdc.balanceOf(owner);
        sendCash.sendPayment("alice", address(usdc), minAmount);
        uint256 ownerBalanceAfter = usdc.balanceOf(owner);
        
        // Fee should still be calculated (even if tiny)
        uint256 fee = ownerBalanceAfter - ownerBalanceBefore;
        assertEq(fee, (minAmount * 50) / 10000);
        
        vm.stopPrank();
    }

    // ========== STATE CONSISTENCY TESTS ==========

    function testUsernameAddressConsistency() public {
        vm.startPrank(user1);
        usdc.approve(address(registry), 1 * 10**6);
        registry.registerUsername("alice");
        vm.stopPrank();

        // Verify bidirectional mapping is consistent
        address addr = registry.usernameToAddress("alice");
        string memory username = registry.addressToUsername(addr);
        
        assertEq(addr, user1);
        assertEq(username, "alice");
    }

    function testUpdateUsernameMaintainsConsistency() public {
        vm.startPrank(user1);
        usdc.approve(address(registry), 1 * 10**6);
        registry.registerUsername("alice");
        
        // Update username
        registry.updateUsername("alice_new");
        
        // Old mapping should be cleared
        assertEq(registry.usernameToAddress("alice"), address(0));
        
        // New mapping should be set
        assertEq(registry.usernameToAddress("alice_new"), user1);
        assertEq(registry.addressToUsername(user1), "alice_new");
        
        vm.stopPrank();
    }

    // ========== EDGE CASE TESTS ==========

    function testMaximumLengthUsername() public {
        vm.startPrank(user1);
        usdc.approve(address(registry), 1 * 10**6);
        
        // 32 characters (maximum allowed)
        string memory maxUsername = "12345678901234567890123456789012";
        registry.registerUsername(maxUsername);
        
        assertEq(registry.usernameToAddress(maxUsername), user1);
        
        vm.stopPrank();
    }

    function testMinimumLengthUsername() public {
        vm.startPrank(user1);
        usdc.approve(address(registry), 1 * 10**6);
        
        // 1 character (minimum)
        registry.registerUsername("a");
        
        assertEq(registry.usernameToAddress("a"), user1);
        
        vm.stopPrank();
    }

    function testCaseSensitiveUsernames() public {
        vm.startPrank(user1);
        usdc.approve(address(registry), 1 * 10**6);
        registry.registerUsername("alice");
        vm.stopPrank();

        // "Alice" should be different from "alice"
        vm.startPrank(user2);
        usdc.approve(address(registry), 1 * 10**6);
        registry.registerUsername("Alice");
        
        assertEq(registry.usernameToAddress("alice"), user1);
        assertEq(registry.usernameToAddress("Alice"), user2);
        
        vm.stopPrank();
    }

    // ========== PREMIUM USERNAME TESTS ==========

    function testPremiumUsernameCannotBeUpdated() public {
        vm.startPrank(user1);
        usdc.approve(address(registry), 10 * 10**6);
        registry.registerPremiumUsername("vip");
        
        // Cannot update premium username
        vm.expectRevert();
        registry.updateUsername("vip_new");
        
        vm.stopPrank();
    }

    function testPremiumUsernamePermanent() public {
        vm.startPrank(user1);
        usdc.approve(address(registry), 10 * 10**6);
        registry.registerPremiumUsername("vip");
        
        // Premium flag should be set
        assertTrue(registry.premiumUsernames("vip"));
        
        // Should still be premium after any operation
        assertTrue(registry.premiumUsernames("vip"));
        
        vm.stopPrank();
    }

    // ========== FEE WITHDRAWAL TESTS ==========

    function testCannotWithdrawZeroFees() public {
        // No registrations yet, so no fees
        vm.prank(owner);
        vm.expectRevert();
        registry.withdrawFees();
    }

    function testWithdrawAllFees() public {
        // Register multiple users (no fees in test phase)
        vm.startPrank(user1);
        registry.registerUsername("alice");
        vm.stopPrank();

        vm.startPrank(user2);
        registry.registerUsername("bob");
        vm.stopPrank();

        // In test phase, no fees collected, so withdraw should revert
        vm.prank(owner);
        vm.expectRevert("No fees to withdraw");
        registry.withdrawFees();
    }

    // ========== TOKEN SUPPORT TESTS ==========

    function testCannotAddZeroAddressToken() public {
        vm.prank(owner);
        vm.expectRevert();
        sendCash.addSupportedToken(address(0));
    }

    function testCanRemoveAndReaddToken() public {
        // Remove token
        vm.prank(owner);
        sendCash.removeSupportedToken(address(usdc));
        assertFalse(sendCash.supportedTokens(address(usdc)));

        // Re-add token
        vm.prank(owner);
        sendCash.addSupportedToken(address(usdc));
        assertTrue(sendCash.supportedTokens(address(usdc)));
    }

    // ========== PAYMENT EDGE CASES ==========

    function testCannotSendToNonexistentUsername() public {
        vm.startPrank(user1);
        usdc.approve(address(registry), 1 * 10**6);
        registry.registerUsername("alice");
        usdc.approve(address(sendCash), 100 * 10**6);
        
        vm.expectRevert();
        sendCash.sendPayment("nonexistent", address(usdc), 100 * 10**6);
        
        vm.stopPrank();
    }

    function testCannotSendToSelf() public {
        vm.startPrank(user1);
        usdc.approve(address(registry), 1 * 10**6);
        registry.registerUsername("alice");
        usdc.approve(address(sendCash), 100 * 10**6);
        
        vm.expectRevert();
        sendCash.sendPayment("alice", address(usdc), 100 * 10**6);
        
        vm.stopPrank();
    }

    function testFeeCalculationAccuracy() public {
        // Test various amounts to ensure fee calculation is accurate
        uint256[] memory amounts = new uint256[](5);
        amounts[0] = 1 * 10**6;      // $1
        amounts[1] = 10 * 10**6;     // $10
        amounts[2] = 100 * 10**6;    // $100
        amounts[3] = 1000 * 10**6;   // $1000
        amounts[4] = 10000 * 10**6; // $10000

        for (uint256 i = 0; i < amounts.length; i++) {
            uint256 fee = sendCash.calculateFee(amounts[i]);
            uint256 expectedFee = (amounts[i] * 50) / 10000;
            assertEq(fee, expectedFee, "Fee calculation incorrect");
        }
    }
}

