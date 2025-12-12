/**
 * Chain Detection Service
 * Parses chain names from natural language and maps them to chain configurations
 */

import { CHAINS } from './bridgeService.js'

/**
 * Chain name mappings - maps various user inputs to chain keys
 */
const CHAIN_MAPPINGS = {
  // Ethereum
  'ethereum': 'ETHEREUM',
  'eth': 'ETHEREUM',
  'mainnet': 'ETHEREUM',
  'ethereum mainnet': 'ETHEREUM',
  
  // Base
  'base': 'BASE',
  'base sepolia': 'BASE',
  'base mainnet': 'BASE_MAINNET',
  
  // BNB Chain / BSC
  'bnb': 'BSC',
  'bnb chain': 'BSC',
  'bsc': 'BSC',
  'binance': 'BSC',
  'binance smart chain': 'BSC',
  'binance chain': 'BSC',
  
  // Polygon
  'polygon': 'POLYGON',
  'matic': 'POLYGON',
  'polygon mainnet': 'POLYGON',
  
  // Arbitrum
  'arbitrum': 'ARBITRUM',
  'arb': 'ARBITRUM',
  'arbitrum one': 'ARBITRUM',
  
  // Optimism
  'optimism': 'OPTIMISM',
  'op': 'OPTIMISM',
  'optimistic': 'OPTIMISM',
  
  // Avalanche
  'avalanche': 'AVALANCHE',
  'avax': 'AVALANCHE',
  'avalanche c-chain': 'AVALANCHE',
  
  // zkSync Era
  'zksync': 'ZKSYNC_ERA',
  'zksync era': 'ZKSYNC_ERA',
  'zk sync': 'ZKSYNC_ERA',
  
  // Linea
  'linea': 'LINEA',
  'linea mainnet': 'LINEA',
  
  // Scroll
  'scroll': 'SCROLL',
  'scroll mainnet': 'SCROLL',
  
  // Mantle
  'mantle': 'MANTLE',
  'mantle mainnet': 'MANTLE',
  
  // Blast
  'blast': 'BLAST',
  'blast mainnet': 'BLAST'
}

/**
 * Parse chain from message
 * @param {string} message - User message
 * @param {boolean} preferTarget - If true, prefer target chain patterns (default: true)
 * @returns {Object|null} Chain config or null if not found
 */
export function parseChainFromMessage(message, preferTarget = true) {
  if (!message || typeof message !== 'string') {
    return null
  }

  const lowerMessage = message.toLowerCase()
  
  // Check for chain mentions in various formats
  // Pattern: "on [chain]", "to [chain]", "[chain] chain", etc.
  const chainPatterns = preferTarget ? [
    /(?:send|pay|transfer|move|bridge).*?(?:to|on)\s+([a-z\s]+?)(?:\s+chain)?(?:\s|$|\.)/i,
    /on\s+([a-z\s]+?)(?:\s+chain)?(?:\s|$|\.)/i,
    /to\s+([a-z\s]+?)(?:\s+chain)?(?:\s|$|\.)/i,
    /([a-z\s]+?)\s+chain/i,
    /\b(bnb|bsc|polygon|arbitrum|optimism|avalanche|ethereum|base|zksync|linea|scroll|mantle|blast)\b/i
  ] : [
    /(?:from|on|in)\s+([a-z\s]+?)(?:\s+chain)?(?:\s|$|\.)/i,
    /(?:my\s+funds\s+are\s+on|funds\s+on|balance\s+on)\s+([a-z\s]+?)(?:\s+chain)?(?:\s|$|\.)/i,
    /(?:using|use)\s+(?:the|my)\s+[a-z]+\s+(?:on|from)\s+([a-z\s]+?)(?:\s+chain)?(?:\s|$|\.)/i,
    /\b(bnb|bsc|polygon|arbitrum|optimism|avalanche|ethereum|base|zksync|linea|scroll|mantle|blast)\b/i
  ]

  for (const pattern of chainPatterns) {
    const match = lowerMessage.match(pattern)
    if (match) {
      const chainName = match[1]?.trim() || match[0]?.trim()
      if (chainName) {
        const chainKey = CHAIN_MAPPINGS[chainName]
        if (chainKey && CHAINS[chainKey]) {
          return {
            key: chainKey,
            config: CHAINS[chainKey],
            name: CHAINS[chainKey].name,
            chainId: CHAINS[chainKey].chainId
          }
        }
      }
    }
  }

  // Direct lookup in mappings
  for (const [key, value] of Object.entries(CHAIN_MAPPINGS)) {
    if (lowerMessage.includes(key) && CHAINS[value]) {
      return {
        key: value,
        config: CHAINS[value],
        name: CHAINS[value].name,
        chainId: CHAINS[value].chainId
      }
    }
  }

  return null
}

/**
 * Parse source chain from message (where funds currently are)
 * @param {string} message - User message
 * @returns {Object|null} Chain config or null if not found
 */
