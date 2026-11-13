import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/StoreContext'
import { BoxIcon, CloseIcon, ExternalIcon, HomeIcon, LogoutIcon, MenuIcon, SettingsIcon, TagIcon, UploadIcon } from '../ui/Icons'

const NAV = [
  { to: '/admin', label: 'Painel', icon: HomeIcon, end: true },
  { to: '/admin/produtos', label: 'Produtos', icon: BoxIcon },
  { to: '/admin/categorias', label: 'Categorias', icon: TagIcon },
  { to: '/admin/importar', label: 'Importar / Exportar', icon: UploadIcon },
  { to: '/admin/configuracoes', label: 'Configurações', icon: SettingsIcon },
]

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const { session, signOut } = useAuth()
  return (
    <div className="flex h-full flex-col">
      <nav className="flex-1 space-y-1 p-3" aria-label="Painel administrativo">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={onNavigate}
            className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-brand text-white' : 'text-ink-700 hover:bg-ink-100'}`}>
            <Icon width={19} height={19} /> {label}
          </NavLink>
        ))}
        <a href="/" target="_blank" rel="noopener" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-100">
          <ExternalIcon width={19} height={19} /> Ver loja
        </a>
      </nav>
      <div className="border-t border-ink-100 p-3">
        <p className="truncate px-3 pb-2 text-xs text-ink-500" title={session?.user.email}>{session?.user.email}</p>
        <button onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-red-50 hover:text-red-700">
          <LogoutIcon width={19} height={19} /> Sair
        </button>
      </div>
    </div>
  )
}

export function AdminLayout() {
  const { settings } = useStore()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => { setOpen(false); window.scrollTo(0, 0) }, [pathname])

  const brand = (
    <Link to="/admin" className="flex min-w-0 items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand font-display font-semibold text-white">
        {(settings?.store_name ?? 'L').charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold leading-tight">{settings?.store_name ?? 'Loja'}</span>
        <span className="block text-[11px] leading-tight text-ink-500">Painel administrativo</span>
      </span>
    </Link>
  )

  return (
    <div className="min-h-dvh bg-ink-50 lg:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-ink-100 bg-white lg:flex">
        <div className="flex h-16 items-center border-b border-ink-100 px-5">{brand}</div>
        <Nav />
      </aside>

      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-ink-100 bg-white/95 px-3 backdrop-blur lg:hidden">
        <button aria-label="Abrir menu" onClick={() => setOpen(true)} className="grid size-10 place-items-center rounded-full hover:bg-ink-100"><MenuIcon /></button>
        {brand}
      </header>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-ink-900/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 animate-fade-in flex-col bg-white shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b border-ink-100 px-4">
              {brand}
              <button aria-label="Fechar menu" onClick={() => setOpen(false)} className="grid size-10 place-items-center rounded-full hover:bg-ink-100"><CloseIcon /></button>
            </div>
            <Nav onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8"><Outlet /></main>
    </div>
  )
}
