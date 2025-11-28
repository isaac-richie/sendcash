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

contract FuzzTest is Test {
    UsernameRegistry public registry;
    SendCash public sendCash;
    MockUSDC public usdc;
    address public owner = address(1);
    address public user1 = address(2);
    address public user2 = address(3);

    function setUp() public {
        usdc = new MockUSDC();
        
        vm.prank(owner);
        registry = new UsernameRegistry(address(usdc));
        
        vm.prank(owner);
        sendCash = new SendCash(address(registry));

        vm.prank(owner);
        sendCash.addSupportedToken(address(usdc));

        usdc.transfer(user1, 10000 * 10**6);
        usdc.transfer(user2, 10000 * 10**6);
    }

    // ========== FUZZ TESTS ==========

    /**
     * @notice Fuzz test: Fee calculation should always be accurate
     * @param amount Payment amount (fuzzed)
     */
    function testFuzzFeeCalculation(uint256 amount) public view {
        // Bound amount to reasonable range (1 to 1M USDC)
        amount = bound(amount, 1, 1000000 * 10**6);
        
        uint256 fee = sendCash.calculateFee(amount);
        uint256 expectedFee = (amount * 50) / 10000;
        
        assertEq(fee, expectedFee, "Fee calculation incorrect");
        
        // Fee should never exceed amount
        assertLe(fee, amount, "Fee exceeds amount");
        
        // Fee should be at least 0 (for very small amounts, might round to 0)
        assertGe(fee, 0, "Fee is negative");
    }

    /**
     * @notice Fuzz test: Valid usernames should always register successfully
     * @param username Username to test (fuzzed)
     */
    function testFuzzValidUsernameRegistration(string memory username) public {
        // Skip if username is invalid
        if (!registry.isValidUsername(username)) {
            return;
        }
        
        // Skip if username is too long
        if (bytes(username).length > 32 || bytes(username).length == 0) {
            return;
        }

        // Skip if already registered (in case of collisions)
        if (registry.usernameToAddress(username) != address(0)) {
            return;
        }

        vm.startPrank(user1);
        usdc.approve(address(registry), 1 * 10**6);
        
        // Should succeed for valid username
        registry.registerUsername(username);
        
        // Verify registration
        assertEq(registry.usernameToAddress(username), user1);
        assertEq(registry.addressToUsername(user1), username);
        
        vm.stopPrank();
    }

    /**
     * @notice Fuzz test: Payment amounts should always calculate fees correctly
     * @param amount Payment amount (fuzzed)
     */
    function testFuzzPaymentFeeCalculation(uint256 amount) public {
        // Bound amount to reasonable range (within user's balance)
        amount = bound(amount, 1, 1000 * 10**6); // $1 to $1000 (within 10000 USDC balance)
        
        // Register users
        vm.startPrank(user1);
        usdc.approve(address(registry), 1 * 10**6);
        registry.registerUsername("alice");
        vm.stopPrank();

        vm.startPrank(user2);
        usdc.approve(address(registry), 1 * 10**6);
        registry.registerUsername("bob");
        
        // Ensure user has enough balance (they already have 10000 USDC)
        usdc.approve(address(sendCash), amount);
        
        uint256 ownerBalanceBefore = usdc.balanceOf(owner);
        sendCash.sendPayment("alice", address(usdc), amount);
        uint256 ownerBalanceAfter = usdc.balanceOf(owner);
        
        // Calculate expected fee
        uint256 expectedFee = (amount * 50) / 10000;
        uint256 actualFee = ownerBalanceAfter - ownerBalanceBefore;
        
        assertEq(actualFee, expectedFee, "Fee calculation mismatch");
        
        vm.stopPrank();
    }

    /**
     * @notice Fuzz test: Username validation should reject invalid characters
     * @param char Character to test (fuzzed)
     */
    function testFuzzInvalidUsernameCharacters(uint8 char) public view {
        // Create a username with the fuzzed character
        bytes memory usernameBytes = new bytes(5);
        usernameBytes[0] = bytes1(uint8(97)); // 'a'
        usernameBytes[1] = bytes1(uint8(98)); // 'b'
        usernameBytes[2] = bytes1(char);      // Fuzzed character
        usernameBytes[3] = bytes1(uint8(99)); // 'c'
        usernameBytes[4] = bytes1(uint8(100)); // 'd'
        
        string memory username = string(usernameBytes);
        
        // Check if character is valid (0-9, A-Z, a-z, _)
        bool isValidChar = 
            (char >= 48 && char <= 57) ||  // 0-9
            (char >= 65 && char <= 90) ||  // A-Z
            (char >= 97 && char <= 122) || // a-z
            (char == 95);                   // _
        
        bool isValid = registry.isValidUsername(username);
        
        // If character is invalid, username should be invalid
        if (!isValidChar) {
            assertFalse(isValid, "Invalid character should make username invalid");
        }
    }

    /**
     * @notice Fuzz test: Fee should never cause underflow
     * @param amount Payment amount (fuzzed)
     */
    function testFuzzNoUnderflowOnFee(uint256 amount) public view {
        // Bound to prevent overflow in multiplication
        amount = bound(amount, 0, type(uint256).max / 100);
        
        uint256 fee = sendCash.calculateFee(amount);
        
        // amountAfterFee should not underflow
        uint256 amountAfterFee = amount - fee;
        
        // Should always be >= 0 (no underflow)
        assertGe(amountAfterFee, 0, "Underflow detected");
        
        // amountAfterFee should be less than or equal to amount
        assertLe(amountAfterFee, amount, "Amount after fee exceeds original");
    }

    /**
     * @notice Fuzz test: Registration fee should always be collected
     * @param feeAmount Fee amount to test (fuzzed, but should be 1 USDC)
     */
    function testFuzzRegistrationFeeCollection(uint256 feeAmount) public {
        // Bound to reasonable range
        feeAmount = bound(feeAmount, 1 * 10**6, 10 * 10**6);
        
        // Set registration fee
        vm.prank(owner);
        registry.setRegistrationFee(feeAmount);
        
        vm.startPrank(user1);
        usdc.approve(address(registry), feeAmount);
        
        uint256 contractBalanceBefore = usdc.balanceOf(address(registry));
        registry.registerUsername("fuzzuser");
        uint256 contractBalanceAfter = usdc.balanceOf(address(registry));
        
        // Fee should be collected
        assertEq(contractBalanceAfter - contractBalanceBefore, feeAmount);
        
        vm.stopPrank();
    }
}

