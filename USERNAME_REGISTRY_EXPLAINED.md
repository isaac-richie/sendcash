# UsernameRegistry.sol - Complete Walkthrough
## Senior Dev Teaching Junior Dev

---

## 🎯 **What Does This Contract Do?**

Think of this contract as a **phone book for blockchain addresses**. Instead of remembering long addresses like `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb`, users can register a friendly name like `@alice` and others can send money to `@alice` instead of the address.

**Real-world analogy**: Like how Twitter lets you have `@username` instead of a user ID number.

---

## 📚 **Part 1: Contract Structure & Inheritance**

```solidity
contract UsernameRegistry is Ownable, ReentrancyGuard {
```

### **Inheritance Explained**

**`Ownable`** (from OpenZeppelin):
- Gives the contract an `owner` (the deployer)
- Provides `onlyOwner` modifier for admin functions
- Allows transferring ownership
- **Why we need it**: Admin functions like setting fees, withdrawing funds

**`ReentrancyGuard`** (from OpenZeppelin):
- Prevents reentrancy attacks
- Uses `nonReentrant` modifier
- **Why we need it**: Security! Prevents someone from calling a function multiple times before the first call finishes

**Junior Dev Question**: "What's a reentrancy attack?"
**Senior Dev Answer**: Imagine you withdraw money, but before the transaction completes, the same function gets called again. The guard prevents this by locking the function during execution.

---

## 🗂️ **Part 2: State Variables (Storage)**

```solidity
mapping(string => address) public usernameToAddress;
mapping(address => string) public addressToUsername;
mapping(string => bool) public premiumUsernames;
uint256 public premiumFee = 5 ether;
```

### **Understanding Mappings**

**Mappings are like hash tables or dictionaries:**

1. **`usernameToAddress`**: 
   - Key: `"alice"` → Value: `0x1234...`
   - **Forward lookup**: "What address does @alice have?"
   - Example: `usernameToAddress["alice"]` returns `0x1234...`

2. **`addressToUsername`**:
   - Key: `0x1234...` → Value: `"alice"`
   - **Reverse lookup**: "What username does this address have?"
   - Example: `addressToUsername[0x1234...]` returns `"alice"`

**Why both?**
- **Forward**: When someone sends to `@alice`, we need to find the address
- **Reverse**: When you have an address, you can display the username

**`public` keyword**: Automatically creates a getter function!
- `usernameToAddress["alice"]` is the same as calling a function

3. **`premiumUsernames`**:
   - Tracks which usernames are premium (paid)
   - Premium usernames can't be changed (like buying a domain)

4. **`premiumFee`**:
   - Cost to register a premium username
   - `5 ether` = 5 ETH (or 5 of the native token)
   - Can be changed by owner

---

## 📝 **Part 3: Events**

```solidity
event UsernameRegistered(address indexed user, string username, bool isPremium);
event UsernameUpdated(address indexed user, string oldUsername, string newUsername);
event PremiumUsernameRegistered(address indexed user, string username);
```

### **Why Events Matter**

**Events are like logs that are permanently stored on blockchain:**
- **Indexed** parameters can be searched/filtered
- **Non-indexed** parameters are stored but harder to search
- **Use cases**:
  - Frontend can listen for events
  - Block explorers show events
  - Analytics and tracking

**Example**: When Alice registers, the event is emitted and anyone can see it happened.

---

## 🔐 **Part 4: Core Functions - Registration**

### **Function 1: `registerUsername()` - Free Registration**

```solidity
function registerUsername(string memory username) external nonReentrant {
```

**Breaking it down:**

1. **`external`**: Can only be called from outside the contract
2. **`nonReentrant`**: Security modifier - prevents reentrancy
3. **`string memory`**: Username is stored in memory (temporary)

**Validation Steps (Lines 42-52):**

```solidity
require(bytes(username).length > 0, "Username cannot be empty");
```
- **What**: Checks username isn't empty
- **Why**: Can't register an empty string
- **`bytes(username)`**: Converts string to bytes to check length

```solidity
require(bytes(username).length <= 32, "Username too long");
```
- **What**: Max 32 characters
- **Why**: Gas optimization + reasonable limit

```solidity
require(isValidUsername(username), "Invalid username format");
```
- **What**: Checks format (alphanumeric + underscore only)
- **Why**: Prevents special characters that could cause issues

