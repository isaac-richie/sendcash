import { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import WebApp from '@twa-dev/sdk'
import Home from './pages/Home'
import Send from './pages/Send'
import Receive from './pages/Receive'
import Profile from './pages/Profile'
import Transactions from './pages/Transactions'
import Layout from './components/Layout'

function App() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    WebApp.ready()
    WebApp.expand()
    setReady(true)
  }, [])

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-telegram-button mx-auto"></div>
          <p className="mt-4 text-telegram-hint">Loading SendCash...</p>
        </div>
      </div>
    )
  }

  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/send" element={<Send />} />
          <Route path="/receive" element={<Receive />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/transactions" element={<Transactions />} />
        </Routes>
      </Layout>
    </Router>
  )
}

export default App


