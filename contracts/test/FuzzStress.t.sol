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
        _mint(msg.sender, type(uint256).max / 2); // Large supply
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/**
 * @title Fuzz Stress Tests
 * @dev Property-based fuzzing tests for edge cases
 */
contract FuzzStressTest is Test {
    SendCashV2 public sendCash;
    UsernameRegistryV2 public registry;
    MockERC20 public usdc;

    address public owner = address(1);
    address public feeRecipient = address(2);
    address public alice = address(3);
    address public bob = address(4);

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);

        vm.prank(owner);
        registry = new UsernameRegistryV2(address(usdc));

        vm.prank(owner);
        sendCash = new SendCashV2(address(registry), feeRecipient, 50, true);

        vm.prank(owner);
        sendCash.addSupportedToken(address(usdc));

        // Register users
        vm.prank(alice);
        registry.registerUsername("alice");
        vm.prank(bob);
        registry.registerUsername("bob");
    }

    // ============ FUZZ TESTS: Fee Calculations ============

    function testFuzz_FeeCalculation(uint256 amount) public view {
        // Use vm.assume to filter problematic values
        // Ensure multiplication won't overflow: amount * 200 <= type(uint256).max
        vm.assume(amount > 0 && amount <= type(uint256).max / 200);

        // Additional safety: cap at reasonable value
        if (amount > 1000000 * 10 ** 6) {
            return; // Skip very large values
        }

        uint256 fee = sendCash.calculateFee(address(usdc), amount);

        // Fee should never exceed amount
        assertLe(fee, amount);

        // Fee should be calculable
        assertGe(fee, 0);

        // Fee should be proportional (0.5% = 50 bps)
        // Allow for rounding differences
        uint256 expectedFee = (amount * 50) / 10000;
        assertLe(fee, expectedFee + 1); // Allow 1 wei rounding
        assertGe(fee, expectedFee - 1);
    }

    function testFuzz_FeeWithDifferentBps(
        uint256 amount,
        uint256 feeBps
    ) public {
        // Use vm.assume to ensure safe multiplication
        vm.assume(amount > 0 && amount <= type(uint256).max / 200);
        vm.assume(feeBps >= 1 && feeBps <= 200);

        // Additional safety check
        if (amount > 1000000 * 10 ** 6) {
            return;
        }

        // Set fee
        vm.prank(owner);
        sendCash.setFeeBps(feeBps);

        uint256 fee = sendCash.calculateFee(address(usdc), amount);

        // Fee should never exceed amount
        assertLe(fee, amount);

        // Fee calculation should be correct
        uint256 expectedFee = (amount * feeBps) / 10000;
        assertLe(fee, expectedFee + 1);
        assertGe(fee, expectedFee - 1);
    }

    // ============ FUZZ TESTS: Payment Amounts ============

    function testFuzz_PaymentAmounts(uint256 amount) public {
        // Bound to reasonable range
        amount = bound(amount, 1, 1000000 * 10 ** 6); // Max 1M USDC

        // Fund alice
        usdc.mint(alice, amount * 2);

        vm.startPrank(alice);
        usdc.approve(address(sendCash), amount);

        uint256 bobBalanceBefore = usdc.balanceOf(bob);
        uint256 feeRecipientBalanceBefore = usdc.balanceOf(feeRecipient);

        sendCash.sendPayment("bob", address(usdc), amount);

        uint256 bobBalanceAfter = usdc.balanceOf(bob);
        uint256 feeRecipientBalanceAfter = usdc.balanceOf(feeRecipient);

        uint256 fee = sendCash.calculateFee(address(usdc), amount);
        uint256 expectedBobReceived = amount - fee;

        // Bob should receive amount minus fee
        assertEq(bobBalanceAfter - bobBalanceBefore, expectedBobReceived);

        // Fee recipient should receive fee
        assertEq(feeRecipientBalanceAfter - feeRecipientBalanceBefore, fee);

        // Total should equal original amount
        assertEq(
            (bobBalanceAfter - bobBalanceBefore) +
                (feeRecipientBalanceAfter - feeRecipientBalanceBefore),
            amount
        );

        vm.stopPrank();
    }

    // ============ FUZZ TESTS: Username Validation ============

    function testFuzz_UsernameLength(string memory username) public {
        // Normalize and check length
        bytes memory b = bytes(username);

        if (b.length == 0) {
            // Empty username should fail
            vm.prank(alice);
            vm.expectRevert();
            registry.registerUsername(username);
        } else if (b.length > 32) {
            // Too long should fail
            vm.prank(alice);
            vm.expectRevert();
            registry.registerUsername(username);
        } else {
            // Valid length - check if valid format
            bool isValid = true;
            for (uint256 i = 0; i < b.length; i++) {
                bytes1 char = b[i];
                if (
                    !(char >= 0x30 && char <= 0x39) && // 0-9
                    !(char >= 0x41 && char <= 0x5A) && // A-Z
                    !(char >= 0x61 && char <= 0x7A) && // a-z
                    char != 0x5F // _
                ) {
                    isValid = false;
                    break;
                }
            }

            if (isValid) {
                // Should be able to register (if not taken)
                // We can't test this easily with fuzzing due to collisions
                // But we can verify the validation logic
                assertTrue(registry.isValidUsername(username));
            } else {
                // Invalid format should fail
                vm.prank(address(999));
                vm.expectRevert("Invalid username format");
                registry.registerUsername(username);
            }
        }
    }

    // ============ FUZZ TESTS: Fee Recipient ============

    function testFuzz_FeeRecipientChange(
        address newRecipient,
        uint256 amount
    ) public {
        // Bound inputs
        vm.assume(newRecipient != address(0));
        vm.assume(newRecipient != owner);
        amount = bound(amount, 1, 1000000 * 10 ** 6);

        // Change fee recipient
        vm.prank(owner);
        sendCash.setFeeRecipient(newRecipient);

        // Fund and send payment
        usdc.mint(alice, amount);
        vm.startPrank(alice);
        usdc.approve(address(sendCash), amount);
        sendCash.sendPayment("bob", address(usdc), amount);
        vm.stopPrank();

        // Fee should go to new recipient
        uint256 fee = sendCash.calculateFee(address(usdc), amount);
        assertEq(usdc.balanceOf(newRecipient), fee);
    }

    // ============ FUZZ TESTS: Token Fee Overrides ============

    function testFuzz_TokenFeeOverride(
        uint256 overrideBps,
        uint256 amount
    ) public {
        // Use vm.assume to ensure safe values
        vm.assume(amount > 0 && amount <= type(uint256).max / 200);
        vm.assume(overrideBps <= 200);

        // Additional safety
        if (amount > 1000000 * 10 ** 6) {
            return;
        }

        // Set override
        vm.prank(owner);
        sendCash.setTokenFeeBps(address(usdc), overrideBps);

        uint256 fee = sendCash.calculateFee(address(usdc), amount);

        if (overrideBps == 0) {
            // Should use global fee
            assertEq(fee, (amount * 50) / 10000);
        } else {
            // Should use override
            uint256 expectedFee = (amount * overrideBps) / 10000;
            assertLe(fee, expectedFee + 1);
            assertGe(fee, expectedFee - 1);
        }
    }

    // ============ FUZZ TESTS: Multiple Payments ============

    function testFuzz_MultiplePayments(
        uint256 paymentCount,
        uint256 amount
    ) public {
        // Bound inputs
        paymentCount = bound(paymentCount, 1, 100); // Max 100 payments
        amount = bound(amount, 1, 10000 * 10 ** 6); // Max 10k per payment

        // Fund alice
        usdc.mint(alice, amount * paymentCount * 2);

        vm.startPrank(alice);
        usdc.approve(address(sendCash), amount * paymentCount);

        uint256 bobBalanceBefore = usdc.balanceOf(bob);
        uint256 totalFee = 0;

        for (uint256 i = 0; i < paymentCount; i++) {
            sendCash.sendPayment("bob", address(usdc), amount);
            totalFee += sendCash.calculateFee(address(usdc), amount);
        }

        uint256 bobBalanceAfter = usdc.balanceOf(bob);
        uint256 expectedReceived = (amount * paymentCount) - totalFee;

        // Bob should receive all payments minus fees
        assertEq(bobBalanceAfter - bobBalanceBefore, expectedReceived);

        vm.stopPrank();
    }
}
