import { lazy, Suspense } from 'react'
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router-dom'
import { StoreProvider } from './context/StoreContext'
import { CartProvider } from './context/CartContext'
import { StoreLayout } from './components/layout/StoreLayout'
import { Spinner } from './components/ui/Feedback'
import { isSupabaseConfigured } from './lib/supabase'
import HomePage from './pages/store/HomePage'
import NotFoundPage from './pages/store/NotFoundPage'
import { adminRoutes } from './pages/admin/routes'

// Páginas carregadas sob demanda (bundle inicial menor)
const CatalogPage = lazy(() => import('./pages/store/CatalogPage'))
const ProductPage = lazy(() => import('./pages/store/ProductPage'))

function SetupRequired() {
  return (
    <div className="mx-auto max-w-lg px-6 py-20">
      <h1 className="font-display text-2xl font-semibold">Configuração necessária</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-500">
        As variáveis <code className="rounded bg-ink-100 px-1">VITE_SUPABASE_URL</code> e{' '}
        <code className="rounded bg-ink-100 px-1">VITE_SUPABASE_ANON_KEY</code> não foram definidas.
        Copie o arquivo <code className="rounded bg-ink-100 px-1">.env.example</code> para{' '}
        <code className="rounded bg-ink-100 px-1">.env</code> e preencha com os dados do seu projeto Supabase
        (ou configure-as no Cloudflare Pages). Veja o README para o passo a passo.
      </p>
    </div>
  )
}

function Root() {
  return (
    <StoreProvider>
      <Suspense fallback={<Spinner />}><Outlet /></Suspense>
    </StoreProvider>
  )
}

function StoreRoot() {
  return <CartProvider><StoreLayout /></CartProvider>
}

const router = createBrowserRouter([{
  element: <Root />,
  children: [
    {
      element: <StoreRoot />,
      children: [
        { index: true, element: <HomePage /> },
        { path: 'catalogo', element: <CatalogPage /> },
        { path: 'produto/:slug', element: <ProductPage /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
    adminRoutes,
  ],
}])

export default function App() {
  if (!isSupabaseConfigured) return <SetupRequired />
  return <RouterProvider router={router} />
}
