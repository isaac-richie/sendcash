import express from 'express'
import { dbRun, dbGet } from '../services/database.js'
import { ethers } from 'ethers'
import { BASE_RPC } from '../services/config.js'

const router = express.Router()

// Create payment intent
router.post('/create', async (req, res) => {
  try {
    const { fromUsername, toUsername, amount, token } = req.body
    
    // Store payment intent (can be used for tracking)
    res.json({ 
      success: true,
      message: 'Payment intent created. Proceed with on-chain transaction.'
    })
  } catch (error) {
    console.error('Error creating payment intent:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get payment status
router.get('/:txHash', async (req, res) => {
  try {
    const { txHash } = req.params
    
    // Check database
    const payment = await dbGet('SELECT * FROM payments WHERE tx_hash = ?', [txHash])
    if (payment) {
      return res.json(payment)
    }
    
    // Check on-chain
    const provider = new ethers.JsonRpcProvider(BASE_RPC)
    const receipt = await provider.getTransactionReceipt(txHash)
    
    if (receipt) {
      const status = receipt.status === 1 ? 'confirmed' : 'failed'
      res.json({ txHash, status, blockNumber: receipt.blockNumber })
    } else {
      res.status(404).json({ error: 'Transaction not found' })
    }
  } catch (error) {
    console.error('Error getting payment status:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Generate receipt
router.post('/receipt', async (req, res) => {
  try {
    const { txHash } = req.body
    
    // Get payment data
    const payment = await dbGet('SELECT * FROM payments WHERE tx_hash = ?', [txHash])
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' })
    }
    
    // Generate shareable link
    const baseUrl = process.env.APP_URL || 'https://sendcash.app'
    const shareLink = `${baseUrl}/receipt/${txHash}`
    
    // Store receipt
    await dbRun(
      'INSERT OR REPLACE INTO receipts (tx_hash, share_link) VALUES (?, ?)',
      [txHash, shareLink]
    )
    
    res.json({ 
      txHash,
      shareLink,
      payment: {
        from: payment.from_username || payment.from_address,
        to: payment.to_username || payment.to_address,
        amount: payment.amount,
        token: payment.token_address
      }
    })
  } catch (error) {
    console.error('Error generating receipt:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Store payment (called after on-chain confirmation)
router.post('/store', async (req, res) => {
  try {
    const { txHash, fromAddress, toAddress, fromUsername, toUsername, tokenAddress, amount, fee } = req.body
    
    await dbRun(
      `INSERT OR REPLACE INTO payments 
       (tx_hash, from_address, to_address, from_username, to_username, token_address, amount, fee, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')`,
      [txHash, fromAddress, toAddress, fromUsername, toUsername, tokenAddress, amount, fee || '0']
    )
    
    res.json({ success: true })
  } catch (error) {
    console.error('Error storing payment:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export { router as paymentRoutes }