```solidity
require(usernameToAddress[username] == address(0), "Username already taken");
```
- **What**: Checks if username is available
- **Why**: Each username must be unique
- **`address(0)`**: The zero address means "not set"

```solidity
require(bytes(addressToUsername[msg.sender]).length == 0, "Address already has username");
```
- **What**: Checks if caller already has a username
- **Why**: One address = one username (can be changed later)
- **`msg.sender`**: The address calling this function

**Storage Update (Lines 54-55):**

```solidity
usernameToAddress[username] = msg.sender;
addressToUsername[msg.sender] = username;
```
- **What**: Creates bidirectional mapping
- **Why**: Both lookups work (username→address and address→username)

**Event Emission (Line 57):**

```solidity
emit UsernameRegistered(msg.sender, username, false);
```
- **What**: Logs the registration
- **`false`**: Not a premium username

---

### **Function 2: `registerUsernameForAddress()` - Factory Pattern**

```solidity
function registerUsernameForAddress(string memory username, address walletAddress) 
```

**Why this exists:**
- When AccountFactory creates a wallet automatically, the wallet doesn't exist yet to call `registerUsername()`
- This allows the factory (or relayer) to register on behalf of the wallet
- **Same validations** as `registerUsername()` but for a specific address

**Key difference:**
- `registerUsername()`: `msg.sender` is the address
- `registerUsernameForAddress()`: You specify which address to link

---

### **Function 3: `registerPremiumUsername()` - Paid Registration**

```solidity
function registerPremiumUsername(string memory username) external payable nonReentrant {
```

**`payable` keyword**: Function can receive ETH/tokens

**Additional validation:**
```solidity
require(msg.value >= premiumFee, "Insufficient fee for premium username");
```
- **`msg.value`**: Amount of ETH sent with the transaction
- Must be at least `premiumFee` (5 ether)

**What happens to the fee?**
- Stays in the contract
- Owner can withdraw with `withdrawFees()`

**Premium benefit:**
```solidity
premiumUsernames[username] = true;
```
- Premium usernames can't be changed (see `updateUsername()`)

---

## 🔄 **Part 5: Update Function**

### **`updateUsername()` - Change Your Username**

```solidity
function updateUsername(string memory newUsername) external nonReentrant {
```

**Step-by-step logic:**

1. **Get current username:**
   ```solidity
   string memory oldUsername = addressToUsername[msg.sender];
   ```
   - Looks up what username the caller currently has

2. **Check user has a username:**
   ```solidity
   require(bytes(oldUsername).length > 0, "No username to update");
   ```

3. **Premium usernames can't be changed:**
   ```solidity
   require(!premiumUsernames[oldUsername], "Cannot update premium username");
   ```
   - **Why**: Premium = permanent (like buying a domain)

4. **Validate new username** (same checks as registration)

5. **Update mappings:**
   ```solidity
   usernameToAddress[oldUsername] = address(0);  // Clear old
   usernameToAddress[newUsername] = msg.sender;   // Set new
   addressToUsername[msg.sender] = newUsername;   // Update reverse
   ```

**Important**: Old username becomes available for others!

---

## 🔍 **Part 6: View Functions (Read-Only)**

### **`getAddress()` - Lookup Address by Username**

```solidity
function getAddress(string memory username) external view returns (address) {
    return usernameToAddress[username];
}
```

- **`view`**: Doesn't modify state (read-only)
- **Free**: No gas cost (when called externally, not in a transaction)
- **Use case**: "What address is @alice?"

### **`getUsername()` - Lookup Username by Address**

```solidity
function getUsername(address userAddress) external view returns (string memory) {
    return addressToUsername[userAddress];
}
```

- **Use case**: "What username does this address have?"

### **`isUsernameAvailable()` - Check Availability**

```solidity
function isUsernameAvailable(string memory username) external view returns (bool) {
    return usernameToAddress[username] == address(0);
}
```

- **Returns `true`** if username is free
- **Returns `false`** if username is taken
- **Use case**: Check before trying to register

---

## ✅ **Part 7: Validation Function**

### **`isValidUsername()` - Format Checker**

```solidity
function isValidUsername(string memory username) public pure returns (bool) {
    bytes memory b = bytes(username);
    if (b.length == 0) return false;

    for (uint i = 0; i < b.length; i++) {
        bytes1 char = b[i];
        if (
            !(char >= 0x30 && char <= 0x39) && // 0-9
            !(char >= 0x41 && char <= 0x5A) && // A-Z
            !(char >= 0x61 && char <= 0x7A) && // a-z
            char != 0x5F                       // _
        ) {
            return false;
        }
    }
    return true;
}
```

