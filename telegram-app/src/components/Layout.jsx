import { Link, useLocation } from 'react-router-dom'
import WebApp from '@twa-dev/sdk'

const Layout = ({ children }) => {
  const location = useLocation()

  const navItems = [
    { path: '/', icon: '🏠', label: 'Home' },
    { path: '/send', icon: '💸', label: 'Send' },
    { path: '/receive', icon: '📥', label: 'Receive' },
    { path: '/transactions', icon: '📋', label: 'History' },
    { path: '/profile', icon: '👤', label: 'Profile' },
  ]

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: WebApp.themeParams.bg_color || '#ffffff' }}>
      <main className="flex-1 pb-20">
        {children}
      </main>
      
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around items-center py-2 px-4 z-50">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex flex-col items-center py-2 px-3 rounded-lg transition-colors ${
              location.pathname === item.path
                ? 'text-telegram-button'
                : 'text-telegram-hint'
            }`}
          >
            <span className="text-2xl">{item.icon}</span>
            <span className="text-xs mt-1">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}

export default Layout


