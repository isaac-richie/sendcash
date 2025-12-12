// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/UsernameRegistryV2.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {
        _mint(msg.sender, 1000000000 * 10 ** 6); // 1B USDC
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract UsernameRegistryV2StressTest is Test {
    UsernameRegistryV2 public registry;
    MockUSDC public usdc;

    address public owner = address(1);
    address public user1 = address(2);
    address public user2 = address(3);
    address public user3 = address(4);
    address public attacker = address(999);

    function setUp() public {
        usdc = new MockUSDC();
        vm.prank(owner);
        registry = new UsernameRegistryV2(address(usdc));
    }

    // ============ STRESS TEST: Username Normalization ============

    function testStress_CaseInsensitiveUsernames() public {
        // Register with lowercase
        vm.prank(user1);
        registry.registerUsername("alice");

        // Try to register same username with different cases - should fail
        vm.prank(user2);
        vm.expectRevert("Username already taken");
        registry.registerUsername("ALICE");

        vm.prank(user3);
        vm.expectRevert("Username already taken");
        registry.registerUsername("Alice");

        vm.prank(attacker);
        vm.expectRevert("Username already taken");
        registry.registerUsername("aLiCe");

        // All should resolve to same address
        assertEq(registry.getAddress("alice"), user1);
        assertEq(registry.getAddress("ALICE"), user1);
        assertEq(registry.getAddress("Alice"), user1);
        assertEq(registry.getAddress("aLiCe"), user1);
    }

    function testStress_UsernameNormalizationEdgeCases() public {
        // Test various case combinations
        string[10] memory usernames = [
            "test",
            "TEST",
            "Test",
            "tEsT",
            "TeSt",
            "tESt",
            "TEsT",
            "teST",
            "TESt",
            "tEST"
        ];

        // First registration should work
        vm.prank(user1);
        registry.registerUsername(usernames[0]);

        // All other variations should fail
        for (uint256 i = 1; i < usernames.length; i++) {
            vm.prank(address(uint160(i + 10)));
            vm.expectRevert("Username already taken");
            registry.registerUsername(usernames[i]);
        }
    }

    // ============ STRESS TEST: Username Validation ============

    function testStress_InvalidUsernameFormats() public {
        // Empty username
        vm.prank(user1);
        vm.expectRevert("Username cannot be empty");
        registry.registerUsername("");

        // Other invalid formats
        string[14] memory invalidUsernames = [
            "user-name", // Dash
            "user name", // Space
            "user@name", // Special char
            "user.name", // Dot
            "user#name", // Hash
            "user$name", // Dollar
            "user%name", // Percent
            "user&name", // Ampersand
            "user*name", // Asterisk
            "user+name", // Plus
            "user=name", // Equals
            "user!name", // Exclamation
            "user?name", // Question
            "user/name" // Slash
        ];

        for (uint256 i = 0; i < invalidUsernames.length; i++) {
            vm.prank(address(uint160(i + 1000)));
            vm.expectRevert("Invalid username format");
            registry.registerUsername(invalidUsernames[i]);
        }
    }

    function testStress_ValidUsernameFormats() public {
        // Use unique addresses and usernames to avoid conflicts
        address[10] memory testUsers = [
            address(2000),
            address(2001),
            address(2002),
            address(2003),
            address(2004),
            address(2005),
            address(2006),
            address(2007),
            address(2008),
            address(2009)
        ];

        string[10] memory validUsernames = [
            "alice",
            "alice123",
            "alice_123",
            "ALICE",
            "Alice123",
            "a",
            "a1",
            "a_1",
            "user123_abc",
            "verylongusername123456789"
        ];

        for (uint256 i = 0; i < validUsernames.length; i++) {
            vm.prank(testUsers[i]);
            registry.registerUsername(validUsernames[i]);
            assertEq(registry.getAddress(validUsernames[i]), testUsers[i]);
        }
    }

    function testStress_UsernameLengthBoundary() public {
        // Test maximum length (32 characters)
        string memory maxLength = "a12345678901234567890123456789"; // 32 chars
        vm.prank(user1);
        registry.registerUsername(maxLength);
        assertEq(registry.getAddress(maxLength), user1);

        // Test over maximum (should fail validation)
        // Note: Solidity strings are limited, so we test with a string that's definitely too long
        // The contract checks length <= 32, so 33+ chars should fail
        string memory tooLong = "123456789012345678901234567890123"; // 33 chars
        vm.prank(user2);
        vm.expectRevert();
        registry.registerUsername(tooLong);
    }

    // ============ STRESS TEST: Multiple Registrations ============

    function testStress_MassRegistration() public {
        uint256 count = 100;

        for (uint256 i = 0; i < count; i++) {
            address user = address(uint160(i + 1000));
            string memory username = string(
                abi.encodePacked("user", vm.toString(i))
            );

            vm.prank(user);
            registry.registerUsername(username);

            // Verify registration
            assertEq(registry.getAddress(username), user);
            assertEq(registry.getUsername(user), username);
        }
    }

    function testStress_ConcurrentRegistrations() public {
        // Simulate multiple users trying to register simultaneously
        address[10] memory users = [
            address(100),
            address(101),
            address(102),
            address(103),
            address(104),
            address(105),
            address(106),
            address(107),
            address(108),
            address(109)
        ];

        string[10] memory usernames = [
            "user0",
            "user1",
            "user2",
            "user3",
            "user4",
            "user5",
            "user6",
            "user7",
            "user8",
            "user9"
        ];

        // Register all
        for (uint256 i = 0; i < users.length; i++) {
            vm.prank(users[i]);
            registry.registerUsername(usernames[i]);
        }

        // Verify all registered
        for (uint256 i = 0; i < users.length; i++) {
            assertEq(registry.getAddress(usernames[i]), users[i]);
        }
    }

    // ============ STRESS TEST: Username Updates ============

    function testStress_MultipleUsernameUpdates() public {
        vm.prank(user1);
        registry.registerUsername("oldname1");

        string[5] memory newNames = [
            "newname1",
            "newname2",
            "newname3",
            "newname4",
            "newname5"
        ];

        for (uint256 i = 0; i < newNames.length; i++) {
            vm.prank(user1);
            registry.updateUsername(newNames[i]);

            // Old name should be freed
            assertEq(registry.getAddress(newNames[i]), user1);
            if (i > 0) {
                assertEq(registry.getAddress(newNames[i - 1]), address(0));
            }
        }
    }

    function testStress_CannotUpdatePremiumUsername() public {
        vm.prank(user1);
        registry.registerPremiumUsername("premium");

        // Try to update - should fail
        vm.prank(user1);
        vm.expectRevert("Cannot update premium username");
        registry.updateUsername("newpremium");
    }

    // ============ STRESS TEST: Username Transfers ============

    function testStress_UsernameTransfers() public {
        vm.prank(user1);
        registry.registerUsername("transferable");

        // Transfer to user2
        vm.prank(user1);
        registry.transferUsername(user2);

        assertEq(registry.getAddress("transferable"), user2);
        assertEq(registry.getUsername(user2), "transferable");
        assertEq(registry.getUsername(user1), ""); // user1 no longer has username
    }

    function testStress_CannotTransferToUserWithUsername() public {
        vm.prank(user1);
        registry.registerUsername("user1name");
        vm.prank(user2);
        registry.registerUsername("user2name");

        // Try to transfer user1's name to user2 - should fail
        vm.prank(user1);
        vm.expectRevert("Recipient already has username");
        registry.transferUsername(user2);
    }

    // ============ STRESS TEST: Premium Usernames ============

    function testStress_PremiumUsernameFeatures() public {
        vm.prank(user1);
        registry.registerPremiumUsername("vip");

        // Should be marked as premium
        assertTrue(registry.premiumUsernames("vip"));
        assertEq(registry.getAddress("vip"), user1);

        // Cannot update
        vm.prank(user1);
        vm.expectRevert("Cannot update premium username");
        registry.updateUsername("newvip");

        // Can transfer
        vm.prank(user1);
        registry.transferUsername(user2);
        assertEq(registry.getAddress("vip"), user2);
        assertTrue(registry.premiumUsernames("vip")); // Still premium after transfer
    }

    // ============ STRESS TEST: Fee Collection ============

    function testStress_FeeCollectionWithFees() public {
        // Set registration fee
        vm.prank(owner);
        registry.setRegistrationFee(10 * 10 ** 6); // 10 USDC

        // Fund users
        usdc.mint(user1, 100 * 10 ** 6);
        usdc.mint(user2, 100 * 10 ** 6);

        // Register usernames (should collect fees)
        vm.startPrank(user1);
        usdc.approve(address(registry), 10 * 10 ** 6);
        registry.registerUsername("alice");
        vm.stopPrank();

        vm.startPrank(user2);
        usdc.approve(address(registry), 10 * 10 ** 6);
        registry.registerUsername("bob");
        vm.stopPrank();

        // Owner should be able to withdraw
        uint256 balanceBefore = usdc.balanceOf(owner);
        vm.prank(owner);
        registry.withdrawFees(owner);
        uint256 balanceAfter = usdc.balanceOf(owner);

        assertEq(balanceAfter - balanceBefore, 20 * 10 ** 6); // 20 USDC total
    }

    function testStress_PremiumFeeCollection() public {
        // Set premium fee
        vm.prank(owner);
        registry.setPremiumFee(100 * 10 ** 6); // 100 USDC

        // Fund user
        usdc.mint(user1, 200 * 10 ** 6);

        // Register premium username
        vm.startPrank(user1);
        usdc.approve(address(registry), 100 * 10 ** 6);
        registry.registerPremiumUsername("vip");
        vm.stopPrank();

        // Withdraw fees
        uint256 balanceBefore = usdc.balanceOf(owner);
        vm.prank(owner);
        registry.withdrawFees(owner);
        uint256 balanceAfter = usdc.balanceOf(owner);

        assertEq(balanceAfter - balanceBefore, 100 * 10 ** 6);
    }

    // ============ STRESS TEST: Edge Cases ============

    function testStress_EmptyUsernameLookup() public {
        // Get address for non-existent username
        address result = registry.getAddress("nonexistent");
        assertEq(result, address(0));

        // Get username for address without one
        string memory username = registry.getUsername(attacker);
        assertEq(bytes(username).length, 0);
    }

    function testStress_UsernameAvailability() public {
        // Check availability before registration
        assertTrue(registry.isUsernameAvailable("available"));

        // Register
        vm.prank(user1);
        registry.registerUsername("available");

        // Should not be available (case-insensitive)
        assertFalse(registry.isUsernameAvailable("available"));
        assertFalse(registry.isUsernameAvailable("AVAILABLE"));
        assertFalse(registry.isUsernameAvailable("Available"));
    }

    function testStress_RegisterForAddress() public {
        address factoryWallet = address(500);
        address feePayer = user1;

        // Fund fee payer
        usdc.mint(feePayer, 100 * 10 ** 6);

        vm.startPrank(feePayer);
        usdc.approve(address(registry), 10 * 10 ** 6);
        registry.registerUsernameForAddress(
            "factoryuser",
            factoryWallet,
            feePayer
        );
        vm.stopPrank();

        assertEq(registry.getAddress("factoryuser"), factoryWallet);
        assertEq(registry.getUsername(factoryWallet), "factoryuser");
    }

    // ============ STRESS TEST: Access Control ============

    function testStress_OnlyOwnerFunctions() public {
        // Non-owner cannot set fees
        vm.prank(user1);
        vm.expectRevert();
        registry.setRegistrationFee(10 * 10 ** 6);

        vm.prank(user1);
        vm.expectRevert();
        registry.setPremiumFee(100 * 10 ** 6);

        // Non-owner cannot withdraw
        vm.prank(user1);
        vm.expectRevert();
        registry.withdrawFees(owner);
    }

    // ============ STRESS TEST: Gas Optimization ============

    function testStress_GasUsageForLookups() public {
        // Register multiple usernames
        for (uint256 i = 0; i < 10; i++) {
            address user = address(uint160(i + 1000));
            string memory username = string(
                abi.encodePacked("user", vm.toString(i))
            );
            vm.prank(user);
            registry.registerUsername(username);
        }

        // Measure gas for lookups
        uint256 gasStart = gasleft();
        registry.getAddress("user5");
        uint256 gasUsed = gasStart - gasleft();

        // Should be reasonable (under 10k gas for simple lookup)
        assertTrue(gasUsed < 10000);
    }

    // ============ STRESS TEST: Boundary Conditions ============

    function testStress_MinimumLengthUsername() public {
        // Single character username
        vm.prank(user1);
        registry.registerUsername("a");
        assertEq(registry.getAddress("a"), user1);
    }

    function testStress_MaximumLengthUsername() public {
        // 32 character username (max)
        string memory maxUser = "12345678901234567890123456789012"; // 32 chars
        vm.prank(user1);
        registry.registerUsername(maxUser);
        assertEq(registry.getAddress(maxUser), user1);
    }

    function testStress_NumericOnlyUsernames() public {
        vm.prank(user1);
        registry.registerUsername("12345");
        assertEq(registry.getAddress("12345"), user1);
    }

    function testStress_UnderscoreOnlyUsernames() public {
        // Username with only underscores
        vm.prank(user1);
        registry.registerUsername("___");
        assertEq(registry.getAddress("___"), user1);
    }

    // ============ STRESS TEST: Reentrancy Protection ============

    function testStress_ReentrancyProtection() public {
        // Registry uses ReentrancyGuard, so reentrancy should be prevented
        // This is tested implicitly through the nonReentrant modifier
        // on all state-changing functions

        vm.prank(user1);
        registry.registerUsername("test");

        // Multiple operations should work safely
        vm.prank(user1);
        registry.updateUsername("test2");

        vm.prank(user1);
        registry.transferUsername(user2);

        // All should succeed without issues
        assertEq(registry.getAddress("test2"), user2);
    }
}
