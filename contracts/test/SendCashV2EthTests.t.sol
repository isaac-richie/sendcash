// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/SendCashV2.sol";
import "../contracts/UsernameRegistryV2.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {
        _mint(msg.sender, 1000000 * 10 ** 6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

contract SendCashV2EthTests is Test {
    SendCashV2 public sendCash;
    UsernameRegistryV2 public registry;
    MockUSDC public usdc;

    address public owner = address(1);
    address public feeRecipient = address(2);
    address public alice = address(3);
    address public bob = address(4);
    address public charlie = address(5);

    uint256 public constant INITIAL_FEE_BPS = 50; // 0.5%

    function setUp() public {
        usdc = new MockUSDC();

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

        // Add USDC as supported token
        vm.prank(owner);
        sendCash.addSupportedToken(address(usdc));

        // Fund users with ETH
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(charlie, 100 ether);

        // Register usernames
        vm.prank(alice);
        registry.registerUsername("alice");
        vm.prank(bob);
        registry.registerUsername("bob");
        vm.prank(charlie);
        registry.registerUsername("charlie");
    }

    // ============ ETH Payment Tests ============

    function testSendEthPaymentToUsername() public {
        uint256 amount = 1 ether;
        uint256 expectedFee = sendCash.calculateEthFee(amount);
        uint256 expectedRecipient = amount - expectedFee;

        uint256 bobBalanceBefore = bob.balance;
        uint256 feeRecipientBalanceBefore = feeRecipient.balance;

        vm.prank(alice);
        sendCash.sendEthPayment{value: amount}("bob");

        uint256 bobBalanceAfter = bob.balance;
        uint256 feeRecipientBalanceAfter = feeRecipient.balance;

        assertEq(bobBalanceAfter - bobBalanceBefore, expectedRecipient);
        assertEq(feeRecipientBalanceAfter - feeRecipientBalanceBefore, expectedFee);
    }

    function testSendEthPaymentToAddress() public {
        uint256 amount = 1 ether;
        uint256 expectedFee = sendCash.calculateEthFee(amount);
        uint256 expectedRecipient = amount - expectedFee;

        uint256 bobBalanceBefore = bob.balance;
        uint256 feeRecipientBalanceBefore = feeRecipient.balance;

        vm.prank(alice);
        sendCash.sendEthPaymentToAddress{value: amount}(bob);

        uint256 bobBalanceAfter = bob.balance;
        uint256 feeRecipientBalanceAfter = feeRecipient.balance;

        assertEq(bobBalanceAfter - bobBalanceBefore, expectedRecipient);
        assertEq(feeRecipientBalanceAfter - feeRecipientBalanceBefore, expectedFee);
    }

    function testEthFeeCalculation() public view {
        uint256 amount1 = 1 ether;
        uint256 amount2 = 10 ether;
        uint256 amount3 = 0.001 ether;

        uint256 fee1 = sendCash.calculateEthFee(amount1);
        uint256 fee2 = sendCash.calculateEthFee(amount2);
        uint256 fee3 = sendCash.calculateEthFee(amount3);

        // 0.5% of 1 ETH = 0.005 ETH = 5e15 wei
        assertEq(fee1, 5e15);
        // 0.5% of 10 ETH = 0.05 ETH = 5e16 wei
        assertEq(fee2, 5e16);
        // 0.5% of 0.001 ETH = 0.000005 ETH = 5e12 wei
        assertEq(fee3, 5e12);
    }

    function testCannotSendEthWhenDisabled() public {
        // Deploy new contract with ETH disabled
        vm.prank(owner);
        SendCashV2 sendCashNoEth = new SendCashV2(
            address(registry),
            feeRecipient,
            INITIAL_FEE_BPS,
            false // Disable native ETH
        );

        vm.prank(alice);
        vm.expectRevert("Native ETH not enabled");
        sendCashNoEth.sendEthPayment{value: 1 ether}("bob");
    }

    function testCannotSendZeroEth() public {
        vm.prank(alice);
        vm.expectRevert("Amount must be greater than 0");
        sendCash.sendEthPayment{value: 0}("bob");
    }

    function testCannotSendEthToSelf() public {
        vm.prank(alice);
        vm.expectRevert("Cannot send to yourself");
        sendCash.sendEthPayment{value: 1 ether}("alice");
    }

    function testCannotSendEthToInvalidUsername() public {
        vm.prank(alice);
        vm.expectRevert("Username not found");
        sendCash.sendEthPayment{value: 1 ether}("nonexistent");
    }

    function testEthPaymentWithCustomFee() public {
        uint256 amount = 1 ether;

        // Set custom fee for ETH (1% = 100 bps)
        vm.startPrank(owner);
        sendCash.setTokenFeeBps(sendCash.NATIVE_ETH(), 100);
        vm.stopPrank();

        uint256 fee = sendCash.calculateEthFee(amount);
        assertEq(fee, 1e16); // 1% of 1 ETH = 0.01 ETH

        // Reset to global fee
        vm.startPrank(owner);
        sendCash.setTokenFeeBps(sendCash.NATIVE_ETH(), 0);
        vm.stopPrank();

        fee = sendCash.calculateEthFee(amount);
        assertEq(fee, 5e15); // Back to 0.5% = 0.005 ETH
    }

    function testMultipleEthPayments() public {
        uint256 amount = 0.1 ether;
        uint256 iterations = 10;

        uint256 bobBalanceBefore = bob.balance;
        uint256 feeRecipientBalanceBefore = feeRecipient.balance;

        for (uint256 i = 0; i < iterations; i++) {
            vm.prank(alice);
            sendCash.sendEthPayment{value: amount}("bob");
        }

        uint256 bobBalanceAfter = bob.balance;
        uint256 feeRecipientBalanceAfter = feeRecipient.balance;

        uint256 totalAmount = amount * iterations;
        uint256 totalFee = sendCash.calculateEthFee(amount) * iterations;
        uint256 totalReceived = totalAmount - totalFee;

        assertEq(bobBalanceAfter - bobBalanceBefore, totalReceived);
        assertEq(feeRecipientBalanceAfter - feeRecipientBalanceBefore, totalFee);
    }

    function testEthAndTokenPayments() public {
        uint256 ethAmount = 1 ether;
        uint256 tokenAmount = 1000 * 10 ** 6; // 1000 USDC

        // Fund alice with USDC
        usdc.transfer(alice, tokenAmount);

        // Send ETH payment
        vm.prank(alice);
        sendCash.sendEthPayment{value: ethAmount}("bob");

        // Send token payment
        vm.startPrank(alice);
        usdc.approve(address(sendCash), tokenAmount);
        sendCash.sendPayment("bob", address(usdc), tokenAmount);
        vm.stopPrank();

        // Both should succeed
        assertTrue(bob.balance > 0);
        assertTrue(usdc.balanceOf(bob) > 0);
    }

    function testEthPaymentWhenPaused() public {
        uint256 amount = 1 ether;

        // Pause contract
        vm.prank(owner);
        sendCash.pause();

        // Try to send ETH - should fail
        vm.prank(alice);
        vm.expectRevert();
        sendCash.sendEthPayment{value: amount}("bob");

        // Unpause
        vm.prank(owner);
        sendCash.unpause();

        // Should work now
        vm.prank(alice);
        sendCash.sendEthPayment{value: amount}("bob");
        assertTrue(bob.balance > 0);
    }

    function testEthFeeRecipientChange() public {
        address newFeeRecipient = address(999);
        uint256 amount = 1 ether;

        // Change fee recipient
        vm.prank(owner);
        sendCash.setFeeRecipient(newFeeRecipient);

        vm.prank(alice);
        sendCash.sendEthPayment{value: amount}("bob");

        // Fees should go to new recipient
        uint256 fee = sendCash.calculateEthFee(amount);
        assertEq(newFeeRecipient.balance, fee);
    }

    function testEnableDisableNativeEth() public {
        // Disable native ETH
        vm.prank(owner);
        sendCash.setNativeEthEnabled(false);

        assertFalse(sendCash.nativeEthEnabled());
        assertFalse(sendCash.supportedTokens(sendCash.NATIVE_ETH()));

        // Try to send - should fail
        vm.prank(alice);
        vm.expectRevert("Native ETH not enabled");
        sendCash.sendEthPayment{value: 1 ether}("bob");

        // Re-enable
        vm.prank(owner);
        sendCash.setNativeEthEnabled(true);

        assertTrue(sendCash.nativeEthEnabled());
        assertTrue(sendCash.supportedTokens(sendCash.NATIVE_ETH()));

        // Should work now
        vm.prank(alice);
        sendCash.sendEthPayment{value: 1 ether}("bob");
        assertTrue(bob.balance > 0);
    }

    function testContractCanReceiveEth() public {
        // Send ETH directly to contract
        vm.deal(address(this), 1 ether);
        (bool success, ) = address(sendCash).call{value: 1 ether}("");
        assertTrue(success);
        assertEq(address(sendCash).balance, 1 ether);
    }
}
