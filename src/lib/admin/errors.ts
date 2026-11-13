/** Converte erros do Supabase/Postgres em mensagens claras em português. */
export function friendlyError(err: unknown, fallback = 'Não foi possível concluir a operação.'): string {
  if (!err) return fallback
  const e = err as { code?: string; message?: string; details?: string; status?: number }
  const msg = e.message ?? ''
  switch (e.code) {
    case 'P0001': return msg || fallback                 // mensagens das funções SQL (já em português)
    case '23505':
      if (/slug/.test(msg + (e.details ?? ''))) return 'Já existe um registro com este endereço (slug).'
      if (/sku/.test(msg + (e.details ?? ''))) return 'Já existe um produto ou variação com este SKU.'
      return 'Registro duplicado.'
    case '23503': return 'Este registro está em uso por outros dados e não pode ser excluído.'
    case '23514': return 'Algum valor informado é inválido (verifique preços, estoque e campos obrigatórios).'
    case '42501': return 'Acesso negado. Sua conta não tem permissão de administrador.'
    case 'PGRST301': case 'PGRST303': return 'Sua sessão expirou. Entre novamente.'
  }
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Sem conexão com o servidor. Verifique sua internet.'
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.'
  if (/Email not confirmed/i.test(msg)) return 'E-mail ainda não confirmado.'
  if (/rate limit|too many/i.test(msg)) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
  if (/Password should be/i.test(msg)) return 'A senha deve ter pelo menos 6 caracteres.'
  if (/exceeded the maximum allowed size|Payload too large/i.test(msg)) return 'Arquivo muito grande.'
  if (/mime type/i.test(msg)) return 'Tipo de arquivo não permitido.'
  console.error(err)
  return fallback
}
