// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/SendCash.sol";
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

contract SendCashTest is Test {
    SendCash public sendCash;
    UsernameRegistry public registry;
    MockUSDC public usdc;
    address public owner = address(1);
    address public alice = address(2);
    address public bob = address(3);

    function setUp() public {
        // Deploy mock USDC (mints to msg.sender which is the test contract)
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

        // Give users USDC first (before registration)
        usdc.transfer(alice, 1000 * 10**6); // 1000 USDC
        usdc.transfer(bob, 1000 * 10**6);   // 1000 USDC

        // Register usernames
        vm.startPrank(alice);
        usdc.approve(address(registry), 1 * 10**6);
        registry.registerUsername("alice");
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(registry), 1 * 10**6);
        registry.registerUsername("bob");
        vm.stopPrank();
    }

    function testSendPayment() public {
        uint256 amount = 100 * 10**6; // $100
        uint256 expectedFee = (amount * 50) / 10000; // 0.5% = $0.50
        uint256 expectedRecipient = amount - expectedFee; // $99.50

        vm.startPrank(alice);
        usdc.approve(address(sendCash), amount);
        
        uint256 bobBalanceBefore = usdc.balanceOf(bob);
        uint256 ownerBalanceBefore = usdc.balanceOf(owner);
        
        sendCash.sendPayment("bob", address(usdc), amount);
        
        uint256 bobBalanceAfter = usdc.balanceOf(bob);
        uint256 ownerBalanceAfter = usdc.balanceOf(owner);
        
        // Bob should receive $99.50
        assertEq(bobBalanceAfter - bobBalanceBefore, expectedRecipient);
        // Owner should receive $0.50 fee
        assertEq(ownerBalanceAfter - ownerBalanceBefore, expectedFee);
        
        vm.stopPrank();
    }

    function testCalculateFee() public view {
        // Test fee calculation
        uint256 amount1 = 10 * 10**6;   // $10
        uint256 amount2 = 100 * 10**6;  // $100
        uint256 amount3 = 1000 * 10**6; // $1000

        uint256 fee1 = sendCash.calculateFee(amount1);
        uint256 fee2 = sendCash.calculateFee(amount2);
        uint256 fee3 = sendCash.calculateFee(amount3);

        // 0.5% of $10 = $0.05
        assertEq(fee1, 50000); // 0.05 * 10^6
        // 0.5% of $100 = $0.50
        assertEq(fee2, 500000); // 0.5 * 10^6
        // 0.5% of $1000 = $5.00
        assertEq(fee3, 5000000); // 5 * 10^6
    }

    function testCannotSendToInvalidUsername() public {
        vm.startPrank(alice);
        usdc.approve(address(sendCash), 100 * 10**6);
        
        vm.expectRevert();
        sendCash.sendPayment("nonexistent", address(usdc), 100 * 10**6);
        
        vm.stopPrank();
    }

    function testCannotSendToYourself() public {
        vm.startPrank(alice);
        usdc.approve(address(sendCash), 100 * 10**6);
        
        vm.expectRevert();
        sendCash.sendPayment("alice", address(usdc), 100 * 10**6);
        
        vm.stopPrank();
    }

    function testCannotSendUnsupportedToken() public {
        // Deploy another token
        MockUSDC fakeToken = new MockUSDC();
        
        vm.startPrank(alice);
        fakeToken.approve(address(sendCash), 100 * 10**6);
        
        vm.expectRevert();
        sendCash.sendPayment("bob", address(fakeToken), 100 * 10**6);
        
        vm.stopPrank();
    }

    function testFeeOnSmallAmount() public {
        uint256 amount = 1 * 10**6; // $1
        uint256 expectedFee = (amount * 50) / 10000; // 0.5% = $0.005

        vm.startPrank(alice);
        usdc.approve(address(sendCash), amount);
        
        uint256 ownerBalanceBefore = usdc.balanceOf(owner);
        sendCash.sendPayment("bob", address(usdc), amount);
        uint256 ownerBalanceAfter = usdc.balanceOf(owner);
        
        // Fee should be charged even on small amounts
        assertEq(ownerBalanceAfter - ownerBalanceBefore, expectedFee);
        
        vm.stopPrank();
    }

    function testAddRemoveSupportedToken() public {
        MockUSDC newToken = new MockUSDC();
        
        // Add token
        vm.prank(owner);
        sendCash.addSupportedToken(address(newToken));
        assertTrue(sendCash.supportedTokens(address(newToken)));
        
        // Remove token
        vm.prank(owner);
        sendCash.removeSupportedToken(address(newToken));
        assertFalse(sendCash.supportedTokens(address(newToken)));
    }

    function testOnlyOwnerCanManageTokens() public {
        MockUSDC newToken = new MockUSDC();
        
        // Non-owner cannot add token
        vm.prank(alice);
        vm.expectRevert();
        sendCash.addSupportedToken(address(newToken));
        
        // Non-owner cannot remove token
        vm.prank(alice);
        vm.expectRevert();
        sendCash.removeSupportedToken(address(usdc));
    }
}

