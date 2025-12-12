import dotenv from 'dotenv'
import { ethers } from 'ethers'
import { dbRun, dbGet, dbAll } from './database.js'
import { checkBridgeNeeded, CHAINS } from './bridgeService.js'
dotenv.config()

/**
 * Polymarket Service
 * Integrates with Polymarket API to fetch prediction market data
 * and provide game/sports predictions
 * Uses The Graph subgraphs for data access
 */

// Polymarket subgraph endpoints (Goldsky hosted - no API key required)
const POLYMARKET_SUBGRAPHS = {
  // Main subgraph endpoint (requires API key from The Graph)
  main: process.env.THE_GRAPH_API_KEY 
    ? `https://gateway.thegraph.com/api/${process.env.THE_GRAPH_API_KEY}/subgraphs/id/Bx1W4S7kDVxs9gC3s2G6DS8kdNBJNVhMviCtin2DiBp`
    : null,
  
  // Goldsky hosted subgraphs (no API key required)
  orders: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/orderbook-subgraph/0.0.1/gn',
  positions: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/positions-subgraph/0.0.7/gn',
  activity: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/activity-subgraph/0.0.4/gn',
  openInterest: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/oi-subgraph/0.0.6/gn',
  pnl: 'https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/pnl-subgraph/0.0.14/gn'
}

// ✅ FIX: Use orders subgraph first (has better market data structure)
// Fallback chain: main (with API key) > orders > activity
const POLYMARKET_API_URL = POLYMARKET_SUBGRAPHS.main || POLYMARKET_SUBGRAPHS.orders || POLYMARKET_SUBGRAPHS.activity

// Helper to detect which subgraph we're using
const getSubgraphType = () => {
  if (POLYMARKET_SUBGRAPHS.main && POLYMARKET_API_URL === POLYMARKET_SUBGRAPHS.main) return 'main'
  if (POLYMARKET_API_URL === POLYMARKET_SUBGRAPHS.activity) return 'activity'
  return 'orders'
}

// Polymarket CLOB API endpoint for trading
const POLYMARKET_CLOB_API = 'https://clob.polymarket.com'

// Export for testing
export { POLYMARKET_API_URL, POLYMARKET_SUBGRAPHS, POLYMARKET_CLOB_API }

/**
 * Fetch markets from Polymarket using The Graph subgraph
 * @param {Object} options - Query options
 * @param {string} options.category - Market category (e.g., 'sports', 'politics', 'crypto')
 * @param {number} options.limit - Number of markets to return (default: 10)
 * @param {string} options.search - Search query for markets
 * @returns {Promise<Array>} Array of market data
 */
export async function fetchMarkets(options = {}) {
  const { category = null, limit = 10, search = null } = options

  try {
    const subgraphType = getSubgraphType()
    
    // ✅ FIX: Activity subgraph has fixedProductMarketMakers entity
    // Use consistent query that works with activity subgraph
    const query = `
      query GetMarkets {
        fixedProductMarketMakers(
          first: ${limit}
          orderBy: createdAt
          orderDirection: desc
        ) {
          id
          question {
            id
            title
            slug
            description
            endDate
            resolutionSource
            image
            outcomes
          }
          volume
          liquidity
          active
          closed
          archived
        }
      }
    `

    const response = await fetch(POLYMARKET_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    })

    if (!response.ok) {
      throw new Error(`Polymarket API error: ${response.status}`)
    }

    const data = await response.json()

    if (data.errors) {
      // ✅ FIX: If query fails, return empty array with warning (don't throw)
      console.warn('[Polymarket] GraphQL query failed:', data.errors[0]?.message)
      console.warn('[Polymarket] Subgraph may have different schema. Returning empty results.')
      return [] // Return empty array instead of throwing
    }

    // ✅ FIX: Transform data based on what we got
    const marketMakers = data.data?.fixedProductMarketMakers || []
    if (marketMakers.length > 0) {
      return marketMakers.map(marketMaker => {
        const question = marketMaker?.question
        const condition = marketMaker?.condition
        
        return {
          id: condition?.id || marketMaker.id,
          conditionId: condition?.id || marketMaker.id,
          questionId: question?.id || marketMaker.id,
          question: question?.title || 'Unknown Market',
          slug: question?.slug || '',
          description: question?.description || '',
          endDate: question?.endDate || null,
          resolutionSource: question?.resolutionSource || null,
          image: question?.image || null,
          outcomes: question?.outcomes || [],
          liquidity: marketMaker?.liquidity || '0',
          volume: marketMaker?.volume || '0',
          active: marketMaker?.active || true,
          closed: marketMaker?.closed || false,
          archived: marketMaker?.archived || false,
          resolved: marketMaker?.closed || false
        }
      })
    }
    
    // If no data, return empty array
    return []
  } catch (error) {
    console.error('[Polymarket Service] Error fetching markets:', error)
    throw error
  }
}

