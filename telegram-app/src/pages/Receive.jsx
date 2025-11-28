import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import WebApp from '@twa-dev/sdk'

// Simple QR code component (fallback if qrcode.react not available)
const QRCode = ({ value, size }) => {
  return (
    <div className="border-2 border-gray-300 p-4 inline-block">
      <div className="text-xs break-all max-w-[200px]">{value}</div>
    </div>
  )
}

const Receive = () => {
  const [username, setUsername] = useState('')
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadUserData()
  }, [])

  const loadUserData = async () => {
    try {
      if (typeof window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' })
        if (accounts.length > 0) {
          setAddress(accounts[0])
          const data = await api.lookupAddress(accounts[0])
          if (data.username) {
            setUsername(data.username)
          }
        }
      }
    } catch (error) {
      console.error('Error loading user data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleShare = () => {
    const shareText = username 
      ? `Send me money via SendCash! @${username}`
      : `Send me money via SendCash! My address: ${address}`
    
    WebApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(shareText)}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-telegram-button"></div>
      </div>
    )
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-6">Receive Payment</h1>

      <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
        <div className="flex justify-center mb-4">
          {username ? (
            <div className="text-center">
              <div className="text-6xl font-bold mb-2">@{username}</div>
              <p className="text-telegram-hint text-sm">Your SendCash username</p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-telegram-hint mb-4">No username registered</p>
              <p className="text-xs break-all">{address}</p>
            </div>
          )}
        </div>

        <div className="flex justify-center mb-4">
          <QRCode 
            value={username ? `sendcash://@${username}` : `sendcash://${address}`}
            size={200}
          />
        </div>

        <button
          onClick={handleShare}
          className="w-full py-3 rounded-lg font-semibold text-white"
          style={{ backgroundColor: WebApp.themeParams.button_color || '#2481cc' }}
        >
          Share via Telegram
        </button>
      </div>

      {!username && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            💡 Register a username to make it easier for others to send you money!
          </p>
        </div>
      )}
    </div>
  )
}

export default Receive

