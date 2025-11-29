// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title UsernameRegistryV2
 * @dev Upgraded username registry for SendCash with:
 *      - Case‑insensitive usernames (normalized to lowercase on‑chain)
 *      - Configurable registration and premium fees
 *      - Support for factory‑created wallets (fee payer separation)
 *      - Optional username transfer
 *      - Fee withdrawal by owner
 */
contract UsernameRegistryV2 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // USDC token address (6 decimals) - immutable since set in constructor
    IERC20 public immutable usdcToken;

    // Mapping from normalized (lowercase) username to address
    mapping(string => address) public usernameToAddress;

    // Mapping from address to username (stored normalized)
    mapping(address => string) public addressToUsername;

    // Premium usernames (custom handles)
    mapping(string => bool) public premiumUsernames;

    // Registration fee for regular usernames (0 for test phase)
    uint256 public registrationFee; // 0 USDC = free (test phase)

    // Registration fee for premium usernames (0 for test phase)
    uint256 public premiumFee; // 0 USDC = free (test phase)

    // Events
    event UsernameRegistered(address indexed user, string username, bool isPremium);
    event UsernameUpdated(address indexed user, string oldUsername, string newUsername);
    event UsernameTransferred(address indexed from, address indexed to, string username);
    event PremiumUsernameRegistered(address indexed user, string username);
    event RegistrationFeeUpdated(uint256 oldFee, uint256 newFee);
    event PremiumFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeesWithdrawn(address indexed to, uint256 amount);

    constructor(address _usdcToken) Ownable(msg.sender) {
        require(_usdcToken != address(0), "Invalid USDC address");
        usdcToken = IERC20(_usdcToken);
        registrationFee = 0;
        premiumFee = 0;
    }

    // ========= Internal Helpers =========

    /**
     * @dev Normalize username to lowercase for case‑insensitive mapping.
     */
    function _normalize(string memory username) internal pure returns (string memory) {
        bytes memory b = bytes(username);
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 char = b[i];
            if (char >= 0x41 && char <= 0x5A) {
                // A-Z -> a-z
                b[i] = bytes1(uint8(char) + 32);
            }
        }
        return string(b);
    }

    function _validateNewUsername(string memory username) internal view {
        require(bytes(username).length > 0, "Username cannot be empty");
        require(bytes(username).length <= 32, "Username too long");
        require(isValidUsername(username), "Invalid username format");
        string memory normalized = _normalize(username);
        require(usernameToAddress[normalized] == address(0), "Username already taken");
    }

    // ========= Public API =========

    /**
     * @dev Register a username (regular).
     *      If registrationFee > 0, collects fee in USDC.
     */
    function registerUsername(string memory username) external nonReentrant {
        _validateNewUsername(username);

        string memory normalized = _normalize(username);
        require(bytes(addressToUsername[msg.sender]).length == 0, "Address already has username");

        // Collect registration fee (if any)
        if (registrationFee > 0) {
            usdcToken.safeTransferFrom(msg.sender, address(this), registrationFee);
        }

        usernameToAddress[normalized] = msg.sender;
        addressToUsername[msg.sender] = normalized;

        emit UsernameRegistered(msg.sender, normalized, false);
    }

    /**
     * @dev Register username for a specific address (for factory‑created wallets).
     *      feePayer can be the wallet itself or a relayer.
     */
    function registerUsernameForAddress(
        string memory username,
        address walletAddress,
        address feePayer
    ) external nonReentrant {
        _validateNewUsername(username);
        require(walletAddress != address(0), "Invalid wallet address");
        require(bytes(addressToUsername[walletAddress]).length == 0, "Address already has username");

        string memory normalized = _normalize(username);

        // Collect registration fee from feePayer (if any)
        if (registrationFee > 0) {
            require(feePayer != address(0), "Invalid fee payer");
            usdcToken.safeTransferFrom(feePayer, address(this), registrationFee);
        }

        usernameToAddress[normalized] = walletAddress;
        addressToUsername[walletAddress] = normalized;

        emit UsernameRegistered(walletAddress, normalized, false);
    }

    /**
     * @dev Register a premium username (custom handle).
     */
    function registerPremiumUsername(string memory username) external nonReentrant {
        _validateNewUsername(username);
        require(bytes(addressToUsername[msg.sender]).length == 0, "Address already has username");

        string memory normalized = _normalize(username);

        // Collect premium fee (if any)
        if (premiumFee > 0) {
            usdcToken.safeTransferFrom(msg.sender, address(this), premiumFee);
        }

        usernameToAddress[normalized] = msg.sender;
        addressToUsername[msg.sender] = normalized;
        premiumUsernames[normalized] = true;

        emit PremiumUsernameRegistered(msg.sender, normalized);
        emit UsernameRegistered(msg.sender, normalized, true);
    }

    /**
     * @dev Update username (only if current username is not premium).
     */
    function updateUsername(string memory newUsername) external nonReentrant {
        string memory oldUsername = addressToUsername[msg.sender];
        require(bytes(oldUsername).length > 0, "No username to update");
        require(!premiumUsernames[oldUsername], "Cannot update premium username");

        _validateNewUsername(newUsername);
        string memory normalizedNew = _normalize(newUsername);

        // Clear old mapping
        usernameToAddress[oldUsername] = address(0);

        // Set new mapping
        usernameToAddress[normalizedNew] = msg.sender;
        addressToUsername[msg.sender] = normalizedNew;

        emit UsernameUpdated(msg.sender, oldUsername, normalizedNew);
    }

    /**
     * @dev Transfer username to another address.
     *      Useful for selling/transferring handles.
     */
    function transferUsername(address to) external nonReentrant {
        require(to != address(0), "Invalid recipient");
        require(bytes(addressToUsername[to]).length == 0, "Recipient already has username");

        string memory username = addressToUsername[msg.sender];
        require(bytes(username).length > 0, "No username to transfer");

        // Clear old owner
        addressToUsername[msg.sender] = "";
        usernameToAddress[username] = to;

        // Assign to new owner
        addressToUsername[to] = username;

        emit UsernameTransferred(msg.sender, to, username);
    }

    /**
     * @dev Get address for a username (username is normalized to lowercase).
     *      Returns address(0) if username doesn't exist.
     *      ✅ FIX: Explicitly ensure we never return the contract's own address,
     *      which would indicate a bug. Always return address(0) for non-existent usernames.
     */
    function getAddress(string memory username) external view returns (address) {
        string memory normalized = _normalize(username);
        address result = usernameToAddress[normalized];
        
        // ✅ SAFEGUARD: Never return the contract's own address (indicates a bug)
        // If mapping somehow returns this contract's address, treat it as non-existent
        if (result == address(this)) {
            return address(0);
        }
        
        return result;
    }

    /**
     * @dev Get username for an address (already stored normalized).
     */
    function getUsername(address userAddress) external view returns (string memory) {
        return addressToUsername[userAddress];
    }

    /**
     * @dev Check if username is valid (alphanumeric and underscores only).
     */
    function isValidUsername(string memory username) public pure returns (bool) {
        bytes memory b = bytes(username);
        if (b.length == 0) return false;

        for (uint256 i = 0; i < b.length; i++) {
            bytes1 char = b[i];
            if (
                !(char >= 0x30 && char <= 0x39) && // 0-9
                !(char >= 0x41 && char <= 0x5A) && // A-Z
                !(char >= 0x61 && char <= 0x7A) && // a-z
                char != 0x5F // _
            ) {
                return false;
            }
        }
        return true;
    }

    /**
     * @dev Check if username is available (case‑insensitive).
     */
    function isUsernameAvailable(string memory username) external view returns (bool) {
        string memory normalized = _normalize(username);
        return usernameToAddress[normalized] == address(0);
    }

    // ========= Fees & Admin =========

    function setRegistrationFee(uint256 newFee) external onlyOwner {
        uint256 oldFee = registrationFee;
        registrationFee = newFee;
        emit RegistrationFeeUpdated(oldFee, newFee);
    }

    function setPremiumFee(uint256 newFee) external onlyOwner {
        uint256 oldFee = premiumFee;
        premiumFee = newFee;
        emit PremiumFeeUpdated(oldFee, newFee);
    }

    /**
     * @dev Withdraw collected USDC fees (owner only).
     */
    function withdrawFees(address to) external onlyOwner {
        if (to == address(0)) {
            to = owner();
        }
        uint256 balance = usdcToken.balanceOf(address(this));
        require(balance > 0, "No fees to withdraw");
        usdcToken.safeTransfer(to, balance);
        emit FeesWithdrawn(to, balance);
    }

    /**
     * @dev Get current USDC fee balance.
     */
    function getFeeBalance() external view returns (uint256) {
        return usdcToken.balanceOf(address(this));
    }
}



