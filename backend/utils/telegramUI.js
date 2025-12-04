/**
 * Telegram UI Styling Utilities
 * Provides helper functions for creating beautiful, consistent UI in Telegram messages
 * 
 * To disable: Set USE_TELEGRAM_UI = false at the top of this file
 */

export const USE_TELEGRAM_UI = true // Set to false to disable UI enhancements

/**
 * Format text with Telegram Markdown
 */
export const format = {
  bold: (text) => `**${text}**`,
  italic: (text) => `_${text}_`,
  code: (text) => `\`${text}\``,
  link: (text, url) => `[${text}](${url})`,
  boldLink: (text, url) => `[**${text}**](${url})`,
  
  // Emoji helpers
  emoji: {
    success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️',
    money: '💰', chart: '📊', link: '🔗', fire: '🔥',
    rocket: '🚀', star: '⭐', new: '🆕', trending: '📈',
    lock: '🔒', unlock: '🔓', sparkles: '✨'
  }
}

/**
 * Create a card-style section with borders
 */
export const card = (title, content, options = {}) => {
  if (!USE_TELEGRAM_UI) return `\n**${title}**\n${content}\n`
  
  const { emoji = '', divider = '─', width = 30 } = options
  const border = divider.repeat(width)
  const titleText = emoji ? `${emoji} ${title}` : title
  
  return `\n${border}\n${format.bold(titleText)}\n${border}\n${content}\n${border}`
}

/**
 * Create a list with nice formatting
 */
export const list = (items, options = {}) => {
  const { numbered = false, emoji = '•', indent = 0 } = options
  const indentStr = ' '.repeat(indent)
  
  return items.map((item, index) => {
    const prefix = numbered ? `${index + 1}.` : emoji
    return `${indentStr}${prefix} ${item}`
  }).join('\n')
}

/**
 * Format numbers with commas and currency
 */
export const number = {
  currency: (amount, symbol = '$', decimals = 2) => {
    const formatted = parseFloat(amount).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })
    return `${symbol}${formatted}`
  },
  
  abbreviated: (num) => {
    if (!num || num === 0) return '$0'
    if (num >= 1000000000) return `$${(num / 1000000000).toFixed(1)}b`
    if (num >= 1000000) return `$${(num / 1000000).toFixed(0)}m`
    if (num >= 1000) return `$${(num / 1000).toFixed(0)}k`
    return `$${num.toFixed(0)}`
  },
  
  percent: (value, decimals = 1) => {
    return `${(value * 100).toFixed(decimals)}%`
  }
}

/**
 * Create a divider/separator
 */
export const divider = (char = '─', length = 30) => {
  if (!USE_TELEGRAM_UI) return '\n'
  return char.repeat(length)
}

/**
 * Create a section header
 */
export const section = (title, emoji = '') => {
  const prefix = emoji ? `${emoji} ` : ''
  if (!USE_TELEGRAM_UI) return `\n${format.bold(`${prefix}${title}`)}\n`
  return `\n${format.bold(`${prefix}${title}`)}\n${divider()}\n`
}

/**
 * Create a badge/tag
 */
export const badge = (text, type = 'default') => {
  const emojis = {
    success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️',
    new: '🆕', hot: '🔥', trending: '📈', default: '•'
  }
  const emoji = emojis[type] || emojis.default
  return `${emoji} ${text}`
}

/**
 * Format a timestamp
 */
export const time = {
  relative: (timestamp) => {
    const now = Date.now()
    const diff = now - timestamp
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    
    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return 'just now'
  }
}

export default {
  format,
  card,
  list,
  number,
  divider,
  section,
  badge,
  time,
  USE_TELEGRAM_UI
}
