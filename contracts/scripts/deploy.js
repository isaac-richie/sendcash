const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  // USDC token address (update with actual Base Sepolia USDC address)
  const USDC_ADDRESS = process.env.USDC_ADDRESS || "0x0000000000000000000000000000000000000000";
  if (USDC_ADDRESS === "0x0000000000000000000000000000000000000000") {
    console.error("\n❌ ERROR: USDC_ADDRESS not set in environment!");
    console.error("   Set USDC_ADDRESS in .env file before deploying");
    process.exit(1);
  }

  // Deploy UsernameRegistry
  console.log("\nDeploying UsernameRegistry...");
  console.log("USDC Address:", USDC_ADDRESS);
  const UsernameRegistry = await hre.ethers.getContractFactory("UsernameRegistry");
  const usernameRegistry = await UsernameRegistry.deploy(USDC_ADDRESS);
  await usernameRegistry.waitForDeployment();
  const usernameRegistryAddress = await usernameRegistry.getAddress();
  console.log("UsernameRegistry deployed to:", usernameRegistryAddress);
  console.log("Registration Fee: 0 USDC (test phase - free registration)");
  console.log("Premium Fee: 0 USDC (test phase - free registration)");

  // Note: We use Thirdweb SDK for wallet creation and gas sponsorship
  console.log("\n⚠️  Note: Using Thirdweb SDK for smart wallet creation and gas sponsorship");
  console.log("   - AccountFactory: Not needed (Thirdweb handles wallet creation)");
  console.log("   - SimpleAccount: Not needed (Thirdweb provides smart wallets)");
  console.log("   - Paymaster: Not needed (Thirdweb handles gas sponsorship)");

  // Deploy SendCash
  console.log("\nDeploying SendCash...");
  const SendCash = await hre.ethers.getContractFactory("SendCash");
  const sendCash = await SendCash.deploy(usernameRegistryAddress);
  await sendCash.waitForDeployment();
  const sendCashAddress = await sendCash.getAddress();
  console.log("SendCash deployed to:", sendCashAddress);
  
  // Note about fees (test phase)
  console.log("\n✅ Registration Fees: FREE (test phase)");
  console.log("   - Regular username: 0 USDC (free)");
  console.log("   - Premium username: 0 USDC (free)");
  console.log("   - Relayer only needs ETH for gas (no USDC required)");

  // Add USDC and USDT (testnet addresses - update with actual Base testnet addresses)
  console.log("\nConfiguring supported tokens...");
  // Note: Update these with actual Base Sepolia testnet token addresses
  // const USDC_ADDRESS = "0x..."; // Base Sepolia USDC
  // const USDT_ADDRESS = "0x..."; // Base Sepolia USDT
  // await sendCash.addSupportedToken(USDC_ADDRESS);
  // await sendCash.addSupportedToken(USDT_ADDRESS);

  console.log("\n=== Deployment Summary ===");
  console.log("UsernameRegistry:", usernameRegistryAddress);
  console.log("SendCash:", sendCashAddress);
  console.log("\n⚠️  Using Thirdweb SDK for smart wallet creation and gas sponsorship");
  console.log("   Set up Thirdweb Client ID and Factory Address in backend .env");
  console.log("\nSave these addresses for backend configuration!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
