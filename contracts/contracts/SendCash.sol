// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./UsernameRegistry.sol";

/**
 * @title SendCash
 * @dev Main payment contract for SendCash with fee structure
 * Gas sponsorship handled by Thirdweb SDK
 */
contract SendCash is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    UsernameRegistry public immutable usernameRegistry;

    // Supported stablecoins
    mapping(address => bool) public supportedTokens;

    // Fee configuration
    uint256 public constant FEE_PERCENTAGE = 50; // 0.5% = 50 basis points
    uint256 public constant BASIS_POINTS = 10000;

    // Events
    event PaymentSent(
        address indexed from,
        address indexed to,
        address indexed token,
        uint256 amount,
        uint256 fee,
        string fromUsername,
        string toUsername
    );

    event TokenAdded(address indexed token);
    event TokenRemoved(address indexed token);

    constructor(address _usernameRegistry) Ownable(msg.sender) {
        usernameRegistry = UsernameRegistry(_usernameRegistry);
    }

    /**
     * @dev Send payment to a username
     * @param toUsername The recipient's username
     * @param token The token address (USDC/USDT)
     * @param amount The amount to send (in token decimals)
     */
    function sendPayment(
        string memory toUsername,
        address token,
        uint256 amount
    ) external nonReentrant {
        require(supportedTokens[token], "Token not supported");
        require(amount > 0, "Amount must be greater than 0");

        address to = usernameRegistry.getAddress(toUsername);
        require(to != address(0), "Username not found");
        require(to != msg.sender, "Cannot send to yourself");

        // Calculate fee (0.5% of all payments)
        uint256 fee = (amount * FEE_PERCENTAGE) / BASIS_POINTS;
        uint256 amountAfterFee = amount - fee;

        // Get usernames for event
        string memory fromUsername = usernameRegistry.getUsername(msg.sender);
        string memory toUsernameCopy = toUsername;

        // Transfer tokens
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).safeTransfer(to, amountAfterFee);

        // Transfer fee to owner (0.5% of all payments)
        IERC20(token).safeTransfer(owner(), fee);

        emit PaymentSent(
            msg.sender,
            to,
            token,
            amount,
            fee,
            fromUsername,
            toUsernameCopy
        );
    }

    /**
     * @dev Add supported token
     * @param token The token address to add
     */
    function addSupportedToken(address token) external onlyOwner {
        require(token != address(0), "Invalid token address");
        supportedTokens[token] = true;
        emit TokenAdded(token);
    }

    /**
     * @dev Remove supported token
     * @param token The token address to remove
     */
    function removeSupportedToken(address token) external onlyOwner {
        supportedTokens[token] = false;
        emit TokenRemoved(token);
    }

    /**
     * @dev Calculate fee for an amount (0.5% of all payments)
     * @param amount The payment amount
     * @return The fee amount
     */
    function calculateFee(uint256 amount) external pure returns (uint256) {
        return (amount * FEE_PERCENTAGE) / BASIS_POINTS;
    }
}