/**
 * Search for markets by query
 * @param {string} searchQuery - Search term
 * @param {number} limit - Number of results (default: 10)
 * @returns {Promise<Array>} Array of matching markets
 */
export async function searchMarkets(searchQuery, limit = 10) {
  try {
    // Use Polymarket CLOB API REST endpoint for market data
    const clobResponse = await fetch(`${POLYMARKET_CLOB_API}/markets`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!clobResponse.ok) {
      throw new Error(`Polymarket CLOB API error: ${clobResponse.status}`)
    }

    const responseData = await clobResponse.json()
    const markets = responseData.data || []
    
    if (markets.length === 0) {
      return []
    }

    // Filter markets by search query
    const searchLower = searchQuery.toLowerCase().trim()
    
    // Remove common search keywords from query
    const cleanedQuery = searchLower
      .replace(/\b(polymarket|markets|market|show|me|what|whats|on|for|search|find)\b/g, '')
      .trim()
    
    const filteredMarkets = markets
      .filter(market => {
        // If no meaningful search query, return active markets (not archived)
        if (!cleanedQuery || cleanedQuery.length < 2) {
          return market.active && !market.archived
        }
        
        const question = (market.question || '').toLowerCase()
        const slug = (market.market_slug || '').toLowerCase()
        const description = (market.description || '').toLowerCase()
        
        // Match if search query appears in question, slug, or description
        return question.includes(cleanedQuery) || 
               slug.includes(cleanedQuery) || 
               description.includes(cleanedQuery)
      })
      .slice(0, limit)
      .map(market => ({
        id: market.condition_id || market.id || 'unknown',
        conditionId: market.condition_id || market.id || 'unknown',
        questionId: market.question_id || market.id || 'unknown',
        question: market.question || 'Unknown Market',
        slug: market.market_slug || '',
        description: market.description || '',
        endDate: market.end_date_iso || null,
        outcomes: market.tokens ? market.tokens.map(t => t.outcome || 'YES/NO') : ['YES', 'NO'],
        liquidity: market.fpmm?.liquidity || '0',
        volume: market.fpmm?.volume || '0',
        active: market.active === true && !market.archived
      }))
    
    return filteredMarkets
  } catch (error) {
    console.error('[Polymarket Service] Error searching markets:', error)
    return []
  }
}

/**
 * Get sports/game markets
 * @param {number} limit - Number of markets to return (default: 10)
 * @returns {Promise<Array>} Array of sports markets
 */
export async function getSportsMarkets(limit = 10) {
  // Search for sports-related keywords in question titles
  try {
    const sportsKeywords = ['sports', 'game', 'basketball', 'football', 'soccer', 'baseball', 'hockey', 'nba', 'nfl', 'mlb', 'nhl']
    
    // Try to find markets with sports keywords
    const allMarkets = await fetchMarkets({ limit: limit * 2 })
    
    // Filter for sports-related markets
    const sportsMarkets = allMarkets.filter(market => {
      const questionLower = (market.question || '').toLowerCase()
      return sportsKeywords.some(keyword => questionLower.includes(keyword))
    }).slice(0, limit)
    
    return sportsMarkets.length > 0 ? sportsMarkets : allMarkets.slice(0, limit)
  } catch (error) {
    console.error('[Polymarket Service] Error getting sports markets:', error)
    // Fallback to general markets
    return await fetchMarkets({ limit })
  }
}

