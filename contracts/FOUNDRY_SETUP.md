# Foundry Testing Setup

## ✅ Status: Fully Configured

Foundry is installed and configured for testing SendCash contracts.

## Installation

Foundry is already installed:
```bash
forge --version
# forge Version: 1.0.0-nightly
```

## Configuration

### `foundry.toml`
```toml
[profile.default]
src = "contracts"
out = "out"
libs = ["lib"]
remappings = [
    "@openzeppelin/=node_modules/@openzeppelin/",
    "@account-abstraction/=node_modules/@account-abstraction/contracts/",
    "forge-std/=lib/forge-std/src/"
]
optimizer = true
optimizer_runs = 200
```

## Test Files

### `test/UsernameRegistry.t.sol`
Tests for UsernameRegistry contract:
- ✅ `testRegisterUsername()` - Basic registration
- ✅ `testRegisterUsernameRequiresFee()` - Fee payment validation
- ✅ `testRegisterPremiumUsername()` - Premium registration (10 USDC)
- ✅ `testCannotRegisterTakenUsername()` - Duplicate username prevention
- ✅ `testUpdateUsername()` - Username updates
- ✅ `testCannotUpdatePremiumUsername()` - Premium username lock
- ✅ `testIsValidUsername()` - Username validation
- ✅ `testWithdrawFees()` - Fee withdrawal by owner

### `test/SendCash.t.sol`
Tests for SendCash contract:
- ✅ `testSendPayment()` - Basic payment flow
- ✅ `testCalculateFee()` - Fee calculation (0.5% on all payments)
- ✅ `testCannotSendToInvalidUsername()` - Invalid username handling
- ✅ `testCannotSendToYourself()` - Self-payment prevention
- ✅ `testCannotSendUnsupportedToken()` - Token validation
- ✅ `testFeeOnSmallAmount()` - Fee on small amounts
- ✅ `testAddRemoveSupportedToken()` - Token management
- ✅ `testOnlyOwnerCanManageTokens()` - Access control

## Running Tests

### Run all tests
```bash
cd contracts
forge test
```

### Run with verbose output
```bash
forge test -vvv
```

### Run specific test file
```bash
forge test --match-path test/UsernameRegistry.t.sol
forge test --match-path test/SendCash.t.sol
```

### Run specific test function
```bash
forge test --match-test testRegisterUsername
```

### Run with gas report
```bash
forge test --gas-report
```

### Run with coverage
```bash
forge coverage
```

## Test Results

**Current Status: All Tests Passing ✅**

```
Ran 2 test suites: 16 tests passed, 0 failed, 0 skipped
```

### UsernameRegistry Tests: 8/8 passing
### SendCash Tests: 8/8 passing

## NPM Scripts

You can also use npm scripts:
```bash
npm run test:foundry              # Run all tests
npm run test:foundry:verbose      # Run with -vvv
npm run test:foundry:gas          # Run with gas report
npm run test:foundry:coverage     # Run coverage
```

## Mock Contracts

### `MockUSDC`
A simple ERC20 token for testing:
- 6 decimals (like real USDC)
- Mints 1M USDC to deployer
- Used in all tests

## Key Testing Patterns

### 1. Using `vm.prank()` and `vm.startPrank()`
```solidity
vm.prank(user1);  // Next call will be from user1
registry.registerUsername("alice");

vm.startPrank(user1);  // All calls from user1
usdc.approve(...);
registry.registerUsername("alice");
vm.stopPrank();  // Stop pranking
```

### 2. Testing Reverts
```solidity
vm.expectRevert();
registry.registerUsername("taken");
```

### 3. Assertions
```solidity
assertEq(registry.usernameToAddress("alice"), user1);
assertTrue(registry.premiumUsernames("vip"));
assertEq(usdc.balanceOf(bob), expectedBalance);
```

## Dependencies

- `forge-std` - Foundry standard library (already installed in `lib/`)
- `@openzeppelin/contracts` - OpenZeppelin contracts (via npm)
- `@account-abstraction/contracts` - ERC-4337 contracts (via npm)

## Troubleshooting

### Issue: "No such file or directory" for OpenZeppelin
**Solution:** Run `npm install` in contracts directory

### Issue: Compilation errors with Ownable
**Solution:** OpenZeppelin v5 requires `Ownable(msg.sender)` in constructor
- Already fixed in `UsernameRegistry.sol`
- Already fixed in `SendCash.sol`

### Issue: Test failures
**Solution:** Check that:
1. Dependencies are installed: `npm install`
2. Remappings are correct: `forge remappings`
3. Test setup gives users USDC before registration

## Next Steps

1. **Add more test cases:**
   - Edge cases for fee calculations
   - Boundary conditions for username validation
   - Gas optimization tests

2. **Add fuzz testing:**
   ```solidity
   function testFuzzRegisterUsername(string memory username) public {
       // Fuzz testing with random inputs
   }
   ```

3. **Add invariant testing:**
   - Test that total fees collected = sum of all registrations
   - Test that username mappings are always consistent

4. **Add integration tests:**
   - Test full flow: register → send payment → update username

## Resources

- [Foundry Book](https://book.getfoundry.sh/)
- [Forge Reference](https://book.getfoundry.sh/reference/forge/forge-test)
- [Foundry Cheatcodes](https://book.getfoundry.sh/cheatcodes/)


