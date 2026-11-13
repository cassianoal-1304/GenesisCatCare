import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type AdminState = 'unknown' | 'yes' | 'no'

interface AuthState {
  session: Session | null
  loading: boolean
  isAdmin: AdminState
  /** true quando o usuário chegou pelo link de recuperação de senha. */
  recovering: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

/** Confere na tabela admins (o RLS só deixa cada usuário ver o próprio registro). */
async function checkAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('admins').select('user_id').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return Boolean(data)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState<AdminState>('unknown')
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(s)
      setLoading(false)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) { setIsAdmin('unknown'); return }
    let alive = true
    setIsAdmin('unknown')
    checkAdmin(userId)
      .then((ok) => alive && setIsAdmin(ok ? 'yes' : 'no'))
      .catch(() => alive && setIsAdmin('no'))
    return () => { alive = false }
  }, [userId])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setRecovering(false)
  }, [])

  return (
    <AuthContext.Provider value={{ session, loading, isAdmin, recovering, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
