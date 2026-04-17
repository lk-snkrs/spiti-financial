import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ContasReceber from './pages/ContasReceber'
import ContasPagar from './pages/ContasPagar'
import Vendas from './pages/Vendas'
import Custos from './pages/Custos'
import Resultado from './pages/Resultado'
import Lotes from './pages/Lotes'
import Clientes from './pages/Clientes'

// Usuários com acesso restrito
const restrictedUsers = ['helena@spiti.art']

function ProtectedRoute({ children, user }) {
  if (!user) return <Navigate to="/login" replace />
  return children
}

function RestrictedRoute({ children, user }) {
  if (!user) return <Navigate to="/login" replace />
  if (restrictedUsers.includes(user?.email)) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const [user, setUser] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (user === undefined) {
    return <div className="min-h-screen bg-dark flex items-center justify-center">
      <div className="text-gray-400 text-sm">Carregando...</div>
    </div>
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/*" element={
          <ProtectedRoute user={user}>
            <Layout user={user}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/receber" element={<ContasReceber />} />
                <Route path="/pagar" element={<ContasPagar />} />
                <Route path="/vendas" element={<Vendas />} />
                <Route path="/custos" element={<RestrictedRoute user={user}><Custos /></RestrictedRoute>} />
                <Route path="/resultado" element={<RestrictedRoute user={user}><Resultado /></RestrictedRoute>} />
                <Route path="/lotes" element={<Lotes />} />
                <Route path="/clientes" element={<Clientes />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  )
}
