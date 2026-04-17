import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const allNavItems = [
  { path: '/', label: 'Dashboard', icon: '◈' },
  { path: '/lotes', label: 'Lotes', icon: '▣' },
  { path: '/clientes', label: 'Clientes', icon: '◐' },
  { path: '/vendas', label: 'Vendas', icon: '⊞' },
  { path: '/receber', label: 'A Receber', icon: '↓' },
  { path: '/pagar', label: 'A Pagar', icon: '↑' },
  { path: '/custos', label: 'Custos', icon: '⊟', restricted: true },
  { path: '/resultado', label: 'Resultado', icon: '◉', restricted: true },
]

// Usuários com acesso restrito (sem custos/resultado)
const restrictedUsers = ['helena@spiti.art']

export default function Layout({ children, user }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close mobile sidebar on route change
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const initials = user?.email?.split('@')[0]?.slice(0, 2)?.toUpperCase() || 'SP'

  // Filtrar menu baseado em permissões
  const isRestricted = restrictedUsers.includes(user?.email)
  const navItems = allNavItems.filter(item => !item.restricted || !isRestricted)

  const currentItem = navItems.find(i => i.path === location.pathname) || navItems[0]

  return (
    <div className="flex h-screen bg-dark overflow-hidden">
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 inset-x-0 h-14 bg-dark border-b border-border flex items-center justify-between px-4 z-40">
        <button onClick={() => setMobileOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/5 text-gray-300">
          <span className="text-lg">☰</span>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-gradient-to-br from-gold to-gold-dark flex items-center justify-center">
            <span className="text-black text-2xs font-bold leading-none">S</span>
          </div>
          <span className="text-xs font-semibold tracking-widest text-white">{currentItem.label.toUpperCase()}</span>
        </div>
        <div className="w-9 h-9 flex items-center justify-center rounded-full bg-gold/20 border border-gold/30 cursor-pointer" onClick={handleLogout}>
          <span className="text-gold text-2xs font-semibold">{initials}</span>
        </div>
      </div>

      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/70 z-40" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static top-0 left-0 h-full w-60 lg:w-52 z-50
        flex flex-col shrink-0 border-r border-border bg-dark
        transform transition-transform duration-200
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0
      `}>
        {/* Logo */}
        <div className="px-5 pt-6 pb-5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-0.5">
              <div className="w-6 h-6 rounded bg-gradient-to-br from-gold to-gold-dark flex items-center justify-center">
                <span className="text-black text-xs font-bold leading-none">S</span>
              </div>
              <span className="text-sm font-semibold tracking-widest text-white">SPITI</span>
            </div>
            <div className="text-2xs text-gray-600 pl-8.5 leading-none">Financial Hub</div>
          </div>
          <button onClick={() => setMobileOpen(false)}
            className="lg:hidden text-gray-500 hover:text-white text-lg leading-none">✕</button>
        </div>

        {/* Divider */}
        <div className="mx-4 border-t border-border mb-2" />

        {/* Nav */}
        <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                  isActive
                    ? 'bg-gold/10 text-gold font-medium'
                    : 'text-gray-500 hover:text-gray-200 hover:bg-white/4'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`text-base leading-none w-4 text-center ${isActive ? 'text-gold' : 'text-gray-600 group-hover:text-gray-400'}`}>
                    {item.icon}
                  </span>
                  <span className="leading-none">{item.label}</span>
                  {isActive && <span className="ml-auto w-1 h-1 rounded-full bg-gold" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 pb-4 pt-2 border-t border-border mt-2">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/4 transition-colors cursor-pointer group"
               onClick={handleLogout}>
            <div className="w-6 h-6 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center shrink-0">
              <span className="text-gold text-2xs font-semibold">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-2xs text-gray-400 truncate">{user?.email}</div>
            </div>
            <span className="text-gray-600 group-hover:text-gray-400 text-xs">→</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto pt-14 lg:pt-0">
        <div className="max-w-7xl mx-auto p-4 lg:p-8 animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  )
}
