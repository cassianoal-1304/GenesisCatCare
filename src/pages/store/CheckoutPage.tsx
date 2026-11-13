import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useCart } from '../../context/CartContext'
import { useStore } from '../../context/StoreContext'
import { useCartValidation } from '../../hooks/useCartValidation'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { createOrder, type CustomerData } from '../../lib/checkout'
import { formatPrice } from '../../lib/format'
import { buildOrderMessage, saveLastOrder, whatsappLink } from '../../lib/whatsapp'
import { Notices } from '../../components/store/CartLines'
import { ProductImage } from '../../components/store/ProductImage'
import { Spinner } from '../../components/ui/Feedback'
import { ChevronLeft, WhatsAppIcon } from '../../components/ui/Icons'

const DRAFT_KEY = 'store-checkout-draft-v1'
const EMPTY: CustomerData = { name: '', phone: '', city: '', neighborhood: '', address: '', notes: '' }

function loadDraft(): CustomerData {
  try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') } } catch { return EMPTY }
}

const inputCls = 'w-full rounded-xl border border-ink-200 bg-white px-3.5 py-3 text-base outline-none transition placeholder:text-ink-400 focus:border-brand focus:ring-2 focus:ring-brand/15 aria-[invalid=true]:border-red-500'

function Input({ label, error, optional, children }: { label: string; error?: string; optional?: boolean; children: ReactNode }) {
  return (
    <div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">{label}{optional && <span className="font-normal text-ink-400"> (opcional)</span>}</span>
        {children}
      </label>
      {error && <span role="alert" className="mt-1 block text-xs font-medium text-red-600">{error}</span>}
    </div>
  )
}

