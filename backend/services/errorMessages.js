/**
 * User-Friendly Error Messages
 * Translates technical errors to actionable, helpful messages
 */

/**
 * Get user-friendly error message from technical error
 * @param {Error|string} error - Error object or error message
 * @param {string} context - Context of where error occurred (e.g., 'payment', 'balance', 'registration')
 * @returns {string} User-friendly error message
 */
export function getUserFriendlyError(error, context = 'general') {
  const errorMessage = error?.message || error || 'An unknown error occurred'
  const errorString = errorMessage.toLowerCase()

  // Payment-related errors
  if (context === 'payment' || context === 'send_payment') {
    // Insufficient balance
    if (errorString.includes('insufficient') || errorString.includes('balance')) {
      return {
        message: `💰 **Insufficient Balance**\n\n` +
          `You don't have enough funds for this payment.\n\n` +
          `💡 **What to do:**\n` +
          `• Check your balance: "What's my balance?"\n` +
          `• Receive funds from someone\n` +
          `• Try a smaller amount\n\n` +
          `Need help? Just ask me! 😊`,
        actionable: true,
        suggestions: ['check_balance', 'receive_funds']
      }
    }

    // Network/transaction errors
    if (errorString.includes('network') || errorString.includes('timeout') || errorString.includes('fetch failed')) {
      return {
        message: `🌐 **Network Issue**\n\n` +
          `I'm having trouble connecting to the blockchain right now.\n\n` +
          `💡 **What to do:**\n` +
          `• Wait a moment and try again\n` +
          `• Check your internet connection\n` +
          `• The network might be busy - try in a few minutes\n\n` +
          `This usually resolves quickly! ⏰`,
        actionable: true,
        suggestions: ['retry', 'wait']
      }
    }

    // Invalid recipient
    if (errorString.includes('recipient') || errorString.includes('username') || errorString.includes('not found')) {
      return {
        message: `👤 **Recipient Not Found**\n\n` +
          `I couldn't find that username.\n\n` +
          `💡 **What to do:**\n` +
          `• Check the username spelling\n` +
          `• Make sure the user is registered\n` +
          `• Try: "Send $10 to @username" (with @ symbol)\n\n` +
          `Example: "Send $10 to @alice" ✅`,
        actionable: true,
        suggestions: ['check_username', 'verify_recipient']
      }
    }

    // Invalid amount
    if (errorString.includes('amount') || errorString.includes('invalid') && errorString.includes('number')) {
      return {
        message: `💵 **Invalid Amount**\n\n` +
          `I couldn't understand the payment amount.\n\n` +
          `💡 **What to do:**\n` +
          `• Use a clear format: "$10" or "10 USDC"\n` +
          `• Make sure it's a valid number\n` +
          `• Minimum amount: $0.01\n\n` +
          `Examples:\n` +
          `• "Send $10 to @alice" ✅\n` +
          `• "Pay @bob 50 USDC" ✅`,
        actionable: true,
        suggestions: ['format_amount', 'check_examples']
      }
    }

    // Transaction failed
    if (errorString.includes('transaction') || errorString.includes('failed') || errorString.includes('revert')) {
      return {
        message: `❌ **Payment Failed**\n\n` +
          `The payment couldn't be completed.\n\n` +
          `💡 **What to do:**\n` +
          `• Check your balance is sufficient\n` +
          `• Verify the recipient username is correct\n` +
          `• Try again in a moment\n` +
          `• If it keeps failing, ask me for help\n\n` +
          `I'm here to help! 🤖`,
        actionable: true,
        suggestions: ['check_balance', 'verify_recipient', 'retry']
      }
    }
  }

  // Balance-related errors
  if (context === 'balance' || context === 'check_balance') {
    if (errorString.includes('network') || errorString.includes('timeout')) {
      return {
        message: `🌐 **Can't Check Balance**\n\n` +
          `I'm having trouble connecting to check your balance.\n\n` +
          `💡 **What to do:**\n` +
          `• Wait a moment and try again\n` +
          `• Check your internet connection\n` +
          `• Try: "What's my balance?" again\n\n` +
          `This usually works on the second try! 🔄`,
        actionable: true,
        suggestions: ['retry', 'wait']
      }
    }
  }

  // Registration errors
  if (context === 'registration' || context === 'register_username') {
    if (errorString.includes('already') || errorString.includes('taken')) {
      return {
        message: `📝 **Username Already Taken**\n\n` +
          `That username is already registered by someone else.\n\n` +
          `💡 **What to do:**\n` +
          `• Try a different username\n` +
          `• Add numbers or variations\n` +
          `• Examples: @alice123, @alice_crypto\n\n` +
          `Be creative! 🎨`,
        actionable: true,
        suggestions: ['try_different_username', 'add_variations']
      }
    }

    if (errorString.includes('invalid') || errorString.includes('format')) {
      return {
        message: `📝 **Invalid Username Format**\n\n` +
          `Usernames must be 3-20 characters and contain only letters, numbers, and underscores.\n\n` +
          `💡 **What to do:**\n` +
          `• Use 3-20 characters\n` +
          `• Only letters, numbers, and _\n` +
          `• No spaces or special characters\n\n` +
          `Examples:\n` +
          `• @alice ✅\n` +
          `• @alice123 ✅\n` +
          `• @alice_crypto ✅\n` +
          `• @alice-crypto ❌ (no hyphens)`,
        actionable: true,
        suggestions: ['check_format', 'try_examples']
      }
    }
  }

  // Wallet errors
  if (errorString.includes('wallet') || errorString.includes('not found')) {
    return {
      message: `👛 **Wallet Not Found**\n\n` +
        `You don't have a wallet yet.\n\n` +
        `💡 **What to do:**\n` +
        `• Register a username first: "Register @yourname"\n` +
        `• Or use: /register @yourname\n\n` +
        `Once registered, you can send and receive payments! 🚀`,
      actionable: true,
      suggestions: ['register_username']
    }
  }

  // API/OpenAI errors
  if (errorString.includes('openai') || errorString.includes('api key') || errorString.includes('rate limit')) {
    return {
      message: `🤖 **AI Service Temporarily Unavailable**\n\n` +
        `I'm having trouble processing that right now.\n\n` +
        `💡 **What to do:**\n` +
        `• Try again in a moment\n` +
        `• You can also use commands:\n` +
        `  /send @username $amount\n` +
        `  /balance\n` +
        `  /history\n\n` +
        `I'll be back soon! ⏰`,
      actionable: true,
      suggestions: ['retry', 'use_commands']
    }
  }

  // Generic errors
  return {
    message: `⚠️ **Something Went Wrong**\n\n` +
      `I encountered an issue processing your request.\n\n` +
      `💡 **What to do:**\n` +
      `• Try again in a moment\n` +
      `• Rephrase your request\n` +
      `• Use commands if needed: /help\n\n` +
      `If it keeps happening, let me know and I'll help! 🤖`,
    actionable: true,
    suggestions: ['retry', 'rephrase', 'ask_help']
  }
}

