# SendCash Contracts Explained - Junior Dev Guide

## 📚 Table of Contents
1. [Contract 1: UsernameRegistry](#contract-1-usernameregistry)
2. [Contract 2: SendCash](#contract-2-sendcash)
3. [How They Work Together](#how-they-work-together)
4. [Key Solidity Concepts](#key-solidity-concepts)

---

# Contract 1: UsernameRegistry

## 🎯 What Does It Do?

Think of `UsernameRegistry` like a **phone book** or **address book**:
- Maps usernames (like `@alice`) to wallet addresses (like `0x1234...`)
- Allows reverse lookup (find username from address)
- Handles registration fees (1 USDC regular, 10 USDC premium)

## 📦 The Data Storage (State Variables)

```solidity
// Like a dictionary: username → address
mapping(string => address) public usernameToAddress;

// Reverse dictionary: address → username
mapping(address => string) public addressToUsername;

// Premium usernames (can't be changed)
mapping(string => bool) public premiumUsernames;
```

**Think of mappings like JavaScript objects:**
```javascript
// In JavaScript:
const usernameToAddress = {
  "alice": "0x1234...",
  "bob": "0x5678..."
}

// In Solidity:
mapping(string => address) usernameToAddress;
// Same concept, but stored on blockchain!
```

## 🔧 Key Functions Breakdown

### 1. `registerUsername()` - Register a Regular Username

```solidity
function registerUsername(string memory username) external nonReentrant {
    // Step 1: Validate username
    require(bytes(username).length > 0, "Username cannot be empty");
    require(bytes(username).length <= 32, "Username too long");
    require(isValidUsername(username), "Invalid username format");
    
    // Step 2: Check if username is available
    require(
        usernameToAddress[username] == address(0),
        "Username already taken"
    );
    
    // Step 3: Check if user already has a username
    require(
        bytes(addressToUsername[msg.sender]).length == 0,
        "Address already has username"
    );

    // Step 4: Collect fee (1 USDC)
    usdcToken.safeTransferFrom(msg.sender, address(this), registrationFee);

    // Step 5: Store the mapping
    usernameToAddress[username] = msg.sender;
    addressToUsername[msg.sender] = username;

    // Step 6: Emit event (for off-chain tracking)
    emit UsernameRegistered(msg.sender, username, false);
}
```

**Step-by-step explanation:**

1. **Validation**: Check username is valid (not empty, not too long, valid characters)
2. **Availability Check**: `usernameToAddress[username] == address(0)` means "is this username free?"
   - `address(0)` = `0x0000...` = empty/unused
3. **User Check**: Make sure the caller doesn't already have a username
4. **Fee Payment**: Transfer 1 USDC from user to contract
5. **Store Data**: Save both mappings (username→address and address→username)
6. **Event**: Emit event so frontend/backend can track it

**Real-world example:**
```
User: "I want @alice"
Contract: "Is @alice taken?" → No
Contract: "Do you have a username?" → No
Contract: "Pay 1 USDC" → ✅ Paid
Contract: "Saved! @alice → 0x1234..."
```

### 2. `registerUsernameForAddress()` - For Smart Wallets

This is similar, but allows someone else (like a relayer) to pay the fee:

```solidity
function registerUsernameForAddress(
    string memory username,
    address walletAddress,
    address feePayer  // ← Who pays the fee
) external nonReentrant {
    // Same validations...
    
    // Fee payer can be different from wallet owner
    usdcToken.safeTransferFrom(feePayer, address(this), registrationFee);
    
    // Link username to wallet address
    usernameToAddress[username] = walletAddress;
    addressToUsername[walletAddress] = username;
}
```

**Why this exists:**
- When Thirdweb creates a wallet, the wallet might not have USDC yet
- Relayer can pay the fee on behalf of the user (gasless registration!)

### 3. `registerPremiumUsername()` - Premium Registration

```solidity
function registerPremiumUsername(string memory username) external nonReentrant {
    // Same validations...
    
    // Higher fee (10 USDC instead of 1)
    usdcToken.safeTransferFrom(msg.sender, address(this), premiumFee);
    
    // Mark as premium
    premiumUsernames[username] = true;
    
    // Store mapping
    usernameToAddress[username] = msg.sender;
    addressToUsername[msg.sender] = username;
}
```

**Key difference:**
- Costs 10 USDC instead of 1
- `premiumUsernames[username] = true` marks it as premium
- Premium usernames **cannot be changed** (see `updateUsername()`)

### 4. `updateUsername()` - Change Your Username

```solidity
function updateUsername(string memory newUsername) external nonReentrant {
    // Get current username
    string memory oldUsername = addressToUsername[msg.sender];
    
    // Can't update if you don't have one
    require(bytes(oldUsername).length > 0, "No username to update");
    
    // Premium usernames are permanent!
    require(
        !premiumUsernames[oldUsername],
        "Cannot update premium username"
    );
    
    // Validate new username...
    
    // Clear old mapping
    usernameToAddress[oldUsername] = address(0);  // ← Frees up old username
    
    // Set new mapping
    usernameToAddress[newUsername] = msg.sender;
    addressToUsername[msg.sender] = newUsername;
}
```

**Important points:**
- Old username becomes available for others
- Premium usernames are locked (can't change)
- No fee to update (only initial registration costs)

### 5. `isValidUsername()` - Username Validation

```solidity
function isValidUsername(string memory username) public pure returns (bool) {
    bytes memory b = bytes(username);
    if (b.length == 0) return false;

    for (uint i = 0; i < b.length; i++) {
        bytes1 char = b[i];
        // Check if character is: 0-9, A-Z, a-z, or _
        if (
            !(char >= 0x30 && char <= 0x39) && // 0-9
            !(char >= 0x41 && char <= 0x5A) && // A-Z
            !(char >= 0x61 && char <= 0x7A) && // a-z
            char != 0x5F  // _
        ) {
            return false;  // Invalid character found
        }
    }
    return true;  // All characters are valid
}
```

**What this does:**
- Only allows: letters (a-z, A-Z), numbers (0-9), and underscore (_)
- Rejects: spaces, special characters, emojis, etc.

**Examples:**
- ✅ `alice` - Valid
- ✅ `alice_123` - Valid
- ❌ `alice-123` - Invalid (has dash)
- ❌ `alice 123` - Invalid (has space)

### 6. Owner Functions (Admin Only)

```solidity
// Change fees
function setRegistrationFee(uint256 newFee) external onlyOwner { ... }
function setPremiumFee(uint256 newFee) external onlyOwner { ... }

// Withdraw collected fees
function withdrawFees() external onlyOwner {
    uint256 balance = usdcToken.balanceOf(address(this));
    usdcToken.safeTransfer(owner(), balance);
}
```

**What `onlyOwner` means:**
- Only the contract deployer can call these
- Regular users cannot change fees or withdraw

---

# Contract 2: SendCash

## 🎯 What Does It Do?

`SendCash` is the **payment processor**:
- Handles sending money between users
- Calculates fees (0.5% on all payments)
- Uses `UsernameRegistry` to resolve usernames to addresses

## 📦 The Data Storage

```solidity
// Reference to UsernameRegistry
UsernameRegistry public usernameRegistry;

// Which tokens are supported (USDC, USDT, etc.)
mapping(address => bool) public supportedTokens;

    // Fee configuration
    uint256 public constant FEE_PERCENTAGE = 50;           // 0.5% = 50 basis points
    uint256 public constant BASIS_POINTS = 10000;           // For percentage math
```

**Constants explained:**
- `FEE_PERCENTAGE`: 50 = 0.5% (50 out of 10,000 basis points)
- `BASIS_POINTS`: 10,000 = 100% (for percentage calculations)
- **Note**: Fee applies to ALL payments (no minimum threshold)

**Basis points math:**
```
0.5% = 50 / 10,000 = 50 basis points
1% = 100 / 10,000 = 100 basis points
```

## 🔧 Key Functions Breakdown

### 1. `sendPayment()` - The Main Payment Function

```solidity
function sendPayment(
    string memory toUsername,  // Who to send to (@alice)
    address token,              // Which token (USDC address)
    uint256 amount             // How much (in token decimals)
) external nonReentrant {
    // Step 1: Validate token is supported
    require(supportedTokens[token], "Token not supported");
    require(amount > 0, "Amount must be greater than 0");

    // Step 2: Resolve username to address
    address to = usernameRegistry.getAddress(toUsername);
    require(to != address(0), "Username not found");
    require(to != msg.sender, "Cannot send to yourself");

    // Step 3: Calculate fee (0.5% of all payments)
    uint256 fee = (amount * FEE_PERCENTAGE) / BASIS_POINTS;
    uint256 amountAfterFee = amount - fee;

    // Step 4: Get usernames for event
    string memory fromUsername = usernameRegistry.getUsername(msg.sender);
    string memory toUsernameCopy = toUsername;

    // Step 5: Transfer tokens
    // Take money from sender
    IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
    // Give money to recipient (after fee)
    IERC20(token).safeTransfer(to, amountAfterFee);
    // Give fee to contract owner (0.5% of all payments)
    IERC20(token).safeTransfer(owner(), fee);

    // Step 6: Emit event
    emit PaymentSent(msg.sender, to, token, amount, fee, fromUsername, toUsernameCopy);
}
```

**Step-by-step walkthrough:**

**Example: Alice sends $100 USDC to Bob**

1. **Validation:**
   ```
   Token: USDC → ✅ Supported
   Amount: $100 → ✅ > 0
   ```

2. **Resolve Username:**
   ```
   @bob → usernameRegistry.getAddress("bob")
   → Returns: 0x5678... (Bob's wallet)
   ```

3. **Calculate Fee:**
   ```
   Amount: $100 = 100 * 10^6 = 100,000,000 (USDC has 6 decimals)
   
   Fee = (100,000,000 * 50) / 10,000
       = 5,000,000
       = $0.50 USDC (0.5% of $100)
   
   Amount after fee = 100,000,000 - 5,000,000
                    = 99,500,000
                    = $99.50 USDC
   ```

4. **Token Transfers:**
   ```
   Step 1: Alice → Contract: $100 USDC
   Step 2: Contract → Bob: $99.50 USDC
   Step 3: Contract → Owner: $0.50 USDC (fee)
   ```

5. **Event Emitted:**
   ```
   PaymentSent(
     from: 0x1234... (Alice),
     to: 0x5678... (Bob),
     token: USDC address,
     amount: 100,000,000,
     fee: 500,000,  // $0.50 (0.5% of $100)
     fromUsername: "alice",
     toUsername: "bob"
   )
   ```

**Visual Flow:**
```
Alice: "Send $100 to @bob"
  ↓
Contract: "Resolve @bob → 0x5678..."
  ↓
Contract: "Calculate fee: $0.50 (0.5% of $100)"
  ↓
Contract: "Transfer $100 from Alice"
  ↓
Contract: "Transfer $99.50 to Bob"
  ↓
Contract: "Transfer $0.50 to owner (fee)"
  ↓
Done! ✅
```

### 2. `calculateFee()` - Fee Calculator

```solidity
function calculateFee(uint256 amount) external pure returns (uint256) {
    return (amount * FEE_PERCENTAGE) / BASIS_POINTS;
}
```

**This is a helper function:**
- Can be called without sending a transaction (view function)
- Useful for frontend to show fees before sending
- `pure` means it doesn't read or modify state
- Always returns 0.5% of the amount (no threshold)

**Examples:**
```solidity
calculateFee(1 * 10**6)    // $1 → Returns 5,000 ($0.005)
calculateFee(10 * 10**6)   // $10 → Returns 50,000 ($0.05)
calculateFee(100 * 10**6)  // $100 → Returns 500,000 ($0.50)
calculateFee(1000 * 10**6) // $1,000 → Returns 5,000,000 ($5.00)
```

### 3. Token Management (Owner Only)

```solidity
// Add a new token (like USDT)
function addSupportedToken(address token) external onlyOwner {
    require(token != address(0), "Invalid token address");
    supportedTokens[token] = true;
    emit TokenAdded(token);
}

// Remove a token
function removeSupportedToken(address token) external onlyOwner {
    supportedTokens[token] = false;
    emit TokenRemoved(token);
}
```

**Why this exists:**
- Initially, only USDC might be supported
- Owner can add USDT, DAI, etc. later
- Can remove tokens if needed (security, delisting, etc.)

---

# How They Work Together

## 🔗 The Connection

```solidity
// In SendCash constructor:
constructor(address _usernameRegistry) {
    usernameRegistry = UsernameRegistry(_usernameRegistry);
}
```

**SendCash stores a reference to UsernameRegistry**, so it can:
- Look up usernames → addresses
- Look up addresses → usernames

## 📊 Complete Payment Flow

```
1. User registers: /register @alice
   ↓
   UsernameRegistry.registerUsername("alice")
   - Pays 1 USDC fee
   - Stores: @alice → 0x1234...

2. User sends payment: /send @bob $100
   ↓
   SendCash.sendPayment("bob", USDC_ADDRESS, 100 * 10^6)
   ↓
   Step 1: usernameRegistry.getAddress("bob")
           → Returns: 0x5678... (Bob's address)
   ↓
   Step 2: Calculate fee: $0.50 (0.5% of $100)
   ↓
   Step 3: Transfer $100 from Alice
   ↓
   Step 4: Transfer $99.50 to Bob
   ↓
   Step 5: Transfer $0.50 to owner (fee)
   ↓
   Done! ✅
```

## 🎯 Real-World Analogy

**UsernameRegistry** = Phone Book
- Maps names to phone numbers
- You can look up "John Smith" → get phone number
- You can look up phone number → get "John Smith"

**SendCash** = Payment App (like Venmo)
- Uses phone book to find recipient
- Processes the payment
- Takes a 0.5% fee on all transactions

---

# Key Solidity Concepts

## 1. Mappings

```solidity
mapping(string => address) usernameToAddress;
```

**Like a JavaScript object, but:**
- Keys must be same type (all strings)
- Values must be same type (all addresses)
- Can't iterate over all keys (no `for...in`)
- Default value is `0` or empty

## 2. Events

```solidity
event UsernameRegistered(address indexed user, string username, bool isPremium);
emit UsernameRegistered(msg.sender, username, false);
```

**Events are like logs:**
- Stored on blockchain (permanent)
- Can be filtered by `indexed` parameters
- Frontend/backend can listen to them
- Useful for tracking what happened

## 3. Modifiers

```solidity
modifier onlyOwner() {
    require(msg.sender == owner(), "Not owner");
    _;  // ← Runs the function here
}

function withdrawFees() external onlyOwner { ... }
```

**Modifiers are like middleware:**
- `onlyOwner` checks if caller is owner
- `nonReentrant` prevents re-entrancy attacks
- `_` means "run the function body here"

## 4. SafeERC20

```solidity
using SafeERC20 for IERC20;
usdcToken.safeTransferFrom(msg.sender, address(this), amount);
```

**Why SafeERC20?**
- Some tokens don't return `true` on success
- `safeTransferFrom` handles all token types
- Prevents silent failures

## 5. require() vs if

```solidity
// require() - Reverts transaction if false
require(amount > 0, "Amount must be greater than 0");

// if - Continues execution
fee = (amount * FEE_PERCENTAGE) / BASIS_POINTS;  // Always calculate fee
```

**Key difference:**
- `require()` = "This MUST be true, or cancel everything"
- `if` = "If this is true, do something, otherwise continue"
- In our case, fee is always calculated (no conditional needed)

## 6. msg.sender

```solidity
usernameToAddress[username] = msg.sender;
```

**`msg.sender` = Who called the function:**
- If Alice calls `registerUsername()`, `msg.sender` = Alice's address
- If Bob calls it, `msg.sender` = Bob's address
- Always the address that initiated the transaction

## 7. address(0)

```solidity
require(usernameToAddress[username] == address(0), "Username taken");
```

**`address(0)` = Empty/Null address:**
- `0x0000000000000000000000000000000000000000`
- Used to check if something is unset/empty
- Like `null` in JavaScript or `None` in Python

---

# 🎓 Practice Questions

1. **What happens if Alice tries to register `@alice` twice?**
   - Answer: Second call fails because `usernameToAddress["alice"]` is no longer `address(0)`

2. **If Bob sends $30 to Alice, what's the fee?**
   - Answer: $0.15 (0.5% of $30 = $0.15)

3. **If Bob sends $200 to Alice, what's the fee?**
   - Answer: $1.00 (0.5% of $200 = $1.00)

4. **Can a premium username be changed?**
   - Answer: No, `updateUsername()` checks `!premiumUsernames[oldUsername]`

5. **Who can add new tokens to SendCash?**
   - Answer: Only the owner (uses `onlyOwner` modifier)

---

# 🚀 Next Steps

1. **Read the code** - Go through each function line by line
2. **Trace a transaction** - Follow a payment from start to finish
3. **Try modifying** - Add a new feature (like minimum payment amount)
4. **Test it** - Write unit tests for each function
5. **Deploy it** - Deploy to testnet and try it out!

---

# 📝 Summary

**UsernameRegistry:**
- Phone book for usernames ↔ addresses
- Handles registration with fees
- Validates usernames
- Manages premium usernames

**SendCash:**
- Payment processor
- Uses UsernameRegistry to resolve usernames
- Calculates and collects fees
- Manages supported tokens

**Together:**
- Users register usernames in UsernameRegistry
- Users send payments via SendCash
- SendCash looks up recipients using UsernameRegistry
- Simple, secure, on-chain!

