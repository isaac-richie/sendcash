import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { connectWallet, getBalance, formatTokenAmount } from '../lib/web3'
import { TOKENS } from '../lib/config'
import { api } from '../lib/api'
import WebApp from '@twa-dev/sdk'

const Home = () => {
  const [walletAddress, setWalletAddress] = useState('')
  const [balance, setBalance] = useState('0')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    loadWalletData()
  }, [])

  const loadWalletData = async () => {
    try {
      if (typeof window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' })
        if (accounts.length > 0) {
          setWalletAddress(accounts[0])
          await loadBalance(accounts[0])
          await loadUsername(accounts[0])
        }
      }
    } catch (error) {
      console.error('Error loading wallet:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadBalance = async (address) => {
    try {
      const usdcBalance = await getBalance(address, TOKENS.USDC.address)
      setBalance(formatTokenAmount(usdcBalance, TOKENS.USDC.decimals))
    } catch (error) {
      console.error('Error loading balance:', error)
    }
  }

  const loadUsername = async (address) => {
    try {
      const data = await api.lookupAddress(address)
      if (data.username) {
        setUsername(data.username)
      }
    } catch (error) {
      console.error('Error loading username:', error)
    }
  }

  const handleConnectWallet = async () => {
    try {
      setLoading(true)
      const signer = await connectWallet()
      const address = await signer.getAddress()
      setWalletAddress(address)
      await loadBalance(address)
      await loadUsername(address)
      WebApp.showAlert('Wallet connected!')
    } catch (error) {
      WebApp.showAlert(`Error: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  if (loading && !walletAddress) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-telegram-button mx-auto"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      {!walletAddress ? (
        <div className="text-center mt-20">
          <h1 className="text-3xl font-bold mb-4">Welcome to SendCash</h1>
          <p className="text-telegram-hint mb-8">Send money via @username</p>
          <button
            onClick={handleConnectWallet}
            className="w-full py-4 px-6 rounded-lg font-semibold text-white"
            style={{ backgroundColor: WebApp.themeParams.button_color || '#2481cc' }}
          >
            Connect Wallet
          </button>
        </div>
      ) : (
        <>
          <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl p-6 mb-6 text-white">
            <p className="text-sm opacity-90 mb-2">Balance</p>
            <h2 className="text-4xl font-bold mb-2">${balance}</h2>
            <p className="text-sm opacity-75">{username ? `@${username}` : 'No username'}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <button
              onClick={() => navigate('/send')}
              className="bg-telegram-button text-white py-4 rounded-xl font-semibold"
            >
              💸 Send
            </button>
            <button
              onClick={() => navigate('/receive')}
              className="bg-green-500 text-white py-4 rounded-xl font-semibold"
            >
              📥 Receive
            </button>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h3 className="font-semibold mb-3">Recent Transactions</h3>
            <p className="text-telegram-hint text-sm">No transactions yet</p>
          </div>
        </>
      )}
    </div>
  )
}

export default Home


