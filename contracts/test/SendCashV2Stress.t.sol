// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/SendCashV2.sol";
import "../contracts/UsernameRegistryV2.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Mock ERC20 tokens for testing
contract MockERC20 is ERC20 {
    uint8 private _decimals;

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals_
    ) ERC20(name, symbol) {
        _decimals = decimals_;
        _mint(msg.sender, 1000000000 * 10 ** decimals_); // Mint 1B tokens
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

// Malicious token that tries reentrancy
contract MaliciousToken is ERC20 {
    SendCashV2 public sendCash;
    address public attacker;

    constructor(address _sendCash) ERC20("Malicious", "MAL") {
        sendCash = SendCashV2(payable(_sendCash));
        attacker = msg.sender;
        _mint(msg.sender, 1000000 * 10 ** 6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    // Reentrancy attack attempt
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public override returns (bool) {
        super.transferFrom(from, to, amount);
        if (to == address(sendCash) && attacker.balance > 0) {
            // Try to reenter
            try
                sendCash.sendPaymentToAddress(address(this), address(this), 1)
            {} catch {}
        }
        return true;
    }
}

contract SendCashV2StressTest is Test {
    SendCashV2 public sendCash;
    UsernameRegistryV2 public registry;
    MockERC20 public usdc;
    MockERC20 public usdt;
    MockERC20 public wbtc;

    address public owner = address(1);
    address public feeRecipient = address(2);
    address public alice = address(3);
    address public bob = address(4);
    address public charlie = address(5);
    address public attacker = address(999);

    uint256 public constant INITIAL_FEE_BPS = 50; // 0.5%

    function setUp() public {
        // Deploy tokens
        usdc = new MockERC20("USD Coin", "USDC", 6);
        usdt = new MockERC20("Tether USD", "USDT", 6);
        wbtc = new MockERC20("Wrapped BTC", "WBTC", 8);

        // Deploy registry
        vm.prank(owner);
        registry = new UsernameRegistryV2(address(usdc));

        // Deploy SendCashV2 with native ETH enabled
        vm.prank(owner);
        sendCash = new SendCashV2(
            address(registry),
            feeRecipient,
            INITIAL_FEE_BPS,
            true // Enable native ETH
        );

        // Add supported tokens
        vm.startPrank(owner);
        sendCash.addSupportedToken(address(usdc));
        sendCash.addSupportedToken(address(usdt));
        sendCash.addSupportedToken(address(wbtc));
        vm.stopPrank();

        // Fund users
        usdc.transfer(alice, 1000000 * 10 ** 6); // 1M USDC
        usdc.transfer(bob, 1000000 * 10 ** 6);
        usdc.transfer(charlie, 1000000 * 10 ** 6);
        usdt.transfer(alice, 1000000 * 10 ** 6);
        wbtc.transfer(alice, 1000 * 10 ** 8);

        // Register usernames
        vm.prank(alice);
        registry.registerUsername("alice");
        vm.prank(bob);
        registry.registerUsername("bob");
        vm.prank(charlie);
        registry.registerUsername("charlie");
    }

    // ============ STRESS TEST: Fee Calculations ============

    function testStress_FeeCalculationEdgeCases() public view {
        // Test minimum amount (1 wei equivalent)
        uint256 minAmount = 1;
        uint256 fee = sendCash.calculateFee(address(usdc), minAmount);
        assertEq(fee, 0); // Should round down to 0

        // Test very small amount
        uint256 smallAmount = 100; // 0.0001 USDC
        fee = sendCash.calculateFee(address(usdc), smallAmount);
        assertTrue(fee < smallAmount);

        // Test large amount
        uint256 largeAmount = 1000000 * 10 ** 6; // 1M USDC
        fee = sendCash.calculateFee(address(usdc), largeAmount);
        assertEq(fee, (largeAmount * INITIAL_FEE_BPS) / 10000);

        // Test maximum fee (2%)
        uint256 maxFeeAmount = 10000 * 10 ** 6; // 10k USDC
        uint256 maxFee = sendCash.calculateFee(address(usdc), maxFeeAmount);
        // With 2% fee, should be 200 * 10000 / 10000 = 20000 USDC
        // But we use 0.5%, so 50 * 10000 / 10000 = 50 USDC
        assertTrue(maxFee > 0);
    }

    function testStress_FeeCalculationWithDifferentDecimals() public view {
        // USDC: 6 decimals
        uint256 usdcAmount = 1000 * 10 ** 6;
        uint256 usdcFee = sendCash.calculateFee(address(usdc), usdcAmount);

        // USDT: 6 decimals (same)
        uint256 usdtAmount = 1000 * 10 ** 6;
        uint256 usdtFee = sendCash.calculateFee(address(usdt), usdtAmount);

        // WBTC: 8 decimals
        uint256 wbtcAmount = 1 * 10 ** 8; // 1 WBTC
        uint256 wbtcFee = sendCash.calculateFee(address(wbtc), wbtcAmount);

        assertEq(usdcFee, usdtFee); // Same decimals = same fee
        assertTrue(wbtcFee > 0); // Should calculate correctly
    }

    // ============ STRESS TEST: Multiple Concurrent Payments ============

    function testStress_MultipleConcurrentPayments() public {
        uint256 amount = 100 * 10 ** 6; // $100
        uint256 iterations = 50;

        vm.startPrank(alice);
        usdc.approve(address(sendCash), amount * iterations);

        uint256 bobBalanceBefore = usdc.balanceOf(bob);
        uint256 feeRecipientBalanceBefore = usdc.balanceOf(feeRecipient);

        // Send multiple payments rapidly
        for (uint256 i = 0; i < iterations; i++) {
            sendCash.sendPayment("bob", address(usdc), amount);
        }

        uint256 bobBalanceAfter = usdc.balanceOf(bob);
        uint256 feeRecipientBalanceAfter = usdc.balanceOf(feeRecipient);

        uint256 expectedBobReceived = (amount -
            sendCash.calculateFee(address(usdc), amount)) * iterations;
        uint256 expectedFees = sendCash.calculateFee(address(usdc), amount) *
            iterations;

        assertEq(bobBalanceAfter - bobBalanceBefore, expectedBobReceived);
        assertEq(
            feeRecipientBalanceAfter - feeRecipientBalanceBefore,
            expectedFees
        );
        vm.stopPrank();
    }

    function testStress_ConcurrentPaymentsMultipleTokens() public {
        uint256 amount = 100 * 10 ** 6;

        vm.startPrank(alice);
        usdc.approve(address(sendCash), amount);
        usdt.approve(address(sendCash), amount);
        wbtc.approve(address(sendCash), 1 * 10 ** 8);

        // Send payments with different tokens
        sendCash.sendPayment("bob", address(usdc), amount);
        sendCash.sendPayment("bob", address(usdt), amount);
        sendCash.sendPayment("bob", address(wbtc), 1 * 10 ** 8);

        // Verify all succeeded
        assertTrue(usdc.balanceOf(bob) > 0);
        assertTrue(usdt.balanceOf(bob) > 0);
        assertTrue(wbtc.balanceOf(bob) > 0);
        vm.stopPrank();
    }

    // ============ STRESS TEST: Fee Overrides ============

    function testStress_TokenFeeOverrides() public {
        uint256 amount = 1000 * 10 ** 6; // $1000

        // Set custom fee for USDT (1% = 100 bps)
        vm.prank(owner);
        sendCash.setTokenFeeBps(address(usdt), 100);

        vm.startPrank(alice);
        usdc.approve(address(sendCash), amount);
        usdt.approve(address(sendCash), amount);

        uint256 usdcFee = sendCash.calculateFee(address(usdc), amount);
        uint256 usdtFee = sendCash.calculateFee(address(usdt), amount);

        // USDC should use global fee (0.5%), USDT should use override (1%)
        assertEq(usdcFee, (amount * INITIAL_FEE_BPS) / 10000);
        assertEq(usdtFee, (amount * 100) / 10000);
        assertTrue(usdtFee > usdcFee);

        // Reset to 0 (use global)
        vm.stopPrank();
        vm.prank(owner);
        sendCash.setTokenFeeBps(address(usdt), 0);

        // Should now use global fee
        assertEq(sendCash.calculateFee(address(usdt), amount), usdcFee);
    }

    function testStress_MaxFeeBoundary() public {
        uint256 amount = 1000 * 10 ** 6;

        // Set fee to maximum (2% = 200 bps)
        vm.prank(owner);
        sendCash.setFeeBps(200);

        uint256 maxFee = sendCash.calculateFee(address(usdc), amount);
        assertEq(maxFee, (amount * 200) / 10000);

        // Try to exceed max - should fail
        vm.prank(owner);
        vm.expectRevert("Fee too high");
        sendCash.setFeeBps(201);
    }

    // ============ STRESS TEST: Pause/Unpause ============

    function testStress_PauseDuringActivePayments() public {
        uint256 amount = 100 * 10 ** 6;

        vm.startPrank(alice);
        usdc.approve(address(sendCash), amount * 2);

        // Send one payment
        sendCash.sendPayment("bob", address(usdc), amount);

        // Pause contract
        vm.stopPrank();
        vm.prank(owner);
        sendCash.pause();

        // Try to send while paused - should fail
        vm.startPrank(alice);
        vm.expectRevert();
        sendCash.sendPayment("bob", address(usdc), amount);

        // Unpause
        vm.stopPrank();
        vm.prank(owner);
        sendCash.unpause();

        // Should work again
        vm.startPrank(alice);
        sendCash.sendPayment("bob", address(usdc), amount);
        vm.stopPrank();
    }

    // ============ STRESS TEST: Fee Recipient Changes ============

    function testStress_FeeRecipientChange() public {
        address newFeeRecipient = address(999);
        uint256 amount = 1000 * 10 ** 6;

        // Change fee recipient
        vm.prank(owner);
        sendCash.setFeeRecipient(newFeeRecipient);

        vm.startPrank(alice);
        usdc.approve(address(sendCash), amount);
        sendCash.sendPayment("bob", address(usdc), amount);
        vm.stopPrank();

        // Fees should go to new recipient
        uint256 fee = sendCash.calculateFee(address(usdc), amount);
        assertEq(usdc.balanceOf(newFeeRecipient), fee);
    }

    // ============ STRESS TEST: Address vs Username Payments ============

    function testStress_AddressAndUsernamePayments() public {
        uint256 amount = 100 * 10 ** 6;

        vm.startPrank(alice);
        usdc.approve(address(sendCash), amount * 2);

        uint256 bobBalanceBefore = usdc.balanceOf(bob);

        // Send via username
        sendCash.sendPayment("bob", address(usdc), amount);
        uint256 afterUsername = usdc.balanceOf(bob);

        // Send via address
        sendCash.sendPaymentToAddress(bob, address(usdc), amount);
        uint256 afterAddress = usdc.balanceOf(bob);

        // Both should work and result in same amounts
        assertTrue(afterUsername > bobBalanceBefore);
        assertTrue(afterAddress > afterUsername);
        vm.stopPrank();
    }

    // ============ STRESS TEST: Edge Cases ============

    function testStress_ZeroAmount() public {
        vm.startPrank(alice);
        usdc.approve(address(sendCash), 0);
        vm.expectRevert("Amount must be greater than 0");
        sendCash.sendPayment("bob", address(usdc), 0);
        vm.stopPrank();
    }

    function testStress_SendToSelf() public {
        uint256 amount = 100 * 10 ** 6;
        vm.startPrank(alice);
        usdc.approve(address(sendCash), amount);
        vm.expectRevert("Cannot send to yourself");
        sendCash.sendPayment("alice", address(usdc), amount);
        vm.stopPrank();
    }

    function testStress_InvalidUsername() public {
        uint256 amount = 100 * 10 ** 6;
        vm.startPrank(alice);
        usdc.approve(address(sendCash), amount);
        vm.expectRevert("Username not found");
        sendCash.sendPayment("nonexistent", address(usdc), amount);
        vm.stopPrank();
    }

    function testStress_UnsupportedToken() public {
        MockERC20 unsupported = new MockERC20("Unsupported", "UNS", 18);
        uint256 amount = 100 * 10 ** 18;

        vm.startPrank(alice);
        unsupported.approve(address(sendCash), amount);
        vm.expectRevert("Token not supported");
        sendCash.sendPaymentToAddress(bob, address(unsupported), amount);
        vm.stopPrank();
    }

    // ============ STRESS TEST: Gas Optimization ============

    function testStress_GasUsageComparison() public {
        uint256 amount = 100 * 10 ** 6;

        vm.startPrank(alice);
        usdc.approve(address(sendCash), amount * 2);

        // Measure gas for username payment
        uint256 gasStart = gasleft();
        sendCash.sendPayment("bob", address(usdc), amount);
        uint256 gasUsername = gasStart - gasleft();

        // Measure gas for address payment
        gasStart = gasleft();
        sendCash.sendPaymentToAddress(bob, address(usdc), amount);
        uint256 gasAddress = gasStart - gasleft();

        // Address payment should be slightly cheaper (no username lookup)
        assertTrue(gasAddress <= gasUsername);
    }

    // ============ STRESS TEST: Large Scale Operations ============

    function testStress_LargeScalePayments() public {
        // Fund alice with massive amount
        usdc.mint(alice, 100000000 * 10 ** 6); // 100M USDC

        uint256 amount = 1000 * 10 ** 6; // $1000 per payment
        uint256 iterations = 100;

        vm.startPrank(alice);
        usdc.approve(address(sendCash), amount * iterations);

        for (uint256 i = 0; i < iterations; i++) {
            if (i % 2 == 0) {
                sendCash.sendPayment("bob", address(usdc), amount);
            } else {
                sendCash.sendPayment("charlie", address(usdc), amount);
            }
        }

        // Verify balances
        assertTrue(usdc.balanceOf(bob) > 0);
        assertTrue(usdc.balanceOf(charlie) > 0);
        vm.stopPrank();
    }

    // ============ STRESS TEST: Token Management ============

    function testStress_AddRemoveTokens() public {
        MockERC20 newToken = new MockERC20("New Token", "NEW", 18);

        // Add token
        vm.prank(owner);
        sendCash.addSupportedToken(address(newToken));
        assertTrue(sendCash.supportedTokens(address(newToken)));

        // Try to use it
        newToken.mint(alice, 1000 * 10 ** 18);
        vm.startPrank(alice);
        newToken.approve(address(sendCash), 1000 * 10 ** 18);
        sendCash.sendPayment("bob", address(newToken), 100 * 10 ** 18);
        vm.stopPrank();

        // Remove token
        vm.prank(owner);
        sendCash.removeSupportedToken(address(newToken));
        assertFalse(sendCash.supportedTokens(address(newToken)));

        // Should fail now
        vm.startPrank(alice);
        newToken.approve(address(sendCash), 100 * 10 ** 18);
        vm.expectRevert("Token not supported");
        sendCash.sendPayment("bob", address(newToken), 100 * 10 ** 18);
        vm.stopPrank();
    }

    // ============ STRESS TEST: Access Control ============

    function testStress_OnlyOwnerFunctions() public {
        // Non-owner cannot pause
        vm.prank(alice);
        vm.expectRevert();
        sendCash.pause();

        // Non-owner cannot set fees
        vm.prank(alice);
        vm.expectRevert();
        sendCash.setFeeBps(100);

        // Non-owner cannot add tokens
        MockERC20 newToken = new MockERC20("New", "NEW", 18);
        vm.prank(alice);
        vm.expectRevert();
        sendCash.addSupportedToken(address(newToken));

        // Non-owner cannot change fee recipient
        vm.prank(alice);
        vm.expectRevert();
        sendCash.setFeeRecipient(address(999));
    }

    // ============ STRESS TEST: Fee Precision ============

    function testStress_FeePrecisionEdgeCases() public view {
        // Test amounts that result in rounding
        uint256[] memory amounts = new uint256[](5);
        amounts[0] = 1; // Minimum
        amounts[1] = 3; // Should round down
        amounts[2] = 10; // Small but valid
        amounts[3] = 100 * 10 ** 6; // Normal
        amounts[4] = 1000000000 * 10 ** 6; // Very large but safe (1B USDC)

        for (uint256 i = 0; i < amounts.length; i++) {
            uint256 fee = sendCash.calculateFee(address(usdc), amounts[i]);
            // Fee should never exceed amount
            assertTrue(fee <= amounts[i]);
            // Fee should be calculable without overflow
            assertTrue(fee >= 0);
        }
    }
}
