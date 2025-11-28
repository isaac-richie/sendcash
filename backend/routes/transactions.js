import express from 'express'
import { dbAll } from '../services/database.js'

const router = express.Router()

// Get transactions for an address
router.get('/:address', async (req, res) => {
  try {
    const { address } = req.params
    
    // Get sent transactions
    const sent = await dbAll(
      `SELECT * FROM payments 
       WHERE from_address = ? 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [address]
    )
    
    // Get received transactions
    const received = await dbAll(
      `SELECT * FROM payments 
       WHERE to_address = ? 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [address]
    )
    
    // Combine and format
    const transactions = [
      ...sent.map(tx => ({
        ...tx,
        type: 'sent',
        timestamp: tx.created_at * 1000
      })),
      ...received.map(tx => ({
        ...tx,
        type: 'received',
        timestamp: tx.created_at * 1000
      }))
    ].sort((a, b) => b.timestamp - a.timestamp)
    
    res.json({ transactions })
  } catch (error) {
    console.error('Error getting transactions:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export { router as transactionRoutes }


