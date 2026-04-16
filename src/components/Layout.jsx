import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const allNavItems = [
  { path: '/', label: 'Dashboard', icon: '◈' },
  { path: '/lotes', label: 'Lotes', icon: '▣' },
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

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const initials = user?.email?.split('@')[0]?.slice(0, 2)?.toUpperCase() || 'SP'
  
  // Filtrar menu baseado em permissões
  const isRestricted = restrictedUsers.includes(user?.email)
  const navItems = allNavItems.filter(item => !item.restricted || !isRestricted)

  return (
    <div className="flex h-screen bg-dark overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 flex flex-col shrink-0 border-r border-border">
        {/* Logo */}
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-center gap-2.5 mb-0.5">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-gold to-gold-dark flex items-center justify-center">
              <span className="text-black text-xs font-bold leading-none">S</span>
            </div>
            <span className="text-sm font-semibold tracking-widest text-white">SPITI</span>
          </div>
          <div className="text-2xs text-gray-600 pl-8.5 leading-none">Financial Hub</div>
        </div>

        {/* Divider */}
        <div className="mx-4 border-t border-border mb-2" />

        {/* Nav */}
        <nav className="flex-1 px-2 space-y-0.5">
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
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-8 animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  )
}