/**
 * Get a specific market by ID
 * @param {string} marketId - Market ID (condition ID)
 * @returns {Promise<Object>} Market data
 */
export async function getMarketById(marketId) {
  try {
    // ✅ FIX: Query by fixedProductMarketMaker ID
    const query = `
      query GetMarket {
        fixedProductMarketMaker(id: "${marketId}") {
          id
          condition {
            id
          }
          question {
            id
            title
            slug
            description
            endDate
            resolutionSource
            image
            outcomes
          }
          volume
          liquidity
          active
          closed
          archived
        }
      }
    `

    // Try orders subgraph first
    const apiUrl = POLYMARKET_SUBGRAPHS.orders || POLYMARKET_API_URL
    let response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    })
    
    // If fails, try main API URL
    if (!response.ok && apiUrl !== POLYMARKET_API_URL) {
      response = await fetch(POLYMARKET_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      })
    }

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Polymarket API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    if (data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`)
    }

    const marketMaker = data.data?.fixedProductMarketMaker
    if (!marketMaker) {
      // ✅ FIX: Return null gracefully (not an error)
      return null
    }

    // ✅ FIX: Transform to our format - access question through condition
    const condition = marketMaker?.condition
    const question = condition?.question
    const conditionId = condition?.id || marketMaker.id
    
    return {
      id: conditionId,
      conditionId: conditionId,
      questionId: condition?.questionId || question?.id || marketMaker.id,
      question: question?.title || 'Unknown Market',
      slug: question?.slug || '',
      description: question?.description || '',
      endDate: question?.endDate || null,
      resolutionSource: question?.resolutionSource || null,
      image: question?.image || null,
      liquidity: marketMaker?.liquidity || '0',
      volume: marketMaker?.volume || '0',
      outcomes: question?.outcomes || condition?.outcomes || [],
      active: marketMaker?.active || true,
      closed: marketMaker?.closed || false,
      archived: marketMaker?.archived || false,
      resolved: condition?.resolved || marketMaker?.closed || false
    }
  } catch (error) {
    console.error('[Polymarket Service] Error fetching market by ID:', error)
    throw error
  }
}

/**
 * Format market data for display
 * @param {Object} market - Market data from Polymarket
 * @returns {string} Formatted message
 */
export function formatMarket(market) {
  if (!market) return 'Market not found'

  let message = `📊 **${market.question}**\n\n`

  if (market.description) {
    message += `${market.description.substring(0, 200)}...\n\n`
  }

  if (market.outcomes && market.outcomes.length > 0) {
    message += `**Outcomes:**\n`
    // Outcomes might be an array of strings or objects
    market.outcomes.forEach((outcome, index) => {
      if (typeof outcome === 'string') {
        message += `${index + 1}. **${outcome}**\n`
      } else if (outcome.name) {
        const percentage = outcome.price ? (parseFloat(outcome.price) * 100).toFixed(1) : 'N/A'
        message += `${index + 1}. **${outcome.name}**: ${percentage}%\n`
      } else {
        message += `${index + 1}. **${outcome}**\n`
      }
    })
    message += `\n`
  }

  if (market.endDate) {
    const endDate = new Date(market.endDate)
    message += `📅 Ends: ${endDate.toLocaleString()}\n`
  }

  if (market.liquidity) {
    message += `💰 Liquidity: $${parseFloat(market.liquidity).toFixed(2)}\n`
  }

  if (market.volume) {
    message += `📈 Volume: $${parseFloat(market.volume).toFixed(2)}\n`
  }

  message += `\n🔗 Market ID: \`${market.id}\``

  // Add betting instructions
  message += `\n\n💡 **Want to bet on this market?**\n`
  message += `Just say: "bet $[amount] [YES/NO] on [market name]"\n`
  message += `Example: "bet $10 YES on ${market.question.substring(0, 50)}..."`

  return message
}

