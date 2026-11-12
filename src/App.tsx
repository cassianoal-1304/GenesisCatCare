import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { StoreProvider } from './context/StoreContext'
import { CartProvider } from './context/CartContext'
import { StoreLayout } from './components/layout/StoreLayout'
import { Spinner } from './components/ui/Feedback'
import { isSupabaseConfigured } from './lib/supabase'
import HomePage from './pages/store/HomePage'
import NotFoundPage from './pages/store/NotFoundPage'

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

export default function App() {
  if (!isSupabaseConfigured) return <SetupRequired />
  return (
    <BrowserRouter>
      <StoreProvider>
        <CartProvider>
          <Suspense fallback={<Spinner />}>
            <Routes>
              <Route element={<StoreLayout />}>
                <Route index element={<HomePage />} />
                <Route path="catalogo" element={<CatalogPage />} />
                <Route path="produto/:slug" element={<ProductPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </Suspense>
        </CartProvider>
      </StoreProvider>
    </BrowserRouter>
  )
}
