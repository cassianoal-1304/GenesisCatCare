import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/StoreContext'
import { supabase } from '../../lib/supabase'
import { friendlyError } from '../../lib/admin/errors'
import { Field, TextInput } from '../../components/admin/Form'
import { Spinner } from '../../components/ui/Feedback'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { settings } = useStore()
  useEffect(() => { document.title = `${title} | Painel` }, [title])
  return (
    <div className="grid min-h-dvh place-items-center bg-ink-50 px-4 py-10">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-xl bg-brand font-display text-lg font-semibold text-white">
            {(settings?.store_name ?? 'L').charAt(0).toUpperCase()}
          </span>
          <span className="font-display text-lg font-semibold">{settings?.store_name ?? 'Painel'}</span>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-ink-100 sm:p-8">
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  )
}

const ErrorBox = ({ message }: { message: string }) =>
  message ? <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{message}</p> : null

/* ------------------------------------------------------------------ */
export function LoginPage() {
  const { session, isAdmin, signIn, loading } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/admin'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (loading) return <Spinner />
  if (session && isAdmin === 'yes') return <Navigate to={from.startsWith('/admin') ? from : '/admin'} replace />
  if (session && isAdmin === 'unknown') return <Spinner label="Verificando acesso..." />
  if (session && (isAdmin === 'no' || isAdmin === 'error')) return <Navigate to="/admin" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!EMAIL_RE.test(email.trim())) return setError('Informe um e-mail válido.')
    if (!password) return setError('Informe a senha.')
    setBusy(true)
    try { await signIn(email, password) } catch (err) { setError(friendlyError(err, 'Não foi possível entrar.')) }
    finally { setBusy(false) }
  }

  return (
    <AuthShell title="Entrar no painel" subtitle="Acesso restrito a administradores.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="E-mail">
          <TextInput type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
        <Field label="Senha">
          <TextInput type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorBox message={error} />
        <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Entrando...' : 'Entrar'}</button>
        <p className="text-center text-sm">
          <Link to="/admin/recuperar-senha" className="font-medium text-brand hover:underline">Esqueci minha senha</Link>
        </p>
      </form>
    </AuthShell>
  )
}

/* ------------------------------------------------------------------ */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!EMAIL_RE.test(email.trim())) return setError('Informe um e-mail válido.')
    setBusy(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/admin/redefinir-senha`,
    })
    setBusy(false)
    if (err) setError(friendlyError(err, 'Não foi possível enviar o e-mail.'))
    else setSent(true)
  }

  return (
    <AuthShell title="Recuperar acesso" subtitle="Enviaremos um link para você criar uma nova senha.">
      {sent ? (
        <div className="space-y-4 text-sm text-ink-700">
          <p className="rounded-xl bg-emerald-50 px-3.5 py-3 text-emerald-800">
            Se o e-mail estiver cadastrado, você receberá o link em instantes. Verifique também a caixa de spam.
          </p>
          <Link to="/admin/login" className="btn-secondary w-full">Voltar ao login</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="E-mail">
            <TextInput type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
          <ErrorBox message={error} />
          <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Enviando...' : 'Enviar link'}</button>
          <p className="text-center text-sm"><Link to="/admin/login" className="font-medium text-brand hover:underline">Voltar ao login</Link></p>
        </form>
      )}
    </AuthShell>
  )
}

/* ------------------------------------------------------------------ */
export function ResetPasswordPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // O Supabase processa o token do link logo após o carregamento
  const [waited, setWaited] = useState(false)
  useEffect(() => { const t = setTimeout(() => setWaited(true), 2500); return () => clearTimeout(t) }, [])

  if (loading || (!session && !waited)) return <Spinner label="Validando link..." />
  if (!session) {
    return (
      <AuthShell title="Link inválido ou expirado">
        <p className="text-sm text-ink-500">Solicite um novo link de recuperação.</p>
        <Link to="/admin/recuperar-senha" className="btn-primary mt-5 w-full">Solicitar novo link</Link>
      </AuthShell>
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) return setError('A senha deve ter pelo menos 8 caracteres.')
    if (password !== confirm) return setError('As senhas não conferem.')
    setBusy(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (err) setError(friendlyError(err, 'Não foi possível alterar a senha.'))
    else navigate('/admin', { replace: true })
  }

  return (
    <AuthShell title="Criar nova senha" subtitle={session.user.email}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Nova senha" hint="Mínimo de 8 caracteres.">
          <TextInput type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </Field>
        <Field label="Confirmar nova senha">
          <TextInput type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <ErrorBox message={error} />
        <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Salvando...' : 'Salvar nova senha'}</button>
      </form>
    </AuthShell>
  )
}