**Breaking it down:**

1. **`pure`**: Doesn't read or write state (just computation)
2. **Converts string to bytes**: Easier to check individual characters
3. **Character validation**:
   - `0x30-0x39`: ASCII for `0-9`
   - `0x41-0x5A`: ASCII for `A-Z`
   - `0x61-0x7A`: ASCII for `a-z`
   - `0x5F`: ASCII for `_`

**Allowed**: `alice`, `alice123`, `alice_bob`
**Not allowed**: `alice@`, `alice!`, `alice bob` (space)

**Why these rules?**
- Prevents special characters that could cause issues
- Keeps usernames simple and safe
- Similar to Twitter/Instagram username rules

---

## 👑 **Part 8: Admin Functions**

### **`setPremiumFee()` - Change Premium Price**

```solidity
function setPremiumFee(uint256 newFee) external onlyOwner {
    premiumFee = newFee;
}
```

- **`onlyOwner`**: Only contract owner can call
- **Use case**: Adjust pricing based on demand

### **`withdrawFees()` - Collect Premium Fees**

```solidity
function withdrawFees() external onlyOwner {
    payable(owner()).transfer(address(this).balance);
}
```

- **`address(this).balance`**: Contract's ETH balance
- **`payable(owner())`**: Makes owner address payable (can receive ETH)
- **`transfer()`**: Sends ETH to owner
- **Use case**: Withdraw collected premium fees

---

## 🎓 **Key Concepts for Junior Devs**

### **1. Bidirectional Mapping Pattern**

**Why we need both mappings:**
```
usernameToAddress["alice"] → 0x1234...  (Forward: username → address)
addressToUsername[0x1234...] → "alice"  (Reverse: address → username)
```

**Trade-off**: Uses more storage but enables fast lookups in both directions.

### **2. Validation Pattern**

**Always validate:**
1. Input format
2. Business rules (unique, available)
3. State (user already has username?)

**Fail fast**: `require()` statements stop execution immediately if condition fails.

### **3. Event-Driven Architecture**

**Events enable:**
- Frontend to react to changes
- Analytics and tracking
- Off-chain indexing

### **4. Gas Optimization**

**Why 32 character limit?**
- Longer strings = more gas
- 32 is reasonable for usernames
- Balance between usability and cost

### **5. Security Patterns**

**`nonReentrant`**: Prevents reentrancy attacks
**`onlyOwner`**: Restricts admin functions
**Input validation**: Prevents invalid data

---

## 🚨 **Common Pitfalls to Avoid**

1. **Forgetting to check both mappings**: Always update both `usernameToAddress` and `addressToUsername`

2. **Not clearing old mappings**: When updating username, must clear old mapping

3. **Case sensitivity**: `"Alice"` and `"alice"` are different! (Consider lowercasing)

4. **Premium username logic**: Can't update premium usernames - important for business logic

5. **Zero address checks**: Always validate addresses aren't `address(0)`

---

## 💡 **Questions to Test Understanding**

1. **Q**: Why do we need `ReentrancyGuard`?
   **A**: Prevents reentrancy attacks where a function calls itself before finishing.

2. **Q**: What happens if someone tries to register a username with special characters?
   **A**: `isValidUsername()` returns false, transaction reverts with "Invalid username format".

3. **Q**: Can someone have two usernames?
   **A**: No, one address = one username (but can be changed).

4. **Q**: What's the difference between `registerUsername()` and `registerPremiumUsername()`?
   **A**: Premium costs money and can't be changed. Regular is free but can be updated.

5. **Q**: Why emit events?
   **A**: Events are logged on blockchain and can be listened to by frontends/analytics.

---

## 🎯 **Summary**

This contract is a **registry/mapping system** that:
- ✅ Maps usernames ↔ addresses (bidirectional)
- ✅ Validates username format
- ✅ Supports premium (paid) usernames
- ✅ Allows username updates (except premium)
- ✅ Provides read-only lookup functions
- ✅ Includes admin functions for fee management

**Think of it as**: A blockchain phone book with premium listings!

---

## 🔗 **Next Steps**

1. Understand how `SendCash.sol` uses this registry
2. Learn how `AccountFactory` integrates with it
3. See how the bot queries this contract
4. Practice: Write a test that registers a username and looks it up


