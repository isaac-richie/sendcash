import { useState, useEffect } from 'react'
import { api } from '../lib/api'

const Transactions = () => {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [address, setAddress] = useState('')

  useEffect(() => {
    loadTransactions()
  }, [])

  const loadTransactions = async () => {
    try {
      if (typeof window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' })
        if (accounts.length > 0) {
          setAddress(accounts[0])
          const data = await api.getTransactions(accounts[0])
          setTransactions(data.transactions || [])
        }
      }
    } catch (error) {
      console.error('Error loading transactions:', error)
    } finally {
      setLoading(false)
    }
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
      <h1 className="text-2xl font-bold mb-6">Transaction History</h1>

      {transactions.length === 0 ? (
        <div className="text-center mt-20">
          <p className="text-telegram-hint">No transactions yet</p>
          <p className="text-sm text-telegram-hint mt-2">Start sending or receiving payments to see them here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map((tx) => (
            <div key={tx.hash} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold">
                    {tx.type === 'sent' ? '→ Sent' : '← Received'}
                  </p>
                  <p className="text-sm text-telegram-hint">
                    {tx.toUsername ? `@${tx.toUsername}` : tx.to}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`font-semibold ${tx.type === 'sent' ? 'text-red-600' : 'text-green-600'}`}>
                    {tx.type === 'sent' ? '-' : '+'}${tx.amount}
                  </p>
                  <p className="text-xs text-telegram-hint">{tx.token}</p>
                </div>
              </div>
              <p className="text-xs text-telegram-hint mt-2">{new Date(tx.timestamp).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Transactions


