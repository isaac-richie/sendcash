// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title UsernameRegistry
 * @dev Maps usernames to wallet addresses for SendCash payments
 */
contract UsernameRegistry is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // USDC token address (6 decimals) - immutable since set in constructor
    IERC20 public immutable usdcToken;

    // Mapping from username to address
    mapping(string => address) public usernameToAddress;

    // Mapping from address to username (reverse lookup)
    mapping(address => string) public addressToUsername;

    // Premium usernames (custom handles)
    mapping(string => bool) public premiumUsernames;

    // Registration fee for regular usernames (0 for test phase)
    uint256 public registrationFee = 0; // 0 USDC (test phase - no fees)

    // Registration fee for premium usernames (0 for test phase)
    uint256 public premiumFee = 0; // 0 USDC (test phase - no fees)

    // Events
    event UsernameRegistered(
        address indexed user,
        string username,
        bool isPremium
    );
    event UsernameUpdated(
        address indexed user,
        string oldUsername,
        string newUsername
    );
    event PremiumUsernameRegistered(address indexed user, string username);
    event RegistrationFeeUpdated(uint256 oldFee, uint256 newFee);
    event PremiumFeeUpdated(uint256 oldFee, uint256 newFee);

    constructor(address _usdcToken) Ownable(msg.sender) {
        require(_usdcToken != address(0), "Invalid USDC address");
        usdcToken = IERC20(_usdcToken);
    }

    /**
     * @dev Register a username (requires 1 USDC fee)
     * @param username The username to register (must be unique and valid)
     */
    function registerUsername(string memory username) external nonReentrant {
        require(bytes(username).length > 0, "Username cannot be empty");
        require(bytes(username).length <= 32, "Username too long");
        require(isValidUsername(username), "Invalid username format");
        require(
            usernameToAddress[username] == address(0),
            "Username already taken"
        );
        require(
            bytes(addressToUsername[msg.sender]).length == 0,
            "Address already has username"
        );

        // Collect registration fee (only if fee > 0)
        if (registrationFee > 0) {
            usdcToken.safeTransferFrom(
                msg.sender,
                address(this),
                registrationFee
            );
        }

        usernameToAddress[username] = msg.sender;
        addressToUsername[msg.sender] = username;

        emit UsernameRegistered(msg.sender, username, false);
    }

    /**
     * @dev Register username for a specific address (for factory-created wallets)
     * @param username The username to register
     * @param walletAddress The wallet address to link
     * @param feePayer Address that pays the registration fee (can be walletAddress or relayer)
     */
    function registerUsernameForAddress(
        string memory username,
        address walletAddress,
        address feePayer
    ) external nonReentrant {
        require(bytes(username).length > 0, "Username cannot be empty");
        require(bytes(username).length <= 32, "Username too long");
        require(isValidUsername(username), "Invalid username format");
        require(
            usernameToAddress[username] == address(0),
            "Username already taken"
        );
        require(
            bytes(addressToUsername[walletAddress]).length == 0,
            "Address already has username"
        );
        require(walletAddress != address(0), "Invalid wallet address");
        // feePayer only required if fee > 0
        if (registrationFee > 0) {
            require(feePayer != address(0), "Invalid fee payer");
            // Collect registration fee from feePayer
            usdcToken.safeTransferFrom(
                feePayer,
                address(this),
                registrationFee
            );
        }

        usernameToAddress[username] = walletAddress;
        addressToUsername[walletAddress] = username;

        emit UsernameRegistered(walletAddress, username, false);
    }

    /**
     * @dev Register a premium username (custom handle) - requires 10 USDC
     * @param username The premium username to register
     */
    function registerPremiumUsername(
        string memory username
    ) external nonReentrant {
        require(bytes(username).length > 0, "Username cannot be empty");
        require(bytes(username).length <= 32, "Username too long");
        require(isValidUsername(username), "Invalid username format");
        require(
            usernameToAddress[username] == address(0),
            "Username already taken"
        );
        require(
            bytes(addressToUsername[msg.sender]).length == 0,
            "Address already has username"
        );

        // Collect premium fee (only if fee > 0)
        if (premiumFee > 0) {
            usdcToken.safeTransferFrom(msg.sender, address(this), premiumFee);
        }

        usernameToAddress[username] = msg.sender;
        addressToUsername[msg.sender] = username;
        premiumUsernames[username] = true;

        emit PremiumUsernameRegistered(msg.sender, username);
        emit UsernameRegistered(msg.sender, username, true);
    }

    /**
     * @dev Update username (only if current username is not premium)
     * @param newUsername The new username
     */
    function updateUsername(string memory newUsername) external nonReentrant {
        string memory oldUsername = addressToUsername[msg.sender];
        require(bytes(oldUsername).length > 0, "No username to update");
        require(
            !premiumUsernames[oldUsername],
            "Cannot update premium username"
        );
        require(bytes(newUsername).length > 0, "Username cannot be empty");
        require(bytes(newUsername).length <= 32, "Username too long");
        require(isValidUsername(newUsername), "Invalid username format");
        require(
            usernameToAddress[newUsername] == address(0),
            "Username already taken"
        );

        // Clear old mapping
        usernameToAddress[oldUsername] = address(0);

        // Set new mapping
        usernameToAddress[newUsername] = msg.sender;
        addressToUsername[msg.sender] = newUsername;

        emit UsernameUpdated(msg.sender, oldUsername, newUsername);
    }

    /**
     * @dev Get address for a username
     * @param username The username to lookup
     * @return The address associated with the username
     *         Returns address(0) if username doesn't exist.
     *         ✅ FIX: Explicitly ensure we never return the contract's own address,
     *         which would indicate a bug. Always return address(0) for non-existent usernames.
     */
    function getAddress(
        string memory username
    ) external view returns (address) {
        address result = usernameToAddress[username];

        // ✅ SAFEGUARD: Never return the contract's own address (indicates a bug)
        // If mapping somehow returns this contract's address, treat it as non-existent
        if (result == address(this)) {
            return address(0);
        }

        return result;
    }

    /**
     * @dev Get username for an address
     * @param userAddress The address to lookup
     * @return The username associated with the address
     */
    function getUsername(
        address userAddress
    ) external view returns (string memory) {
        return addressToUsername[userAddress];
    }

    /**
     * @dev Check if username is valid (alphanumeric and underscores only)
     * @param username The username to validate
     * @return True if valid
     */
    function isValidUsername(
        string memory username
    ) public pure returns (bool) {
        bytes memory b = bytes(username);
        if (b.length == 0) return false;

        for (uint i = 0; i < b.length; i++) {
            bytes1 char = b[i];
            if (
                !(char >= 0x30 && char <= 0x39) && // 0-9
                !(char >= 0x41 && char <= 0x5A) && // A-Z
                !(char >= 0x61 && char <= 0x7A) && // a-z
                char != 0x5F
            ) {
                // _
                return false;
            }
        }
        return true;
    }

    /**
     * @dev Check if username is available
     * @param username The username to check
     * @return True if available
     */
    function isUsernameAvailable(
        string memory username
    ) external view returns (bool) {
        return usernameToAddress[username] == address(0);
    }

    /**
     * @dev Update registration fee (owner only)
     * @param newFee The new registration fee (in USDC, 6 decimals)
     */
    function setRegistrationFee(uint256 newFee) external onlyOwner {
        uint256 oldFee = registrationFee;
        registrationFee = newFee;
        emit RegistrationFeeUpdated(oldFee, newFee);
    }

    /**
     * @dev Update premium fee (owner only)
     * @param newFee The new premium fee (in USDC, 6 decimals)
     */
    function setPremiumFee(uint256 newFee) external onlyOwner {
        uint256 oldFee = premiumFee;
        premiumFee = newFee;
        emit PremiumFeeUpdated(oldFee, newFee);
    }

    /**
     * @dev Withdraw collected USDC fees (owner only)
     */
    function withdrawFees() external onlyOwner {
        uint256 balance = usdcToken.balanceOf(address(this));
        require(balance > 0, "No fees to withdraw");
        usdcToken.safeTransfer(owner(), balance);
    }

    /**
     * @dev Get current USDC fee balance (owner only)
     */
    function getFeeBalance() external view returns (uint256) {
        return usdcToken.balanceOf(address(this));
    }
}