export default function CheckoutPage() {
  useDocumentTitle('Finalizar pedido')
  const { settings } = useStore()
  const { items, subtotal, hasIssues, clear } = useCart()
  const { checking, notices, validate, error: checkError } = useCartValidation()
  const navigate = useNavigate()

  const [form, setForm] = useState<CustomerData>(loadDraft)
  const [errors, setErrors] = useState<Partial<Record<keyof CustomerData, string>>>({})
  const [step, setStep] = useState<'form' | 'review'>('form')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string[]>([])

  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)) } catch { /* ignore */ }
  }, [form])
  useEffect(() => { window.scrollTo(0, 0) }, [step])

  if (items.length === 0 && !submitting) return <Navigate to="/carrinho" replace />

  const whatsapp = settings?.whatsapp_number
  const set = (k: keyof CustomerData) => (e: { target: { value: string } }) => {
    setForm({ ...form, [k]: e.target.value })
    if (errors[k]) setErrors({ ...errors, [k]: undefined })
  }

  const validateForm = () => {
    const e: typeof errors = {}
    if (form.name.trim().length < 2) e.name = 'Informe seu nome.'
    const digits = form.phone.replace(/\D/g, '')
    if (digits && !(digits.length >= 10 && digits.length <= 13)) e.phone = 'Telefone inválido. Informe DDD + número.'
    if (form.city.trim().length < 2) e.city = 'Informe sua cidade.'
    if (form.neighborhood.trim().length < 2) e.neighborhood = 'Informe seu bairro.'
    if (form.address.length > 300) e.address = 'Máximo de 300 caracteres.'
    if (form.notes.length > 1000) e.notes = 'Máximo de 1000 caracteres.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const goReview = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!validateForm()) return
    const n = await validate()            // confere preços e estoque novamente
    if (n === null) return
    setStep('review')
  }

  const confirm = async () => {
    if (!whatsapp) return
    setSubmitting(true)
    setSubmitError([])
    // Abre a janela já no clique (navegadores bloqueiam janelas abertas depois de uma espera)
    const win = window.open('', '_blank')
    try {
      const order = await createOrder(
        { ...form, name: form.name.trim(), city: form.city.trim(), neighborhood: form.neighborhood.trim() },
        items.filter((i) => !i.issue).map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity })),
      )
      const url = whatsappLink(whatsapp, buildOrderMessage(order))
      let opened = false
      if (win && !win.closed) {
        try { win.opener = null; win.location.href = url; opened = true } catch { opened = false }
      }
      saveLastOrder(order)
      clear()
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
      navigate(`/pedido/${order.order_number}`, { replace: true, state: { opened } })
    } catch (e) {
      win?.close()
      const err = e as { message?: string; hint?: string }
      const msg = err.message && !/fetch|network/i.test(err.message) ? err.message : 'Não foi possível registrar o pedido. Verifique sua conexão e tente novamente.'
      setSubmitError(msg.split('\n').filter(Boolean))
      if (err.hint === 'cart_problems') { await validate(); setStep('form') }
      setSubmitting(false)
    }
  }

  const summary = (
    <aside className="h-fit rounded-2xl bg-white p-5 ring-1 ring-ink-100 lg:sticky lg:top-24">
      <h2 className="font-semibold">Seu pedido</h2>
      <ul className="mt-4 space-y-3">
        {items.filter((i) => !i.issue).map((i) => (
          <li key={i.key} className="flex gap-3 text-sm">
            <ProductImage src={i.image} alt="" className="size-14 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 font-medium">{i.name}</p>
              {i.variantName && <p className="text-xs text-ink-500">Variação: {i.variantName}</p>}
              <p className="text-xs text-ink-500">{i.quantity} × {formatPrice(i.unitPrice)}</p>
            </div>
            <span className="shrink-0 font-semibold tabular-nums">{formatPrice(i.unitPrice * i.quantity)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-baseline justify-between border-t border-ink-100 pt-4">
        <span className="font-semibold">Total</span>
        <span className="text-2xl font-bold tabular-nums">{formatPrice(subtotal)}</span>
      </div>
      <p className="mt-1 text-xs text-ink-400">Valores conferidos agora com o estoque da loja. Frete e pagamento são combinados pelo WhatsApp.</p>
    </aside>
  )

  return (
    <div className="container-page py-6 sm:py-10">
      <Link to={step === 'review' ? '#' : '/carrinho'} onClick={(e) => { if (step === 'review') { e.preventDefault(); setStep('form') } }}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-ink-900">
        <ChevronLeft width={16} height={16} /> {step === 'review' ? 'Editar dados' : 'Voltar ao carrinho'}
      </Link>
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Finalizar pedido</h1>
      <ol className="mt-3 flex gap-2 text-xs font-medium" aria-label="Etapas">
        <li className={`rounded-full px-3 py-1 ${step === 'form' ? 'bg-brand text-white' : 'bg-ink-100 text-ink-500'}`}>1. Seus dados</li>
        <li className={`rounded-full px-3 py-1 ${step === 'review' ? 'bg-brand text-white' : 'bg-ink-100 text-ink-500'}`}>2. Revisão</li>
      </ol>

      {!whatsapp && (
        <p role="alert" className="mt-6 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
          A loja ainda não configurou o WhatsApp para pedidos. Tente novamente mais tarde.
        </p>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <Notices notices={notices} />
          {checkError && <p role="alert" className="mb-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{checkError}</p>}
          {submitError.length > 0 && (
            <div role="alert" className="mb-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
              <p className="font-semibold">O pedido não foi registrado:</p>
              <ul className="mt-1 list-disc pl-5">{submitError.map((m) => <li key={m}>{m}</li>)}</ul>
            </div>
          )}
          {hasIssues && (
            <p role="alert" className="mb-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
              Há itens indisponíveis no carrinho. <Link to="/carrinho" className="font-semibold underline">Revise o carrinho</Link> para continuar.
            </p>
          )}

          {step === 'form' ? (
            <form onSubmit={goReview} noValidate className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-ink-100 sm:p-6">
              <p className="text-sm text-ink-500">Não é necessário criar conta. Usaremos estes dados para combinar a entrega.</p>
              <Input label="Nome" error={errors.name}>
                <input className={inputCls} value={form.name} onChange={set('name')} autoComplete="name" maxLength={120} aria-invalid={errors.name ? true : undefined} />
              </Input>
              <Input label="Telefone / WhatsApp" optional error={errors.phone}>
                <input className={inputCls} value={form.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" placeholder="(11) 98765-4321" aria-invalid={errors.phone ? true : undefined} />
              </Input>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Cidade" error={errors.city}>
                  <input className={inputCls} value={form.city} onChange={set('city')} autoComplete="address-level2" maxLength={80} aria-invalid={errors.city ? true : undefined} />
                </Input>
                <Input label="Bairro" error={errors.neighborhood}>
                  <input className={inputCls} value={form.neighborhood} onChange={set('neighborhood')} autoComplete="address-level3" maxLength={80} aria-invalid={errors.neighborhood ? true : undefined} />
                </Input>
              </div>
              <Input label="Endereço" optional error={errors.address}>
                <input className={inputCls} value={form.address} onChange={set('address')} autoComplete="street-address" placeholder="Rua, número, complemento" maxLength={300} />
              </Input>
              <Input label="Observações" optional error={errors.notes}>
                <textarea className={`${inputCls} resize-y`} rows={3} value={form.notes} onChange={set('notes')} maxLength={1000} placeholder="Ponto de referência, melhor horário..." />
              </Input>
              <button type="submit" disabled={checking || hasIssues || !whatsapp} className="btn-primary w-full">
                {checking ? 'Conferindo estoque...' : 'Revisar pedido'}
              </button>
            </form>
          ) : (
            <div className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-ink-100 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold">Confira seus dados</h2>
                <button className="text-sm font-semibold text-brand hover:underline" onClick={() => setStep('form')}>Editar</button>
              </div>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {([['Nome', form.name], ['Telefone', form.phone || 'Não informado'], ['Cidade', form.city], ['Bairro', form.neighborhood],
                  ['Endereço', form.address || 'Não informado'], ['Observações', form.notes || '—']] as const).map(([k, v]) => (
                  <div key={k}><dt className="text-ink-500">{k}</dt><dd className="font-medium break-words">{v}</dd></div>
                ))}
              </dl>
              <div className="rounded-xl bg-ink-50 p-4 text-sm text-ink-700">
                Ao confirmar, seu pedido será <strong>registrado na loja</strong> e o WhatsApp será aberto com a mensagem pronta.
                <strong> Para concluir, você precisa enviar a mensagem.</strong> A disponibilidade, o pagamento e a entrega são confirmados pela loja na conversa.
              </div>
              <button onClick={confirm} disabled={submitting || checking || hasIssues || !whatsapp} className="btn-primary w-full !bg-[#1fa855]">
                <WhatsAppIcon /> {submitting ? 'Registrando pedido...' : 'Confirmar e abrir WhatsApp'}
              </button>
            </div>
          )}
        </div>
        {checking && items.length === 0 ? <Spinner /> : summary}
      </div>
    </div>
  )
}
