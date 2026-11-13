import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useStore } from '../../context/StoreContext'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { formatPrice } from '../../lib/format'
import { buildOrderMessage, copyText, loadLastOrder, whatsappLink } from '../../lib/whatsapp'
import { EmptyState } from '../../components/ui/Feedback'
import { CheckIcon, CopyIcon, WhatsAppIcon } from '../../components/ui/Icons'

export default function OrderPlacedPage() {
  const { number } = useParams()
  const location = useLocation()
  const { settings } = useStore()
  const opened = (location.state as { opened?: boolean } | null)?.opened
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)
  useDocumentTitle(`Pedido #${number}`)

  const order = loadLastOrder()
  if (!order || String(order.order_number) !== number) {
    return (
      <EmptyState title={`Pedido #${number}`} action={<Link to="/catalogo" className="btn-primary">Voltar à loja</Link>}>
        Os detalhes deste pedido não estão disponíveis neste dispositivo. Se você já enviou a mensagem no WhatsApp, a loja entrará em contato.
      </EmptyState>
    )
  }

  const message = buildOrderMessage(order)
  const url = settings?.whatsapp_number ? whatsappLink(settings.whatsapp_number, message) : null

  const copy = async () => {
    setCopied((await copyText(message)) ? 'ok' : 'fail')
    setTimeout(() => setCopied(null), 4000)
  }

  return (
    <div className="container-page max-w-2xl py-8 sm:py-12">
      <div className="text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-100 text-emerald-700"><CheckIcon width={28} height={28} /></div>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight">Pedido #{order.order_number} registrado</h1>
        <p className="mt-2 text-ink-500">Total: <strong className="text-ink-900">{formatPrice(order.total)}</strong></p>
      </div>

      <div role="status" className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Falta enviar a mensagem no WhatsApp</p>
        <p className="mt-1">
          {opened === false
            ? 'Não conseguimos abrir o WhatsApp automaticamente. Use o botão abaixo.'
            : 'O WhatsApp deve ter sido aberto em outra aba ou no aplicativo.'}{' '}
          A loja só recebe seu pedido quando você <strong>enviar a mensagem</strong> na conversa.
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn-primary !bg-[#1fa855]">
            <WhatsAppIcon /> {opened === false ? 'Abrir WhatsApp' : 'Abrir WhatsApp novamente'}
          </a>
        ) : <p className="text-sm text-red-600">WhatsApp da loja não configurado.</p>}
        <button onClick={copy} className="btn-secondary h-12">
          {copied === 'ok' ? <><CheckIcon width={18} height={18} /> Dados copiados</> : <><CopyIcon width={18} height={18} /> Copiar dados do pedido</>}
        </button>
      </div>
      {copied === 'fail' && <p role="alert" className="mt-2 text-sm text-red-600">Não foi possível copiar. Selecione o texto abaixo e copie manualmente.</p>}
      {copied === 'ok' && <p className="mt-2 text-center text-xs text-ink-500">Cole a mensagem na conversa com a loja{settings?.whatsapp_number && ` (${settings.whatsapp_number})`}.</p>}

      <details className="mt-6 rounded-2xl bg-white p-4 ring-1 ring-ink-100" open={opened === false}>
        <summary className="cursor-pointer text-sm font-semibold">Ver mensagem do pedido</summary>
        <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm text-ink-700">{message}</pre>
      </details>

      <p className="mt-6 text-center"><Link to="/catalogo" className="text-sm font-semibold text-brand hover:underline">Continuar comprando</Link></p>
    </div>
  )
}
