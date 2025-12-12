// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/SendCashV2.sol";
import "../contracts/UsernameRegistryV2.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    uint8 private _decimals;

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals_
    ) ERC20(name, symbol) {
        _decimals = decimals_;
        _mint(msg.sender, 1000000000 * 10 ** decimals_);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/**
 * @title Integration Stress Test
 * @dev Tests SendCashV2 and UsernameRegistryV2 working together
 */
contract IntegrationStressTest is Test {
    SendCashV2 public sendCash;
    UsernameRegistryV2 public registry;
    MockERC20 public usdc;

    address public owner = address(1);
    address public feeRecipient = address(2);
    address[10] public users;

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);

        // Deploy registry
        vm.prank(owner);
        registry = new UsernameRegistryV2(address(usdc));

        // Deploy SendCashV2 with native ETH enabled
        vm.prank(owner);
        sendCash = new SendCashV2(address(registry), feeRecipient, 50, true); // 0.5%, ETH enabled

        // Add USDC as supported token
        vm.prank(owner);
        sendCash.addSupportedToken(address(usdc));

        // Initialize users
        for (uint256 i = 0; i < 10; i++) {
            users[i] = address(uint160(i + 100));
            usdc.mint(users[i], 100000 * 10 ** 6); // 100k USDC each
        }
    }

    // ============ STRESS TEST: Full Flow ============

    function testStress_FullRegistrationAndPaymentFlow() public {
        // Register usernames
        for (uint256 i = 0; i < 10; i++) {
            string memory username = string(
                abi.encodePacked("user", vm.toString(i))
            );
            vm.prank(users[i]);
            registry.registerUsername(username);
        }

        // Send payments between all users
        uint256 amount = 1000 * 10 ** 6; // $1000

        for (uint256 i = 0; i < 9; i++) {
            vm.startPrank(users[i]);
            usdc.approve(address(sendCash), amount);
            string memory recipient = string(
                abi.encodePacked("user", vm.toString(i + 1))
            );
            sendCash.sendPayment(recipient, address(usdc), amount);
            vm.stopPrank();
        }

        // Verify balances
        // User 0 sent payment, so balance decreased
        assertTrue(usdc.balanceOf(users[0]) < 100000 * 10 ** 6);

        // Users 1-8 received at least one payment each
        for (uint256 i = 1; i < 9; i++) {
            uint256 balance = usdc.balanceOf(users[i]);
            // Should have original balance (100k) plus received payment minus fees
            assertTrue(balance > 100000 * 10 ** 6);
        }

        // User 9 received from user 8
        assertTrue(usdc.balanceOf(users[9]) > 100000 * 10 ** 6);
    }

    function testStress_UsernameUpdateDuringActivePayments() public {
        // Register and send payment
        vm.prank(users[0]);
        registry.registerUsername("alice");

        vm.prank(users[1]);
        registry.registerUsername("bob");

        vm.startPrank(users[0]);
        usdc.approve(address(sendCash), 1000 * 10 ** 6);
        sendCash.sendPayment("bob", address(usdc), 1000 * 10 ** 6);
        vm.stopPrank();

        // Update username
        vm.prank(users[0]);
        registry.updateUsername("alice_new");

        // Payment with new username should fail (username doesn't exist)
        vm.startPrank(users[1]);
        usdc.approve(address(sendCash), 1000 * 10 ** 6);
        vm.expectRevert("Username not found");
        sendCash.sendPayment("alice", address(usdc), 1000 * 10 ** 6);

        // But payment with new username should work
        sendCash.sendPayment("alice_new", address(usdc), 1000 * 10 ** 6);
        vm.stopPrank();
    }

    function testStress_UsernameTransferAndPayments() public {
        // Register and send payment
        vm.prank(users[0]);
        registry.registerUsername("sender");

        vm.prank(users[1]);
        registry.registerUsername("receiver");

        // Send payment
        vm.startPrank(users[0]);
        usdc.approve(address(sendCash), 1000 * 10 ** 6);
        sendCash.sendPayment("receiver", address(usdc), 1000 * 10 ** 6);
        vm.stopPrank();

        // Transfer username
        vm.prank(users[0]);
        registry.transferUsername(users[2]);

        // Username "sender" now belongs to users[2], so payments should work
        vm.startPrank(users[1]);
        usdc.approve(address(sendCash), 1000 * 10 ** 6);
        // This should work - username was transferred, not removed
        sendCash.sendPayment("sender", address(usdc), 1000 * 10 ** 6);
        vm.stopPrank();

        // Verify users[2] received the payment
        assertTrue(usdc.balanceOf(users[2]) > 100000 * 10 ** 6);
    }

    // ============ STRESS TEST: Case Sensitivity ============

    function testStress_CaseInsensitivePayments() public {
        vm.prank(users[0]);
        registry.registerUsername("alice");

        vm.prank(users[1]);
        registry.registerUsername("bob");

        // Send payment with different cases
        vm.startPrank(users[0]);
        usdc.approve(address(sendCash), 3000 * 10 ** 6); // Approve for all 3 payments
        sendCash.sendPayment("BOB", address(usdc), 1000 * 10 ** 6);
        sendCash.sendPayment("Bob", address(usdc), 1000 * 10 ** 6);
        sendCash.sendPayment("bOb", address(usdc), 1000 * 10 ** 6);
        vm.stopPrank();

        // All should work (case-insensitive)
        assertTrue(usdc.balanceOf(users[1]) > 100000 * 10 ** 6);
    }

    // ============ STRESS TEST: Fee Changes During Operations ============

    function testStress_FeeChangeDuringPayments() public {
        vm.prank(users[0]);
        registry.registerUsername("alice");
        vm.prank(users[1]);
        registry.registerUsername("bob");

        // Send payment with initial fee
        vm.startPrank(users[0]);
        usdc.approve(address(sendCash), 2000 * 10 ** 6);
        sendCash.sendPayment("bob", address(usdc), 1000 * 10 ** 6);
        vm.stopPrank();

        uint256 fee1 = sendCash.calculateFee(address(usdc), 1000 * 10 ** 6);

        // Change fee
        vm.prank(owner);
        sendCash.setFeeBps(100); // 1%

        // Send payment with new fee
        vm.startPrank(users[0]);
        sendCash.sendPayment("bob", address(usdc), 1000 * 10 ** 6);
        vm.stopPrank();

        uint256 fee2 = sendCash.calculateFee(address(usdc), 1000 * 10 ** 6);
        assertTrue(fee2 > fee1); // New fee should be higher
    }

    // ============ STRESS TEST: Pause During Operations ============

    function testStress_PauseDuringActiveSystem() public {
        // Register users
        for (uint256 i = 0; i < 5; i++) {
            string memory username = string(
                abi.encodePacked("user", vm.toString(i))
            );
            vm.prank(users[i]);
            registry.registerUsername(username);
        }

        // Send some payments
        for (uint256 i = 0; i < 4; i++) {
            vm.startPrank(users[i]);
            usdc.approve(address(sendCash), 1000 * 10 ** 6);
            string memory recipient = string(
                abi.encodePacked("user", vm.toString(i + 1))
            );
            sendCash.sendPayment(recipient, address(usdc), 1000 * 10 ** 6);
            vm.stopPrank();
        }

        // Pause contract
        vm.prank(owner);
        sendCash.pause();

        // Payments should fail
        vm.startPrank(users[0]);
        usdc.approve(address(sendCash), 1000 * 10 ** 6);
        vm.expectRevert();
        sendCash.sendPayment("user1", address(usdc), 1000 * 10 ** 6);
        vm.stopPrank();

        // But username operations should still work
        vm.prank(users[5]);
        registry.registerUsername("newuser");

        // Unpause
        vm.prank(owner);
        sendCash.unpause();

        // Payments should work again
        vm.startPrank(users[0]);
        sendCash.sendPayment("newuser", address(usdc), 1000 * 10 ** 6);
        vm.stopPrank();
    }

    // ============ STRESS TEST: Large Scale Integration ============

    function testStress_LargeScaleIntegration() public {
        uint256 userCount = 50;

        // Register many users
        for (uint256 i = 0; i < userCount; i++) {
            address user = address(uint160(i + 200));
            usdc.mint(user, 10000 * 10 ** 6);
            string memory username = string(
                abi.encodePacked("user", vm.toString(i))
            );

            vm.prank(user);
            registry.registerUsername(username);
        }

        // Create payment network (each user sends to next)
        for (uint256 i = 0; i < userCount - 1; i++) {
            address sender = address(uint160(i + 200));
            string memory recipient = string(
                abi.encodePacked("user", vm.toString(i + 1))
            );

            vm.startPrank(sender);
            usdc.approve(address(sendCash), 100 * 10 ** 6);
            sendCash.sendPayment(recipient, address(usdc), 100 * 10 ** 6);
            vm.stopPrank();
        }

        // Verify final user received all payments
        address finalUser = address(uint160(userCount - 1 + 200));
        assertTrue(usdc.balanceOf(finalUser) > 10000 * 10 ** 6);
    }

    // ============ STRESS TEST: Edge Case Combinations ============

    function testStress_EdgeCaseCombinations() public {
        // Register with special characters in valid range
        vm.prank(users[0]);
        registry.registerUsername("user_123");

        // Update to new name
        vm.prank(users[0]);
        registry.updateUsername("user_456");

        // Send payment
        vm.prank(users[1]);
        registry.registerUsername("receiver");

        vm.startPrank(users[0]);
        usdc.approve(address(sendCash), 1000 * 10 ** 6);
        sendCash.sendPayment("receiver", address(usdc), 1000 * 10 ** 6);
        vm.stopPrank();

        // Transfer username
        vm.prank(users[0]);
        registry.transferUsername(users[2]);

        // Verify everything still works
        assertEq(registry.getAddress("user_456"), users[2]);
        assertTrue(usdc.balanceOf(users[1]) > 100000 * 10 ** 6);
    }
}
