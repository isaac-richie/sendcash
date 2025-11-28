import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ethers } from 'ethers'
import { getSendCash, getTokenContract, parseTokenAmount, formatTokenAmount } from '../lib/web3'
import { TOKENS } from '../lib/config'
import { api } from '../lib/api'
import WebApp from '@twa-dev/sdk'

const Send = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [username, setUsername] = useState(searchParams.get('username') || '')
  const [amount, setAmount] = useState(searchParams.get('amount') || '')
  const [selectedToken, setSelectedToken] = useState(TOKENS.USDC)
  const [loading, setLoading] = useState(false)
  const [recipientAddress, setRecipientAddress] = useState('')

  useEffect(() => {
    if (username) {
      lookupUsername()
    }
  }, [username])

  const lookupUsername = async () => {
    if (!username) return
    try {
      const data = await api.lookupUsername(username.replace('@', ''))
      if (data.address) {
        setRecipientAddress(data.address)
      } else {
        setRecipientAddress('')
        WebApp.showAlert('Username not found')
      }
    } catch (error) {
      console.error('Error looking up username:', error)
      setRecipientAddress('')
    }
  }

  const handleSend = async () => {
    if (!username || !amount || !recipientAddress) {
      WebApp.showAlert('Please fill in all fields')
      return
    }

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      WebApp.showAlert('Please enter a valid amount')
      return
    }

    try {
      setLoading(true)
      WebApp.showAlert('Preparing transaction...')

      const sendCash = getSendCash()
      const tokenContract = getTokenContract(selectedToken.address)
      const amountWei = parseTokenAmount(amount, selectedToken.decimals)

      // Check allowance
      const [userAddress] = await window.ethereum.request({ method: 'eth_accounts' })
      const allowance = await tokenContract.allowance(userAddress, sendCash.target)
      
      if (allowance < amountWei) {
        WebApp.showAlert('Approving token...')
        const approveTx = await tokenContract.approve(sendCash.target, ethers.MaxUint256)
        await approveTx.wait()
      }

      // Send payment
      WebApp.showAlert('Sending payment...')
      const cleanUsername = username.replace('@', '')
      const tx = await sendCash.sendPayment(cleanUsername, selectedToken.address, amountWei)
      
      WebApp.showAlert('Transaction submitted! Waiting for confirmation...')
      const receipt = await tx.wait()

      // Generate receipt
      const receiptData = await api.generateReceipt(receipt.hash)
      
      WebApp.showAlert('Payment sent successfully!')
      
      // Share receipt via Telegram
      if (receiptData.shareLink) {
        WebApp.openLink(receiptData.shareLink)
      }

      navigate('/transactions')
    } catch (error) {
      console.error('Error sending payment:', error)
      WebApp.showAlert(`Error: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-6">Send Payment</h1>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Recipient Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onBlur={lookupUsername}
            placeholder="@username"
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-telegram-button"
            disabled={loading}
          />
          {recipientAddress && (
            <p className="text-xs text-green-600 mt-1">✓ Username found</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Amount</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            step="0.01"
            min="0"
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-telegram-button"
            disabled={loading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Token</label>
          <select
            value={selectedToken.address}
            onChange={(e) => {
              const token = Object.values(TOKENS).find(t => t.address === e.target.value)
              setSelectedToken(token)
            }}
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-telegram-button"
            disabled={loading}
          >
            {Object.values(TOKENS).map((token) => (
              <option key={token.address} value={token.address}>
                {token.symbol} - {token.name}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSend}
          disabled={loading || !username || !amount || !recipientAddress}
          className="w-full py-4 rounded-lg font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: WebApp.themeParams.button_color || '#2481cc' }}
        >
          {loading ? 'Processing...' : 'Send Payment'}
        </button>
      </div>
    </div>
  )
}

export default Send