/**
 * Format multiple markets for display
 * @param {Array} markets - Array of market data
 * @returns {string} Formatted message
 */
export function formatMarketsList(markets) {
  if (!markets || markets.length === 0) {
    return 'No markets found'
  }

  let message = `📊 **Found ${markets.length} Markets:**\n\n`

  markets.forEach((market, index) => {
    message += `${index + 1}. **${market.question}**\n`
    
    if (market.outcomes && market.outcomes.length > 0) {
      const topOutcome = market.outcomes.reduce((prev, curr) => 
        parseFloat(curr.price) > parseFloat(prev.price) ? curr : prev
      )
      const percentage = (parseFloat(topOutcome.price) * 100).toFixed(1)
      message += `   🎯 Top: ${topOutcome.name} (${percentage}%)\n`
    }
    
    // ✅ Display volume and liquidity
    if (market.volume && parseFloat(market.volume) > 0) {
      message += `   📈 Volume: $${parseFloat(market.volume).toLocaleString('en-US', { maximumFractionDigits: 0 })}\n`
    }
    
    if (market.liquidity && parseFloat(market.liquidity) > 0) {
      message += `   💰 Liquidity: $${parseFloat(market.liquidity).toLocaleString('en-US', { maximumFractionDigits: 0 })}\n`
    }
    
    if (market.endDate) {
      const endDate = new Date(market.endDate)
      message += `   📅 Ends: ${endDate.toLocaleDateString()}\n`
    }
    
    message += `   🆔 ID: \`${market.id}\`\n\n`
  })

  return message
}

/**
 * Get prediction insights for a specific game/event
 * @param {string} searchQuery - Search term (e.g., "Lakers vs Warriors", "Super Bowl")
 * @returns {Promise<Object>} Prediction insights
 */
export async function getGamePrediction(searchQuery) {
  try {
    const markets = await searchMarkets(searchQuery, 5)
    
    if (markets.length === 0) {
      return {
        success: false,
        message: `No prediction markets found for "${searchQuery}". Try searching for a specific team, game, or event.`
      }
    }

    // Find the most relevant market (highest liquidity/volume)
    const relevantMarket = markets.reduce((prev, curr) => {
      const prevScore = (parseFloat(prev.liquidity) || 0) + (parseFloat(prev.volume) || 0)
      const currScore = (parseFloat(curr.liquidity) || 0) + (parseFloat(curr.volume) || 0)
      return currScore > prevScore ? curr : prev
    })

    const formatted = formatMarket(relevantMarket)

    return {
      success: true,
      message: formatted,
      market: relevantMarket,
      allMarkets: markets
    }
  } catch (error) {
    console.error('[Polymarket Service] Error getting game prediction:', error)
    return {
      success: false,
      message: `Error fetching prediction data: ${error.message}`
    }
  }
}

/**
 * Get market details with token IDs for YES/NO outcomes
 * @param {string} marketId - Market/condition ID
 * @returns {Promise<Object>} Market with token information
 */
export async function getMarketWithTokens(marketId) {
  try {
    const market = await getMarketById(marketId)
    
    if (!market) {
      return {
        success: false,
        message: 'Market not found'
      }
    }

    // For Polymarket, we need to get token IDs for YES/NO outcomes
    // Token IDs are typically: conditionId + outcome index
    // YES token: conditionId + ":0" or conditionId + ":1"
    // NO token: conditionId + ":1" or conditionId + ":0"
    
    // This is a simplified version - actual implementation would need
    // to query the Polymarket API for exact token IDs
    const yesTokenId = `${market.conditionId}:0`
    const noTokenId = `${market.conditionId}:1`

    return {
      success: true,
      market: {
        ...market,
        tokens: {
          yes: yesTokenId,
          no: noTokenId
        }
      }
    }
  } catch (error) {
    console.error('[Polymarket Service] Error getting market with tokens:', error)
    return {
      success: false,
      message: `Error fetching market: ${error.message}`
    }
  }
}

