import { dbAll, dbGet } from './database.js'
import { TOKENS } from './config.js'
import { ethers } from 'ethers'

/**
 * Enhanced Analytics and Payment Statistics Service
 * Provides comprehensive transaction reports and insights
 */

/**
 * Get comprehensive payment statistics
 * @param {string} walletAddress - Wallet address
 * @param {Object} options - Options for filtering (timeRange, token, etc.)
 * @returns {Promise<Object>} Payment statistics
 */
export const getPaymentStatistics = async (walletAddress, options = {}) => {
  const {
    timeRange = 'all', // 'all', '7d', '30d', '90d', '1y'
    tokenSymbol = null,
    limit = 1000
  } = options

  try {
    // Calculate time range
    const now = Math.floor(Date.now() / 1000)
    let timeFilter = ''
    const params = [walletAddress.toLowerCase(), walletAddress.toLowerCase()]
    
    if (timeRange !== 'all') {
      let secondsAgo = 0
      switch (timeRange) {
        case '7d':
          secondsAgo = 7 * 24 * 60 * 60
          break
        case '30d':
          secondsAgo = 30 * 24 * 60 * 60
          break
        case '90d':
          secondsAgo = 90 * 24 * 60 * 60
          break
        case '1y':
          secondsAgo = 365 * 24 * 60 * 60
          break
      }
      timeFilter = 'AND created_at >= ?'
      params.push(now - secondsAgo)
    }

    // Get all transactions
    let query = `
      SELECT * FROM payments 
      WHERE (LOWER(from_address) = LOWER(?) OR LOWER(to_address) = LOWER(?))
      ${timeFilter}
      ORDER BY created_at DESC 
      LIMIT ?
    `
    params.push(limit)

    const transactions = await dbAll(query, params)

    // Filter by token if specified
    let filteredTransactions = transactions
    if (tokenSymbol && TOKENS[tokenSymbol]) {
      const tokenAddress = TOKENS[tokenSymbol].address.toLowerCase()
      filteredTransactions = transactions.filter(tx => 
        tx.token_address?.toLowerCase() === tokenAddress
      )
    }

    // Calculate statistics
    const stats = {
      timeRange,
      tokenSymbol: tokenSymbol || 'all',
      totalTransactions: filteredTransactions.length,
      sent: {
        count: 0,
        totalAmount: 0,
        averageAmount: 0,
        largestAmount: 0,
        smallestAmount: Infinity,
        totalFees: 0
      },
      received: {
        count: 0,
        totalAmount: 0,
        averageAmount: 0,
        largestAmount: 0,
        smallestAmount: Infinity
      },
      netFlow: 0,
      byToken: {},
      byDay: {},
      byRecipient: {},
      bySender: {},
      timeline: []
    }

    const walletLower = walletAddress.toLowerCase()

    for (const tx of filteredTransactions) {
      const amount = parseFloat(tx.amount || 0)
      const fee = parseFloat(tx.fee || 0)
      const isSent = tx.from_address?.toLowerCase() === walletLower
      
      // Determine token symbol
      const tokenAddr = tx.token_address?.toLowerCase()
      const tokenKey = Object.keys(TOKENS).find(s => 
        TOKENS[s].address?.toLowerCase() === tokenAddr
      ) || 'UNKNOWN'

      if (isSent) {
        stats.sent.count++
        stats.sent.totalAmount += amount
        stats.sent.totalFees += fee
        if (amount > stats.sent.largestAmount) stats.sent.largestAmount = amount
        if (amount < stats.sent.smallestAmount) stats.sent.smallestAmount = amount
      } else {
        stats.received.count++
        stats.received.totalAmount += amount
        if (amount > stats.received.largestAmount) stats.received.largestAmount = amount
        if (amount < stats.received.smallestAmount) stats.received.smallestAmount = amount
      }

      // By token
      if (!stats.byToken[tokenKey]) {
        stats.byToken[tokenKey] = {
          sent: { count: 0, amount: 0 },
          received: { count: 0, amount: 0 }
        }
      }
      if (isSent) {
        stats.byToken[tokenKey].sent.count++
        stats.byToken[tokenKey].sent.amount += amount
      } else {
        stats.byToken[tokenKey].received.count++
        stats.byToken[tokenKey].received.amount += amount
      }

      // By day
      if (tx.created_at) {
        const date = new Date(tx.created_at * 1000)
        const dayKey = date.toISOString().split('T')[0] // YYYY-MM-DD
        if (!stats.byDay[dayKey]) {
          stats.byDay[dayKey] = { sent: 0, received: 0, count: 0 }
        }
        if (isSent) {
          stats.byDay[dayKey].sent += amount
        } else {
          stats.byDay[dayKey].received += amount
        }
        stats.byDay[dayKey].count++
      }

      // By recipient (for sent transactions)
      if (isSent && tx.to_username) {
        const recipient = tx.to_username.toLowerCase()
        if (!stats.byRecipient[recipient]) {
          stats.byRecipient[recipient] = { count: 0, total: 0 }
        }
        stats.byRecipient[recipient].count++
        stats.byRecipient[recipient].total += amount
      }

      // By sender (for received transactions)
      if (!isSent && tx.from_username) {
        const sender = tx.from_username.toLowerCase()
        if (!stats.bySender[sender]) {
          stats.bySender[sender] = { count: 0, total: 0 }
        }
        stats.bySender[sender].count++
        stats.bySender[sender].total += amount
      }

      // Timeline
      if (tx.created_at) {
        stats.timeline.push({
          date: new Date(tx.created_at * 1000),
          type: isSent ? 'sent' : 'received',
          amount,
          token: tokenKey,
          counterparty: isSent ? tx.to_username : tx.from_username,
          txHash: tx.tx_hash
        })
      }
    }

    // Calculate averages
    if (stats.sent.count > 0) {
      stats.sent.averageAmount = stats.sent.totalAmount / stats.sent.count
      if (stats.sent.smallestAmount === Infinity) stats.sent.smallestAmount = 0
    } else {
      stats.sent.smallestAmount = 0
    }

    if (stats.received.count > 0) {
      stats.received.averageAmount = stats.received.totalAmount / stats.received.count
      if (stats.received.smallestAmount === Infinity) stats.received.smallestAmount = 0
    } else {
      stats.received.smallestAmount = 0
    }

    // Calculate net flow
    stats.netFlow = stats.received.totalAmount - stats.sent.totalAmount

    // Sort recipients and senders
    stats.topRecipients = Object.entries(stats.byRecipient)
      .map(([username, data]) => ({ username, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)

    stats.topSenders = Object.entries(stats.bySender)
      .map(([username, data]) => ({ username, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)

    return stats
  } catch (error) {
    console.error('[Analytics] Error getting payment statistics:', error)
    throw error
  }
}

/**
 * Generate transaction report
 * @param {string} walletAddress - Wallet address
 * @param {Object} options - Report options
 * @returns {Promise<Object>} Transaction report
 */
export const generateTransactionReport = async (walletAddress, options = {}) => {
  const {
    timeRange = '30d',
    format = 'summary', // 'summary', 'detailed', 'full'
    includeCharts = false
  } = options

  try {
    const stats = await getPaymentStatistics(walletAddress, { timeRange })

    const report = {
      walletAddress,
      generatedAt: new Date().toISOString(),
      timeRange,
      format,
      summary: {
        totalTransactions: stats.totalTransactions,
        totalSent: stats.sent.totalAmount,
        totalReceived: stats.received.totalAmount,
        netFlow: stats.netFlow,
        totalFees: stats.sent.totalFees,
        period: timeRange
      },
      breakdown: {
        byToken: stats.byToken,
        topRecipients: stats.topRecipients.slice(0, 5),
        topSenders: stats.topSenders.slice(0, 5),
        dailyActivity: Object.entries(stats.byDay)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-30) // Last 30 days
          .map(([date, data]) => ({ date, ...data }))
      },
      insights: generateReportInsights(stats)
    }

    if (format === 'detailed' || format === 'full') {
      report.detailedStats = {
        sent: stats.sent,
        received: stats.received
      }
    }

    if (format === 'full') {
      report.timeline = stats.timeline
    }

    return report
  } catch (error) {
    console.error('[Analytics] Error generating transaction report:', error)
    throw error
  }
}

/**
 * Generate insights from statistics
 * @param {Object} stats - Payment statistics
 * @returns {Array<string>} Array of insight strings
 */
export const generateReportInsights = (stats) => {
  const insights = []

  if (stats.totalTransactions === 0) {
    insights.push('No transactions found in this period.')
    return insights
  }

  // Net flow insights
  if (stats.netFlow > 0) {
    insights.push(`💰 Net positive flow: You received $${stats.netFlow.toFixed(2)} more than you sent.`)
  } else if (stats.netFlow < 0) {
    insights.push(`📤 Net negative flow: You sent $${Math.abs(stats.netFlow).toFixed(2)} more than you received.`)
  } else {
    insights.push('⚖️ Balanced: Your sent and received amounts are equal.')
  }

  // Transaction frequency
  const avgPerDay = stats.totalTransactions / Object.keys(stats.byDay).length
  if (avgPerDay > 5) {
    insights.push(`🚀 High activity: Averaging ${avgPerDay.toFixed(1)} transactions per day.`)
  } else if (avgPerDay > 1) {
    insights.push(`📊 Moderate activity: Averaging ${avgPerDay.toFixed(1)} transactions per day.`)
  } else {
    insights.push(`📉 Low activity: Averaging ${avgPerDay.toFixed(1)} transactions per day.`)
  }

  // Top recipient insight
  if (stats.topRecipients.length > 0) {
    const top = stats.topRecipients[0]
    insights.push(`👤 Most frequent recipient: @${top.username} (${top.count} payments, $${top.total.toFixed(2)})`)
  }

  // Token distribution
  const tokenCount = Object.keys(stats.byToken).length
  if (tokenCount > 1) {
    insights.push(`🪙 Multi-token usage: Transactions across ${tokenCount} different tokens.`)
  }

  // Fee insights
  if (stats.sent.totalFees > 0) {
    const feePercentage = (stats.sent.totalFees / stats.sent.totalAmount) * 100
    insights.push(`💸 Total fees paid: $${stats.sent.totalFees.toFixed(2)} (${feePercentage.toFixed(2)}% of sent amount)`)
  }

  // Largest transaction
  const largestSent = stats.sent.largestAmount
  const largestReceived = stats.received.largestAmount
  if (largestSent > 0 || largestReceived > 0) {
    const largest = Math.max(largestSent, largestReceived)
    insights.push(`📈 Largest transaction: $${largest.toFixed(2)}`)
  }

  return insights
}

/**
 * Format statistics for display
 * @param {Object} stats - Payment statistics
 * @returns {string} Formatted message
 */
export const formatStatisticsMessage = (stats) => {
  let message = `📊 **Payment Statistics** (${stats.timeRange})\n\n`

  // Summary
  message += `📈 **Summary:**\n`
  message += `• Total Transactions: ${stats.totalTransactions}\n`
  message += `• Total Sent: $${stats.sent.totalAmount.toFixed(2)}\n`
  message += `• Total Received: $${stats.received.totalAmount.toFixed(2)}\n`
  message += `• Net Flow: $${stats.netFlow >= 0 ? '+' : ''}${stats.netFlow.toFixed(2)}\n`
  message += `• Total Fees: $${stats.sent.totalFees.toFixed(2)}\n\n`

  // Sent breakdown
  if (stats.sent.count > 0) {
    message += `📤 **Sent:**\n`
    message += `• Count: ${stats.sent.count}\n`
    message += `• Average: $${stats.sent.averageAmount.toFixed(2)}\n`
    message += `• Largest: $${stats.sent.largestAmount.toFixed(2)}\n`
    message += `• Smallest: $${stats.sent.smallestAmount.toFixed(2)}\n\n`
  }

  // Received breakdown
  if (stats.received.count > 0) {
    message += `📥 **Received:**\n`
    message += `• Count: ${stats.received.count}\n`
    message += `• Average: $${stats.received.averageAmount.toFixed(2)}\n`
    message += `• Largest: $${stats.received.largestAmount.toFixed(2)}\n`
    message += `• Smallest: $${stats.received.smallestAmount.toFixed(2)}\n\n`
  }

  // Top recipients
  if (stats.topRecipients.length > 0) {
    message += `👥 **Top Recipients:**\n`
    stats.topRecipients.slice(0, 5).forEach((recipient, idx) => {
      message += `${idx + 1}. @${recipient.username}: $${recipient.total.toFixed(2)} (${recipient.count} tx)\n`
    })
    message += `\n`
  }

  // By token
  const tokenEntries = Object.entries(stats.byToken)
  if (tokenEntries.length > 0) {
    message += `🪙 **By Token:**\n`
    tokenEntries.forEach(([token, data]) => {
      message += `• ${token}: Sent $${data.sent.amount.toFixed(2)}, Received $${data.received.amount.toFixed(2)}\n`
    })
    message += `\n`
  }

  return message
}

/**
 * Format transaction report for display
 * @param {Object} report - Transaction report
 * @returns {string} Formatted message
 */
export const formatReportMessage = (report) => {
  let message = `📋 **Transaction Report**\n\n`
  message += `📅 Period: ${report.timeRange}\n`
  message += `📊 Generated: ${new Date(report.generatedAt).toLocaleString()}\n\n`

  // Summary
  message += `📈 **Summary:**\n`
  message += `• Total Transactions: ${report.summary.totalTransactions}\n`
  message += `• Total Sent: $${report.summary.totalSent.toFixed(2)}\n`
  message += `• Total Received: $${report.summary.totalReceived.toFixed(2)}\n`
  message += `• Net Flow: $${report.summary.netFlow >= 0 ? '+' : ''}${report.summary.netFlow.toFixed(2)}\n`
  message += `• Total Fees: $${report.summary.totalFees.toFixed(2)}\n\n`

  // Top recipients
  if (report.breakdown.topRecipients.length > 0) {
    message += `👥 **Top Recipients:**\n`
    report.breakdown.topRecipients.forEach((recipient, idx) => {
      message += `${idx + 1}. @${recipient.username}: $${recipient.total.toFixed(2)} (${recipient.count} tx)\n`
    })
    message += `\n`
  }

  // Top senders
  if (report.breakdown.topSenders.length > 0) {
    message += `📥 **Top Senders:**\n`
    report.breakdown.topSenders.forEach((sender, idx) => {
      message += `${idx + 1}. @${sender.username}: $${sender.total.toFixed(2)} (${sender.count} tx)\n`
    })
    message += `\n`
  }

  // Insights
  if (report.insights.length > 0) {
    message += `💡 **Insights:**\n`
    report.insights.forEach((insight, idx) => {
      message += `${idx + 1}. ${insight}\n`
    })
    message += `\n`
  }

  return message
}

