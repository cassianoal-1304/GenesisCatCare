import { Suspense, useEffect } from 'react'
import { Outlet, useParams } from 'react-router-dom'
import { AuthProvider } from '../../context/AuthContext'
import { ConfirmProvider } from '../../components/admin/Modal'
import { ToastProvider } from '../../components/admin/Toast'
import { Spinner } from '../../components/ui/Feedback'
import ProductFormPage from './ProductFormPage'

export { AdminLayout } from '../../components/admin/AdminLayout'
export { RequireAdmin } from '../../components/admin/RequireAdmin'
export { ForgotPasswordPage, LoginPage, ResetPasswordPage } from './AuthPages'

/** Provedores do painel (autenticação, avisos, confirmações). */
export default function AdminRoot() {
  // O painel não deve aparecer em buscadores
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])
  return (
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <Suspense fallback={<Spinner />}><Outlet /></Suspense>
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  )
}

/** Remonta o formulário ao trocar de produto (ex.: após duplicar). */
export function ProductFormKeyed() {
  const { id } = useParams()
  return <ProductFormPage key={id ?? 'new'} />
}
