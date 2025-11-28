import { API_URL } from './config'

export const api = {
  // Username endpoints
  async registerUsername(username, address) {
    const response = await fetch(`${API_URL}/username/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, address })
    })
    return response.json()
  },

  async lookupUsername(username) {
    const response = await fetch(`${API_URL}/username/${username}`)
    return response.json()
  },

  async lookupAddress(address) {
    const response = await fetch(`${API_URL}/username/by-address/${address}`)
    return response.json()
  },

  // Payment endpoints
  async createPaymentIntent(fromUsername, toUsername, amount, token) {
    const response = await fetch(`${API_URL}/payment/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromUsername, toUsername, amount, token })
    })
    return response.json()
  },

  async getPaymentStatus(txHash) {
    const response = await fetch(`${API_URL}/payment/${txHash}`)
    return response.json()
  },

  async generateReceipt(txHash) {
    const response = await fetch(`${API_URL}/payment/receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txHash })
    })
    return response.json()
  },

  // Transaction history
  async getTransactions(address) {
    const response = await fetch(`${API_URL}/transactions/${address}`)
    return response.json()
  }
}


