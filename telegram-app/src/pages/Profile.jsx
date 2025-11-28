import { useState, useEffect } from 'react'
import { connectWallet, getUsernameRegistry } from '../lib/web3'
import { api } from '../lib/api'
import WebApp from '@twa-dev/sdk'

const Profile = () => {
  const [walletAddress, setWalletAddress] = useState('')
  const [username, setUsername] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [registering, setRegistering] = useState(false)

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    try {
      if (typeof window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' })
        if (accounts.length > 0) {
          setWalletAddress(accounts[0])
          const data = await api.lookupAddress(accounts[0])
          if (data.username) {
            setUsername(data.username)
          }
        }
      }
    } catch (error) {
      console.error('Error loading profile:', error)
    }
  }

  const handleConnectWallet = async () => {
    try {
      setLoading(true)
      const signer = await connectWallet()
      const address = await signer.getAddress()
      setWalletAddress(address)
      await loadProfile()
      WebApp.showAlert('Wallet connected!')
    } catch (error) {
      WebApp.showAlert(`Error: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleRegisterUsername = async () => {
    if (!newUsername || newUsername.length < 3) {
      WebApp.showAlert('Username must be at least 3 characters')
      return
    }

    if (!walletAddress) {
      WebApp.showAlert('Please connect your wallet first')
      return
    }

    try {
      setRegistering(true)
      WebApp.showAlert('Registering username on blockchain...')

      const registry = getUsernameRegistry()
      const cleanUsername = newUsername.replace('@', '').toLowerCase()
      
      const tx = await registry.registerUsername(cleanUsername)
      await tx.wait()

      // Update backend
      await api.registerUsername(cleanUsername, walletAddress)

      setUsername(cleanUsername)
      setNewUsername('')
      WebApp.showAlert('Username registered successfully!')
    } catch (error) {
      console.error('Error registering username:', error)
      WebApp.showAlert(`Error: ${error.message}`)
    } finally {
      setRegistering(false)
    }
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-6">Profile</h1>

      {!walletAddress ? (
        <div className="text-center mt-20">
          <button
            onClick={handleConnectWallet}
            disabled={loading}
            className="w-full py-4 px-6 rounded-lg font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: WebApp.themeParams.button_color || '#2481cc' }}
          >
            {loading ? 'Connecting...' : 'Connect Wallet'}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="text-sm text-telegram-hint mb-1">Wallet Address</p>
            <p className="text-sm font-mono break-all">{walletAddress}</p>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="text-sm text-telegram-hint mb-1">Username</p>
            {username ? (
              <p className="text-lg font-semibold">@{username}</p>
            ) : (
              <p className="text-telegram-hint">No username registered</p>
            )}
          </div>

          {!username && (
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="font-semibold mb-3">Register Username</h3>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="username"
                className="w-full p-3 border border-gray-300 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-telegram-button"
                disabled={registering}
              />
              <button
                onClick={handleRegisterUsername}
                disabled={registering || !newUsername}
                className="w-full py-3 rounded-lg font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: WebApp.themeParams.button_color || '#2481cc' }}
              >
                {registering ? 'Registering...' : 'Register Username'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default Profile


