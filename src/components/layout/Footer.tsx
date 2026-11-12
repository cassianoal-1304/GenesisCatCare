import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../../context/StoreContext'
import { ClockIcon, FacebookIcon, InstagramIcon, MailIcon, PhoneIcon, PinIcon, WhatsAppIcon } from '../ui/Icons'
import { Logo } from './Header'

const formatPhone = (digits: string) => {
  const d = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
    : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : digits
}

export function Footer() {
  const { settings, categories } = useStore()
  if (!settings) return null
  const s = settings
  const contacts = [
    s.whatsapp_number && { icon: <WhatsAppIcon width={16} height={16} />, label: formatPhone(s.whatsapp_number), href: `https://wa.me/${s.whatsapp_number}` },
    s.phone && { icon: <PhoneIcon width={16} height={16} />, label: s.phone, href: `tel:${s.phone.replace(/[^\d+]/g, '')}` },
    s.email && { icon: <MailIcon width={16} height={16} />, label: s.email, href: `mailto:${s.email}` },
    s.address && { icon: <PinIcon width={16} height={16} />, label: s.address },
    s.business_hours && { icon: <ClockIcon width={16} height={16} />, label: s.business_hours },
  ].filter(Boolean) as { icon: ReactNode; label: string; href?: string }[]

  return (
    <footer className="mt-16 border-t border-ink-100 bg-white">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <Logo />
          {(s.about_text || s.tagline) && (
            <p className="mt-4 max-w-md whitespace-pre-line text-sm leading-relaxed text-ink-500">{s.about_text || s.tagline}</p>
          )}
          {(s.instagram_url || s.facebook_url) && (
            <div className="mt-5 flex gap-2">
              {s.instagram_url && <a href={s.instagram_url} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="grid size-10 place-items-center rounded-full border border-ink-200 text-ink-700 hover:border-brand hover:text-brand"><InstagramIcon /></a>}
              {s.facebook_url && <a href={s.facebook_url} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="grid size-10 place-items-center rounded-full border border-ink-200 text-ink-700 hover:border-brand hover:text-brand"><FacebookIcon /></a>}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-ink-900">Navegação</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-ink-500">
            <li><Link to="/catalogo" className="hover:text-ink-900">Todos os produtos</Link></li>
            <li><Link to="/catalogo?ofertas=1" className="hover:text-ink-900">Ofertas</Link></li>
            {categories.slice(0, 6).map((c) => (
              <li key={c.id}><Link to={`/catalogo?categoria=${c.slug}`} className="hover:text-ink-900">{c.name}</Link></li>
            ))}
          </ul>
        </div>

        {contacts.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-ink-900">Atendimento</h3>
            <ul className="mt-4 space-y-3 text-sm text-ink-500">
              {contacts.map((c) => (
                <li key={c.label} className="flex items-start gap-2.5">
                  <span className="mt-0.5 text-ink-400">{c.icon}</span>
                  {c.href ? <a href={c.href} target={c.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className="hover:text-ink-900">{c.label}</a> : <span className="whitespace-pre-line">{c.label}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="border-t border-ink-100">
        <div className="container-page flex flex-col gap-1 py-5 text-xs text-ink-400 sm:flex-row sm:justify-between">
          <span>© {new Date().getFullYear()} {s.store_name}. {s.footer_text}</span>
        </div>
      </div>
    </footer>
  )
}