/**
 * Prepare a bet order (doesn't execute, just prepares the order structure)
 * @param {string} marketId - Market ID
 * @param {string} side - "YES" or "NO"
 * @param {number} amount - Amount in USD to bet
 * @param {number} price - Price per share (0-1, optional, will use market price if not provided)
 * @returns {Promise<Object>} Prepared order
 */
export async function prepareBet(marketId, side, amount, price = null) {
  try {
    // Get market with token information
    const marketData = await getMarketWithTokens(marketId)
    
    if (!marketData.success) {
      return {
        success: false,
        message: marketData.message
      }
    }

    const market = marketData.market
    const sideUpper = side.toUpperCase()
    
    if (sideUpper !== 'YES' && sideUpper !== 'NO') {
      return {
        success: false,
        message: 'Side must be "YES" or "NO"'
      }
    }

    // Determine token ID based on side
    const tokenId = sideUpper === 'YES' ? market.tokens.yes : market.tokens.no
    
    // ✅ FIX: Fetch actual market price if not provided
    let estimatedPrice = price
    if (!estimatedPrice) {
      try {
        const marketPrice = await getMarketPrice(tokenId, sideUpper === 'YES' ? 'buy' : 'sell')
        if (marketPrice && marketPrice > 0 && marketPrice <= 1) {
          estimatedPrice = marketPrice
          console.log(`[Polymarket] Fetched market price for ${sideUpper}: ${estimatedPrice}`)
        } else {
          console.warn(`[Polymarket] Invalid price from API, using default 0.5`)
          estimatedPrice = 0.5
        }
      } catch (priceError) {
        console.error('[Polymarket] Error fetching price in prepareBet:', priceError.message)
        estimatedPrice = 0.5 // Fallback
      }
    }
    
    // Calculate number of shares
    const shares = amount / estimatedPrice

    // Prepare order structure (this would be signed and sent to CLOB API)
    const order = {
      marketId: market.id,
      marketQuestion: market.question,
      side: sideUpper,
      tokenId: tokenId,
      amount: amount,
      price: estimatedPrice,
      shares: shares,
      orderType: 'GTC', // Good-Till-Cancelled
      timestamp: Date.now()
    }

    return {
      success: true,
      order: order,
      market: market,
      message: `Prepared ${sideUpper} bet for "${market.question}": $${amount} at ~${(estimatedPrice * 100).toFixed(1)}%`
    }
  } catch (error) {
    console.error('[Polymarket Service] Error preparing bet:', error)
    return {
      success: false,
      message: `Error preparing bet: ${error.message}`
    }
  }
}

/**
 * Format bet confirmation message
 * @param {Object} order - Order object from prepareBet
 * @returns {string} Formatted message
 */
export function formatBetConfirmation(order) {
  const market = order.market
  const orderData = order.order
  
  let message = `🎯 **Bet Prepared**\n\n`
  message += `**Market:** ${market.question}\n`
  message += `**Side:** ${orderData.side}\n`
  message += `**Amount:** $${orderData.amount}\n`
  message += `**Price:** ${(orderData.price * 100).toFixed(1)}%\n`
  message += `**Shares:** ${orderData.shares.toFixed(2)}\n\n`
  
  if (market.endDate) {
    const endDate = new Date(market.endDate)
    message += `📅 Market ends: ${endDate.toLocaleDateString()}\n`
  }
  
  message += `\n⚠️ **Note:** This is a prepared order. Actual execution requires wallet signature and payment.`
  
  return message
}

/**
 * Get market price from Polymarket CLOB API
 * ✅ FIX: Fetch actual market price from orderbook
 * @param {string} tokenId - Token ID for the market side
 * @param {string} side - "buy" or "sell" (buy = best ask, sell = best bid)
 * @returns {Promise<number>} Market price (0-1)
 */
