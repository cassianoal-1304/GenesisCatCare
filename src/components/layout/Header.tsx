import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../../context/StoreContext'
import { useCart } from '../../context/CartContext'
import { BagIcon, CloseIcon, MenuIcon, SearchIcon } from '../ui/Icons'

export function Logo() {
  const { settings } = useStore()
  const name = settings?.store_name ?? ''
  return (
    <Link to="/" className="flex min-w-0 items-center gap-2.5" aria-label={`${name} — página inicial`}>
      {settings?.logo_url ? (
        <img src={settings.logo_url} alt={name} className="h-9 w-auto max-w-[160px] object-contain sm:h-10" />
      ) : (
        <>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand font-display text-lg font-semibold text-white">
            {name.charAt(0).toUpperCase()}
          </span>
          <span className="truncate font-display text-lg font-semibold tracking-tight text-ink-900 sm:text-xl">{name}</span>
        </>
      )}
    </Link>
  )
}

function SearchForm({ autoFocus, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [value, setValue] = useState(params.get('q') ?? '')

  useEffect(() => { setValue(params.get('q') ?? '') }, [params])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const q = value.trim().slice(0, 80)
    navigate(q ? `/catalogo?q=${encodeURIComponent(q)}` : '/catalogo')
    onDone?.()
  }
  return (
    <form role="search" onSubmit={submit} className="relative w-full">
      <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" width={18} height={18} />
      <input
        type="search" value={value} onChange={(e) => setValue(e.target.value)} autoFocus={autoFocus}
        placeholder="Buscar produtos..." aria-label="Buscar produtos" maxLength={80} enterKeyHint="search"
        className="h-11 w-full rounded-full border border-ink-200 bg-ink-50 pl-10 pr-4 text-sm outline-none transition placeholder:text-ink-400 focus:border-brand focus:bg-white"
      />
    </form>
  )
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium transition ${isActive ? 'text-brand' : 'text-ink-700 hover:text-ink-900'}`

export function Header() {
  const { categories } = useStore()
  const { count, open } = useCart()
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const location = useLocation()

  useEffect(() => { setMenuOpen(false); setSearchOpen(false) }, [location.pathname, location.search])
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  return (
    <header className="sticky top-0 z-40 border-b border-ink-100 bg-cream/90 backdrop-blur-md">
      <div className="container-page flex h-16 items-center gap-3 sm:h-[72px] sm:gap-6">
        <button className="-ml-2 grid size-10 place-items-center rounded-full hover:bg-ink-100 lg:hidden"
          aria-label="Abrir menu" onClick={() => setMenuOpen(true)}>
          <MenuIcon />
        </button>

        <Logo />

        <nav className="ml-4 hidden items-center gap-6 lg:flex" aria-label="Principal">
          <NavLink to="/" end className={navClass}>Início</NavLink>
          <NavLink to="/catalogo" className={navClass}>Catálogo</NavLink>
          <Link to="/catalogo?ofertas=1" className="text-sm font-medium text-ink-700 hover:text-ink-900">Ofertas</Link>
        </nav>

        <div className="ml-auto hidden w-full max-w-sm md:block"><SearchForm /></div>

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <button className="grid size-10 place-items-center rounded-full hover:bg-ink-100 md:hidden"
            aria-label="Buscar" onClick={() => setSearchOpen((v) => !v)}>
            {searchOpen ? <CloseIcon /> : <SearchIcon />}
          </button>
          <button onClick={open} aria-label={`Abrir carrinho (${count} itens)`}
            className="relative grid size-10 place-items-center rounded-full hover:bg-ink-100">
            <BagIcon width={22} height={22} />
            {count > 0 && (
              <span key={count} className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 animate-pop place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-white">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="container-page animate-fade-in pb-3 md:hidden"><SearchForm autoFocus /></div>
      )}

      {/* Menu mobile — renderizado no <body>: o backdrop-blur do cabeçalho
          criaria um novo contexto para elementos "fixed" e cortaria a gaveta */}
      {menuOpen && createPortal(
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 animate-fade-in bg-ink-900/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[84%] max-w-xs flex-col bg-cream shadow-2xl animate-fade-in">
            <div className="flex h-16 items-center justify-between border-b border-ink-100 px-4">
              <Logo />
              <button aria-label="Fechar menu" onClick={() => setMenuOpen(false)}
                className="grid size-10 place-items-center rounded-full hover:bg-ink-100"><CloseIcon /></button>
            </div>
            <nav className="flex-1 overflow-y-auto p-2" aria-label="Menu mobile">
              {[['/', 'Início'], ['/catalogo', 'Todos os produtos'], ['/catalogo?ofertas=1', 'Ofertas'], ['/catalogo?destaques=1', 'Destaques']].map(([to, label]) => (
                <Link key={to} to={to} className="block rounded-xl px-3 py-3 font-medium text-ink-900 hover:bg-ink-100">{label}</Link>
              ))}
              {categories.length > 0 && (
                <>
                  <p className="px-3 pb-1 pt-5 text-xs font-semibold uppercase tracking-wider text-ink-400">Categorias</p>
                  {categories.map((c) => (
                    <Link key={c.id} to={`/catalogo?categoria=${c.slug}`}
                      className="block rounded-xl px-3 py-2.5 text-ink-700 hover:bg-ink-100">{c.name}</Link>
                  ))}
                </>
              )}
            </nav>
          </div>
        </div>,
        document.body,
      )}
    </header>
  )
}