export function parseSourceChainFromMessage(message) {
  if (!message || typeof message !== 'string') {
    return null
  }

  const lowerMessage = message.toLowerCase()
  
  // Patterns for source chain detection (more comprehensive)
  const sourcePatterns = [
    // "my funds are on X", "funds are on X", "balance is on X"
    /(?:my\s+funds\s+are\s+on|funds\s+are\s+on|balance\s+is\s+on|funds\s+on)\s+([a-z\s]+?)(?:\s+chain)?(?:\s|$|\.|,)/i,
    // "use the USDC in my X account", "using my X balance", "use the USDC in my Optimism account"
    /(?:use|using)\s+(?:the|my)\s+[a-z]+\s+(?:on|from|in)\s+([a-z\s]+?)(?:\s+chain)?(?:\s+account|balance|wallet)?(?:\s|$|\.|,)/i,
    // "bridge from X", "move from X", "bridge it from X"
    /(?:bridge|move)\s+(?:from|it\s+from|whatever\s+from)\s+(?:my\s+)?([a-z\s]+?)(?:\s+chain)?(?:\s+balance|account|wallet)?(?:\s|$|\.|,)/i,
    // "from X balance", "on X account", "in X wallet"
    /(?:from|on|in)\s+([a-z\s]+?)(?:\s+chain)?(?:\s+balance|account|wallet)/i,
    // "using the funds I have on X"
    /(?:using|use)\s+(?:the\s+)?funds\s+(?:i\s+have\s+on|on)\s+([a-z\s]+?)(?:\s+chain)?(?:\s|$|\.|,)/i,
    // "pay on X using my Y" - extract Y as source (e.g., "pay on Arbitrum using my Optimism")
    /(?:pay|send).*?(?:on|to)\s+[a-z\s]+\s+(?:using|with)\s+(?:the|my)\s+[a-z]+\s+(?:on|from|in)\s+([a-z\s]+?)(?:\s+chain)?(?:\s+account|balance)?(?:\s|$|\.|,)/i,
    // "but use the USDC in my X account" - common pattern
    /(?:but\s+)?use\s+(?:the|my)\s+[a-z]+\s+in\s+(?:my|the)\s+([a-z\s]+?)(?:\s+chain)?(?:\s+account|balance)?(?:\s|$|\.|,)/i,
  ]

  for (const pattern of sourcePatterns) {
    const match = lowerMessage.match(pattern)
    if (match) {
      const chainName = match[1]?.trim()
      if (chainName) {
        // Clean up common words
        const cleaned = chainName.replace(/\b(account|balance|wallet|chain)\b/gi, '').trim()
        const chainKey = CHAIN_MAPPINGS[cleaned] || CHAIN_MAPPINGS[chainName]
        if (chainKey && CHAINS[chainKey]) {
          return {
            key: chainKey,
            config: CHAINS[chainKey],
            name: CHAINS[chainKey].name,
            chainId: CHAINS[chainKey].chainId
          }
        }
      }
    }
  }

  // Fallback: Look for chain names after "from" or "on" in context of source
  const fallbackPatterns = [
    /(?:from|on)\s+([a-z\s]+?)(?:\s+chain)?(?:\s|$|\.|,)/i
  ]
  
  for (const pattern of fallbackPatterns) {
    const match = lowerMessage.match(pattern)
    if (match) {
      const chainName = match[1]?.trim()
      if (chainName && !['base', 'polygon', 'arbitrum', 'optimism', 'ethereum', 'bsc', 'avalanche'].includes(chainName.toLowerCase())) {
        // Skip if it's a common word, not a chain
        continue
      }
      const chainKey = CHAIN_MAPPINGS[chainName]
      if (chainKey && CHAINS[chainKey]) {
        return {
          key: chainKey,
          config: CHAINS[chainKey],
          name: CHAINS[chainKey].name,
          chainId: CHAINS[chainKey].chainId
        }
      }
    }
  }

  return null
}

/**
 * Validate if chain is supported
 * @param {string} chainKey - Chain key (e.g., 'BSC', 'POLYGON')
 * @returns {boolean} True if supported
 */
export function validateChainSupport(chainKey) {
  return chainKey && CHAINS[chainKey] !== undefined
}

/**
 * Get chain configuration
 * @param {string} chainKey - Chain key
 * @returns {Object|null} Chain config or null
 */
export function getChainConfig(chainKey) {
  if (!validateChainSupport(chainKey)) {
    return null
  }
  
  return {
    key: chainKey,
    config: CHAINS[chainKey],
    name: CHAINS[chainKey].name,
    chainId: CHAINS[chainKey].chainId,
    rpc: CHAINS[chainKey].rpc,
    nativeCurrency: CHAINS[chainKey].nativeCurrency,
    blockExplorer: CHAINS[chainKey].blockExplorer
  }
}

/**
 * Get default chain (Base)
 * @returns {Object} Base chain config
 */
export function getDefaultChain() {
  return getChainConfig('BASE')
}

/**
 * Format chain name for display
 * @param {string} chainKey - Chain key
 * @returns {string} Formatted chain name
 */
export function formatChainName(chainKey) {
  const config = getChainConfig(chainKey)
  return config ? config.name : chainKey
}

/**
 * Get all supported chains
 * @returns {Array} Array of chain configs
 */
export function getAllSupportedChains() {
  return Object.keys(CHAINS).map(key => ({
    key,
    ...CHAINS[key]
  }))
}