export async function getMarketPrice(tokenId, side = 'buy') {
  try {
    // Polymarket CLOB API: GET /price?token_id={tokenId}&side={side}
    const url = `${POLYMARKET_CLOB_API}/price?token_id=${tokenId}&side=${side}`
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Polymarket CLOB API error: ${response.status}`)
    }

    const data = await response.json()
    
    if (data.price) {
      const price = parseFloat(data.price)
      // Validate price is between 0 and 1
      if (price >= 0 && price <= 1) {
        return price
      }
    }
    
    throw new Error('Invalid price response from Polymarket API')
  } catch (error) {
    console.error('[Polymarket Service] Error fetching market price:', error)
    throw error
  }
}

/**
 * Get actual token IDs from Polymarket for a condition
 * @param {string} conditionId - Condition ID
 * @returns {Promise<Object>} Token IDs for YES and NO
 */
export async function getTokenIdsForCondition(conditionId) {
  try {
    // ✅ FIX: Query fixedProductMarketMaker to get question outcomes
    const query = `
      query GetConditionTokens {
        fixedProductMarketMakers(
          first: 1
          where: {
            condition_: {
              id: "${conditionId}"
            }
          }
          orderBy: createdAt
          orderDirection: desc
        ) {
          id
          condition {
            id
          }
          question {
            id
            outcomes
          }
        }
      }
    `

    // Try orders subgraph first
    const apiUrl = POLYMARKET_SUBGRAPHS.orders || POLYMARKET_API_URL
    let response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    })
    
    // If fails, try main API URL
    if (!response.ok && apiUrl !== POLYMARKET_API_URL) {
      response = await fetch(POLYMARKET_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      })
    }

    if (!response.ok) {
      // Fallback to standard format
      return {
        yes: `${conditionId}:0`,
        no: `${conditionId}:1`
      }
    }

    // Try single marketMaker first
    let marketMaker = data.data?.fixedProductMarketMaker
    if (!marketMaker) {
      // Try from array
      const marketMakers = data.data?.fixedProductMarketMakers || []
      marketMaker = marketMakers.find(m => m.id === conditionId || m.condition?.id === conditionId) || marketMakers[0]
    }

    if (marketMaker) {
      const condition = marketMaker?.condition
      const question = condition?.question
      const actualConditionId = condition?.id || marketMaker.id || conditionId
      const outcomes = question?.outcomes || condition?.outcomes || []
      
      // ✅ FIX: Outcomes is an array of strings
      // Token IDs are typically: conditionId + ":0" for first outcome, conditionId + ":1" for second
      // For YES/NO markets, first outcome is usually YES, second is NO
      let yesIndex = 0
      let noIndex = 1
      
      if (outcomes.length > 0) {
        // Try to find YES/NO by name
        const yesPos = outcomes.findIndex(o => 
          typeof o === 'string' ? o.toLowerCase().includes('yes') : o?.toLowerCase().includes('yes')
        )
        const noPos = outcomes.findIndex(o => 
          typeof o === 'string' ? o.toLowerCase().includes('no') : o?.toLowerCase().includes('no')
        )
        
        if (yesPos >= 0) yesIndex = yesPos
        if (noPos >= 0) noIndex = noPos
      }
      
      return {
        yes: `${actualConditionId}:${yesIndex}`,
        no: `${actualConditionId}:${noIndex}`
      }
    }

    // Default fallback
    return {
      yes: `${conditionId}:0`,
      no: `${conditionId}:1`
    }
  } catch (error) {
    console.error('[Polymarket Service] Error getting token IDs:', error)
    // Fallback
    return {
      yes: `${conditionId}:0`,
      no: `${conditionId}:1`
    }
  }
}

/**
 * Sign an order for Polymarket CLOB API
 * @param {Object} order - Order object
 * @param {string} privateKey - User's private key
 * @returns {Promise<Object>} Signed order
 */
export async function signPolymarketOrder(order, privateKey) {
  try {
    // Create wallet from private key
    const wallet = new ethers.Wallet(privateKey)
    
    // Polymarket order structure for CLOB API
    const orderToSign = {
      salt: Date.now().toString(), // Unique salt
      maker: wallet.address.toLowerCase(),
      signer: wallet.address.toLowerCase(),
      taker: '0x0000000000000000000000000000000000000000', // No specific taker
      tokenId: order.tokenId,
      makerAmount: ethers.parseUnits(order.shares.toString(), 18).toString(), // Shares in wei
      takerAmount: ethers.parseUnits((order.amount * order.price).toString(), 6).toString(), // Cost in USDC (6 decimals)
      expiration: Math.floor(Date.now() / 1000) + 86400, // 24 hours
      nonce: Date.now(),
      feeRateBps: 0, // No fee for now
      side: order.side === 'YES' ? 'BUY' : 'SELL',
      signatureType: 1 // EIP-712
    }

    // Create EIP-712 domain
    const domain = {
      name: 'Polymarket',
      version: '1',
      chainId: 137, // Polygon (Polymarket is on Polygon)
      verifyingContract: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E' // Polymarket CLOB contract
    }

    // EIP-712 types
    const types = {
      Order: [
        { name: 'salt', type: 'uint256' },
        { name: 'maker', type: 'address' },
        { name: 'signer', type: 'address' },
        { name: 'taker', type: 'address' },
        { name: 'tokenId', type: 'uint256' },
        { name: 'makerAmount', type: 'uint256' },
        { name: 'takerAmount', type: 'uint256' },
        { name: 'expiration', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'feeRateBps', type: 'uint256' },
        { name: 'side', type: 'string' },
        { name: 'signatureType', type: 'uint256' }
      ]
    }

    // Sign the order
    const signature = await wallet.signTypedData(domain, types, orderToSign)
    
    return {
      ...orderToSign,
      signature,
      signedBy: wallet.address
    }
  } catch (error) {
    console.error('[Polymarket Service] Error signing order:', error)
    throw error
  }
}

/**
 * Place an order on Polymarket CLOB API
 * @param {Object} signedOrder - Signed order object
 * @param {string} orderType - Order type (GTC, FOK, GTD)
 * @returns {Promise<Object>} Order result
 */
export async function placePolymarketOrder(signedOrder, orderType = 'GTC') {
  try {
    const response = await fetch(`${POLYMARKET_CLOB_API}/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        order: signedOrder,
        owner: signedOrder.signedBy,
        orderType: orderType
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Polymarket CLOB API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    return {
      success: true,
      orderId: data.orderId || data.id,
      orderHash: data.orderHash || data.hash,
      data: data
    }
  } catch (error) {
    console.error('[Polymarket Service] Error placing order:', error)
    throw error
  }
}

