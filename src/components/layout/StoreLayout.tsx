import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useStore } from '../../context/StoreContext'
import { ErrorState, Spinner } from '../ui/Feedback'
import { CartDrawer } from './CartDrawer'
import { Footer } from './Footer'
import { Header } from './Header'

export function StoreLayout() {
  const { settings, loading, error, reload } = useStore()
  const { pathname } = useLocation()

  useEffect(() => { window.scrollTo(0, 0) }, [pathname])

  if (loading && !settings) return <div className="min-h-dvh"><Spinner /></div>
  if (error || !settings) return <ErrorState message={error ?? 'Loja indisponível.'} onRetry={reload} />

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="flex-1"><Outlet /></main>
      <Footer />
      <CartDrawer />
    </div>
  )
}
