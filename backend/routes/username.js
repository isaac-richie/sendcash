import express from 'express'
import { ethers } from 'ethers'
import { dbGet, dbRun, dbAll } from '../services/database.js'
import { CONTRACTS, BASE_RPC } from '../services/config.js'

const router = express.Router()

// Get address for username
router.get('/:username', async (req, res) => {
  try {
    const { username } = req.params
    const cleanUsername = username.toLowerCase().replace('@', '')
    
    // Check cache first
    const cached = await dbGet('SELECT * FROM usernames WHERE username = ?', [cleanUsername])
    if (cached) {
      return res.json({ username: cleanUsername, address: cached.address, isPremium: cached.is_premium === 1 })
    }
    
    // Query on-chain if not in cache (use centralized service)
    const { getUsernameRegistry } = await import('../services/contracts.js')
    const registry = getUsernameRegistry()
    
    // ✅ FIX: Use usernameToAddress mapping directly instead of getAddress()
    const address = await registry.usernameToAddress(cleanUsername)
    if (address && address !== ethers.ZeroAddress) {
      // Cache it
      await dbRun(
        'INSERT OR REPLACE INTO usernames (username, address) VALUES (?, ?)',
        [cleanUsername, address]
      )
      return res.json({ username: cleanUsername, address, isPremium: false })
    }
    
    res.status(404).json({ error: 'Username not found' })
  } catch (error) {
    console.error('Error looking up username:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get username for address
router.get('/by-address/:address', async (req, res) => {
  try {
    const { address } = req.params
    
    // Check cache first
    const cached = await dbGet('SELECT * FROM usernames WHERE address = ?', [address])
    if (cached) {
      return res.json({ address, username: cached.username, isPremium: cached.is_premium === 1 })
    }
    
    // Query on-chain (use centralized service)
    const { getUsernameRegistry } = await import('../services/contracts.js')
    const registry = getUsernameRegistry()
    
    const username = await registry.getUsername(address)
    if (username && username.length > 0) {
      // Cache it
      await dbRun(
        'INSERT OR REPLACE INTO usernames (username, address) VALUES (?, ?)',
        [username, address]
      )
      return res.json({ address, username, isPremium: false })
    }
    
    res.json({ address, username: null })
  } catch (error) {
    console.error('Error looking up address:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Register username (cache update)
router.post('/register', async (req, res) => {
  try {
    const { username, address } = req.body
    const cleanUsername = username.toLowerCase().replace('@', '')
    
    await dbRun(
      'INSERT OR REPLACE INTO usernames (username, address) VALUES (?, ?)',
      [cleanUsername, address]
    )
    
    res.json({ success: true, username: cleanUsername, address })
  } catch (error) {
    console.error('Error registering username:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export { router as usernameRoutes }