/**
 * Execute a bet (full flow: prepare, sign, place order)
 * @param {string} userId - Telegram user ID
 * @param {string} marketId - Market ID
 * @param {string} side - YES or NO
 * @param {number} amount - Amount in USD
 * @param {string} privateKey - User's private key
 * @param {number} price - Optional price (will use market price if not provided)
 * @returns {Promise<Object>} Execution result
 */
export async function executeBet(userId, marketId, side, amount, privateKey, price = null) {
  try {
    // Step 1: Get market with token IDs
    const marketData = await getMarketWithTokens(marketId)
    if (!marketData.success) {
      return {
        success: false,
        message: marketData.message
      }
    }

    const market = marketData.market
    
    // Step 2: Get actual token IDs
    const tokens = await getTokenIdsForCondition(market.conditionId)
    const tokenId = side.toUpperCase() === 'YES' ? tokens.yes : tokens.no

    // Step 3: Get current market price (if not provided)
    let betPrice = price
    if (!betPrice) {
      // ✅ FIX: Fetch actual market price from Polymarket CLOB API
      try {
        const marketPrice = await getMarketPrice(tokenId, side.toUpperCase() === 'YES' ? 'buy' : 'sell')
        if (marketPrice && marketPrice > 0 && marketPrice <= 1) {
          betPrice = marketPrice
          console.log(`[Polymarket] Fetched market price for ${side}: ${betPrice}`)
        } else {
          console.warn(`[Polymarket] Invalid price from API: ${marketPrice}, using default 0.5`)
          betPrice = 0.5
        }
      } catch (priceError) {
        console.error('[Polymarket] Error fetching market price:', priceError.message)
        console.log('[Polymarket] Using default price 0.5')
        betPrice = 0.5 // Fallback to default
      }
    }

    const shares = amount / betPrice

    // Step 3.5: Check if bridge is needed (Polymarket is on Polygon, user might be on Base)
    const wallet = new ethers.Wallet(privateKey)
    const bridgeStatus = await checkBridgeNeeded(
      wallet.address,
      'USDC',
      amount,
      CHAINS.BASE.chainId, // Source: Base
      CHAINS.POLYGON.chainId // Target: Polygon
    )

    if (bridgeStatus.needsBridge) {
      return {
        success: false,
        needsBridge: true,
        message: bridgeStatus.message,
        bridgeInfo: {
          fromChain: bridgeStatus.sourceChain,
          toChain: bridgeStatus.targetChain,
          amount: bridgeStatus.shortfall,
          polygonBalance: bridgeStatus.targetBalance,
          canBridge: bridgeStatus.canBridge
        }
      }
    }

    // Step 4: Prepare order
    const order = {
      marketId: market.id,
      marketQuestion: market.question,
      side: side.toUpperCase(),
      tokenId: tokenId,
      amount: amount,
      price: betPrice,
      shares: shares,
      orderType: 'GTC',
      timestamp: Date.now()
    }

    // Step 5: Sign order
    const signedOrder = await signPolymarketOrder(order, privateKey)

    // Step 6: Place order on Polymarket
    const orderResult = await placePolymarketOrder(signedOrder, 'GTC')

    // Step 7: Store bet in database
    const betRecord = await dbRun(
      `INSERT INTO polymarket_bets 
       (user_id, market_id, market_question, side, token_id, amount, price, shares, order_id, order_hash, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted')`,
      [
        userId,
        market.id,
        market.question,
        side.toUpperCase(),
        tokenId,
        amount,
        betPrice,
        shares,
        orderResult.orderId,
        orderResult.orderHash
      ]
    )

    return {
      success: true,
      orderId: orderResult.orderId,
      orderHash: orderResult.orderHash,
      betId: betRecord.lastID,
      message: `✅ Bet placed successfully!\n\n` +
        `Market: ${market.question}\n` +
        `Side: ${side.toUpperCase()}\n` +
        `Amount: $${amount}\n` +
        `Price: ${(betPrice * 100).toFixed(1)}%\n` +
        `Order ID: ${orderResult.orderId}\n\n` +
        `Your bet is now active on Polymarket! 🎯`
    }
  } catch (error) {
    console.error('[Polymarket Service] Error executing bet:', error)
    return {
      success: false,
      message: `Error placing bet: ${error.message}`
    }
  }
}

