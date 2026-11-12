import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** true quando as variáveis de ambiente do Supabase foram configuradas. */
export const isSupabaseConfigured = Boolean(url && anonKey)

// Somente a chave pública (anon). A segurança dos dados é garantida pelo RLS.
export const supabase: SupabaseClient = createClient(
  url || 'http://localhost', anonKey || 'missing-key',
  { auth: { persistSession: true, autoRefreshToken: true } },
)
