import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Spinner } from '../ui/Feedback'

/** Protege as rotas do painel: exige sessão ativa E registro na tabela admins. */
export function RequireAdmin() {
  const { session, loading, isAdmin, signOut } = useAuth()
  const location = useLocation()

  if (loading || (session && isAdmin === 'unknown')) return <div className="min-h-dvh"><Spinner label="Verificando acesso..." /></div>
  if (!session) return <Navigate to="/admin/login" replace state={{ from: location.pathname + location.search }} />
  if (isAdmin === 'no') {
    return (
      <div className="mx-auto max-w-sm px-6 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold">Acesso não autorizado</h1>
        <p className="mt-2 text-sm text-ink-500">
          A conta <strong>{session.user.email}</strong> não tem permissão de administrador.
        </p>
        <button className="btn-secondary mt-6" onClick={signOut}>Entrar com outra conta</button>
      </div>
    )
  }
  return <Outlet />
}