/**
 * Get user's active bets
 * @param {string} userId - Telegram user ID
 * @returns {Promise<Array>} Array of bet records
 */
export async function getUserBets(userId) {
  try {
    const bets = await dbAll(
      `SELECT * FROM polymarket_bets 
       WHERE user_id = ? AND status IN ('pending', 'submitted', 'filled')
       ORDER BY created_at DESC`,
      [userId]
    )
    return bets
  } catch (error) {
    console.error('[Polymarket Service] Error getting user bets:', error)
    return []
  }
}

/**
 * Format user bets for display
 * @param {Array} bets - Array of bet records
 * @returns {string} Formatted message
 */
export function formatUserBets(bets) {
  if (!bets || bets.length === 0) {
    return "📊 **Your Active Bets**\n\nYou don't have any active bets yet.\n\nPlace a bet by saying:\n• \"Bet $10 YES on Russia Ukraine ceasefire\""
  }

  let message = `📊 **Your Active Bets** (${bets.length})\n\n`

  bets.forEach((bet, index) => {
    message += `${index + 1}. **${bet.market_question}**\n`
    message += `   ${bet.side === 'YES' ? '✅' : '❌'} ${bet.side} - $${bet.amount}\n`
    message += `   Price: ${(bet.price * 100).toFixed(1)}%\n`
    message += `   Status: ${bet.status}\n`
    if (bet.order_id) {
      message += `   Order ID: \`${bet.order_id}\`\n`
    }
    message += `\n`
  })

  return message
}



