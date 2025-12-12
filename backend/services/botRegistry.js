/**
 * Bot Registry
 * Stores bot instance globally so queue workers can access it
 */

let botInstance = null

/**
 * Register bot instance
 * @param {Object} bot - Telegram bot instance
 */
export const registerBot = (bot) => {
  botInstance = bot
  console.log('[BotRegistry] Bot instance registered')
}

/**
 * Get bot instance
 * @returns {Object|null} Bot instance or null
 */
export const getBot = () => {
  return botInstance
}

