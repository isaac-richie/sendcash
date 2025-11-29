// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./UsernameRegistry.sol";

/**
 * @title SendCashV2
 * @dev Upgraded payment contract for SendCash with:
 *      - Configurable global fee (with safety cap)
 *      - Optional per‑token fee overrides
 *      - Configurable fee recipient
 *      - Pausable circuit breaker
 *      - Ability to send by username or raw address
 *
 * Notes:
 * - Gas sponsorship / account abstraction is handled off‑chain (Thirdweb SDK).
 * - This contract focuses purely on token transfers and events.
 */
contract SendCashV2 is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    UsernameRegistry public immutable usernameRegistry;

    // Supported ERC20 stablecoins
    mapping(address => bool) public supportedTokens;
    address[] public supportedTokenList;

    // Fee configuration
    // All fees are expressed in basis points (bps): 1% = 100 bps, 0.5% = 50 bps
    uint256 public feeBps; // global fee, default 50 (0.5%)
    uint256 public constant MAX_FEE_BPS = 200; // hard cap = 2%
    uint256 public constant BASIS_POINTS = 10_000;

    // Optional per‑token fee overrides: if 0, fall back to global feeBps
    mapping(address => uint256) public tokenFeeBps;

    // Fee recipient address (can be different from owner)
    address public feeRecipient;

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

    event FeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);
    event TokenFeeUpdated(address indexed token, uint256 oldFeeBps, uint256 newFeeBps);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);

    constructor(
        address _usernameRegistry,
        address _feeRecipient,
        uint256 _initialFeeBps
    ) Ownable(msg.sender) {
        require(_usernameRegistry != address(0), "Invalid registry");
        require(_feeRecipient != address(0), "Invalid fee recipient");
        require(_initialFeeBps <= MAX_FEE_BPS, "Initial fee too high");

        usernameRegistry = UsernameRegistry(_usernameRegistry);
        feeRecipient = _feeRecipient;
        feeBps = _initialFeeBps; // e.g. 50 = 0.5%
    }

    // ========= Owner Controls =========

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Set global fee (in basis points). Capped by MAX_FEE_BPS.
     */
    function setFeeBps(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= MAX_FEE_BPS, "Fee too high");
        uint256 old = feeBps;
        feeBps = newFeeBps;
        emit FeeUpdated(old, newFeeBps);
    }

    /**
     * @dev Set per‑token fee override (in basis points). 0 = use global fee.
     */
    function setTokenFeeBps(address token, uint256 newFeeBps) external onlyOwner {
        require(supportedTokens[token], "Token not supported");
        require(newFeeBps <= MAX_FEE_BPS, "Fee too high");
        uint256 old = tokenFeeBps[token];
        tokenFeeBps[token] = newFeeBps;
        emit TokenFeeUpdated(token, old, newFeeBps);
    }

    /**
     * @dev Update fee recipient address.
     */
    function setFeeRecipient(address newRecipient) external onlyOwner {
        require(newRecipient != address(0), "Invalid fee recipient");
        address old = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(old, newRecipient);
    }

    /**
     * @dev Add supported token. Emits TokenAdded.
     */
    function addSupportedToken(address token) external onlyOwner {
        require(token != address(0), "Invalid token address");
        require(!supportedTokens[token], "Already supported");

        supportedTokens[token] = true;
        supportedTokenList.push(token);

        emit TokenAdded(token);
    }

    /**
     * @dev Remove supported token. Emits TokenRemoved.
     */
    function removeSupportedToken(address token) external onlyOwner {
        require(supportedTokens[token], "Not supported");
        supportedTokens[token] = false;
        emit TokenRemoved(token);
        // NOTE: we keep token in supportedTokenList for historical enumeration;
        // frontends should check supportedTokens[token] flag.
    }

    // ========= View Helpers =========

    function getSupportedTokens() external view returns (address[] memory) {
        return supportedTokenList;
    }

    function getEffectiveFeeBps(address token) public view returns (uint256) {
        uint256 overrideBps = tokenFeeBps[token];
        if (overrideBps > 0) {
            return overrideBps;
        }
        return feeBps;
    }

    function calculateFee(address token, uint256 amount) public view returns (uint256) {
        uint256 bps = getEffectiveFeeBps(token);
        return (amount * bps) / BASIS_POINTS;
    }

    // ========= Core Payment Logic =========

    /**
     * @dev Send payment to a username.
     * @param toUsername The recipient's username (resolved via UsernameRegistry)
     * @param token The token address (must be supported)
     * @param amount The amount to send (in token decimals)
     */
    function sendPayment(
        string memory toUsername,
        address token,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        require(supportedTokens[token], "Token not supported");
        require(amount > 0, "Amount must be greater than 0");

        address to = usernameRegistry.getAddress(toUsername);
        require(to != address(0), "Username not found");
        require(to != msg.sender, "Cannot send to yourself");

        _executePayment(msg.sender, toUsername, to, token, amount);
    }

    /**
     * @dev Send payment directly to a raw address (no username required).
     *      If the address has a username, it will be included in the event.
     */
    function sendPaymentToAddress(
        address to,
        address token,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        require(supportedTokens[token], "Token not supported");
        require(amount > 0, "Amount must be greater than 0");
        require(to != address(0), "Invalid recipient");
        require(to != msg.sender, "Cannot send to yourself");

        string memory toUsername = usernameRegistry.getUsername(to);
        _executePayment(msg.sender, toUsername, to, token, amount);
    }

    /**
     * @dev Internal payment implementation shared by both entrypoints.
     */
    function _executePayment(
        address from,
        string memory toUsername,
        address to,
        address token,
        uint256 amount
    ) internal {
        uint256 bps = getEffectiveFeeBps(token);
        uint256 fee = (amount * bps) / BASIS_POINTS;
        uint256 amountAfterFee = amount - fee;

        // Get usernames for event (may be empty strings)
        string memory fromUsername = usernameRegistry.getUsername(from);
        string memory toUsernameCopy = toUsername;

        // Pull full amount from sender
        IERC20(token).safeTransferFrom(from, address(this), amount);

        // Send amount minus fee to recipient
        IERC20(token).safeTransfer(to, amountAfterFee);

        // Send fee to feeRecipient (if > 0)
        if (fee > 0) {
            IERC20(token).safeTransfer(feeRecipient, fee);
        }

        emit PaymentSent(
            from,
            to,
            token,
            amount,
            fee,
            fromUsername,
            toUsernameCopy
        );
    }
}




