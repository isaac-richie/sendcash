/**
 * Test notification format preview
 * Shows how the bell icon notification will look
 */

console.log('🔔 NOTIFICATION FORMAT PREVIEW')
console.log('='.repeat(50))
console.log('')

// Simulate notification message
const fromDisplay = '@alice'
const formattedAmount = '10.00'
const tokenSymbol = 'USDC'
const formattedFee = '0.05'
const formattedAmountAfterFee = '9.95'
const blockExplorerUrl = 'https://sepolia-explorer.base.org/tx/0x1234567890abcdef'
const txHash = '0x1234567890abcdef1234567890abcdef12345678'
const memoText = '\n📝 Note: For lunch'

const notificationMessage = `🔔 **NEW PAYMENT ALERT** 🔔\n\n` +
  `💰 **You received a payment!**\n\n` +
  `━━━━━━━━━━━━━━━━━━━━\n` +
  `👤 **From:** ${fromDisplay}\n` +
  `💵 **Amount:** $${formattedAmount} ${tokenSymbol}${memoText}\n` +
  `📊 **Fee (0.5%):** $${formattedFee} ${tokenSymbol}\n` +
  `✅ **You received:** $${formattedAmountAfterFee} ${tokenSymbol}\n` +
  `━━━━━━━━━━━━━━━━━━━━\n\n` +
  `🔗 [View Transaction on Explorer](${blockExplorerUrl})\n` +
  `📋 Hash: \`${txHash.slice(0, 16)}...\`\n\n` +
  `💡 Check your balance: /balance`

console.log(notificationMessage)
console.log('')
console.log('='.repeat(50))
console.log('✅ Notification format includes:')
console.log('  • 🔔 Bell icon at the start (prominent alert)')
console.log('  • Clear visual separators (━━━)')
console.log('  • Bold formatting for key information')
console.log('  • Memo/note support')
console.log('  • Shortened transaction hash')
console.log('  • Direct explorer link')
console.log('')