/**
 * Format error with emoji and structure
 * @param {string} title - Error title
 * @param {string} description - Error description
 * @param {Array} suggestions - Array of suggestion strings
 * @returns {string} Formatted error message
 */
export function formatError(title, description, suggestions = []) {
  let message = `❌ **${title}**\n\n${description}\n\n`
  
  if (suggestions.length > 0) {
    message += `💡 **What to do:**\n`
    suggestions.forEach(suggestion => {
      message += `• ${suggestion}\n`
    })
    message += `\n`
  }
  
  return message
}

/**
 * Get helpful suggestions based on error type
 * @param {string} errorType - Type of error
 * @returns {Array} Array of suggestion strings
 */
export function getErrorSuggestions(errorType) {
  const suggestions = {
    'insufficient_balance': [
      'Check your balance: "What\'s my balance?"',
      'Receive funds from someone',
      'Try a smaller amount'
    ],
    'network_error': [
      'Wait a moment and try again',
      'Check your internet connection',
      'The network might be busy - try in a few minutes'
    ],
    'invalid_recipient': [
      'Check the username spelling',
      'Make sure the user is registered',
      'Try: "Send $10 to @username" (with @ symbol)'
    ],
    'invalid_amount': [
      'Use a clear format: "$10" or "10 USDC"',
      'Make sure it\'s a valid number',
      'Minimum amount: $0.01'
    ],
    'wallet_not_found': [
      'Register a username first: "Register @yourname"',
      'Or use: /register @yourname'
    ],
    'username_taken': [
      'Try a different username',
      'Add numbers or variations',
      'Examples: @alice123, @alice_crypto'
    ]
  }
  
  return suggestions[errorType] || ['Try again', 'Ask for help: /help']
}


