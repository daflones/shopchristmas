import { cors, errorResponse, json, ApiError, str, allowOrigin, requireEnv } from '../_shared/http.ts'
import { serviceClient } from '../_shared/db.ts'

/**
 * Painel administrativo ShopChristmas.
 * POST { action: 'login', email, password } -> { token } (válido 12h)
 * POST { action: 'stats' | 'orders' | 'order' | 'attempts' | 'events', token, page?, per?, id? }
 * Credenciais vivem em secrets (SHOPCHRISTMAS_ADMIN_*), nunca no código.
 */
const encoder = new TextEncoder()
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)))
}

async function digest(text: string) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(text)))
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function issueToken(email: string) {
  const secret = requireEnv('SHOPCHRISTMAS_ADMIN_SECRET')
  const exp = Date.now() + TOKEN_TTL_MS
  return `${exp}.${await hmac(secret, `${email}.${exp}`)}`
}

async function requireAdmin(token: string) {
  const secret = requireEnv('SHOPCHRISTMAS_ADMIN_SECRET')
  const [exp, sig] = token.split('.')
  const expMs = Number(exp)
  if (!expMs || expMs < Date.now() || !sig) throw new ApiError(401, 'AUTH', 'Sessão expirada. Entre novamente.')
  const email = requireEnv('SHOPCHRISTMAS_ADMIN_EMAIL')
  const expected = await hmac(secret, `${email}.${exp}`)
  if (!safeEqual(sig, expected)) throw new ApiError(401, 'AUTH', 'Token inválido.')
}

function pageParams(b: Record<string, unknown>) {
  const page = Math.max(1, Math.min(10_000, Math.trunc(Number(b?.page)) || 1))
  const per = Math.max(1, Math.min(50, Math.trunc(Number(b?.per)) || 15))
  return { page, per, from: (page - 1) * per, to: (page - 1) * per + per - 1 }
}

Deno.serve(async (req) => {
  const pre = cors(req); if (pre) return pre
  const O = allowOrigin(req)
  try {
    if (req.method !== 'POST') throw new ApiError(405, 'METHOD', 'Método inválido.')
    const b = await req.json().catch(() => ({}))
    const action = str(b?.action, 20)
    const db = serviceClient()

    if (action === 'login') {
      const email = str(b?.email, 200).toLowerCase().trim()
      const password = str(b?.password, 200)
      const [emailHash, passHash] = await Promise.all([digest(email), digest(password)])
      const ok = safeEqual(emailHash, await digest(requireEnv('SHOPCHRISTMAS_ADMIN_EMAIL').toLowerCase().trim()))
        && safeEqual(passHash, await digest(requireEnv('SHOPCHRISTMAS_ADMIN_PASSWORD')))
      if (!ok) throw new ApiError(401, 'AUTH', 'E-mail ou senha incorretos.')
      return json({ ok: true, token: await issueToken(requireEnv('SHOPCHRISTMAS_ADMIN_EMAIL')) }, 200, O)
    }

    const token = str(b?.token, 200)
    await requireAdmin(token)

    if (action === 'stats') {
      const { data: orders } = await db.from('sc_orders').select('status,total_cents,created_at')
      const { count: attempts } = await db.from('sc_payment_attempts').select('id', { count: 'exact', head: true })
      const { count: events } = await db.from('sc_webhook_events').select('id', { count: 'exact', head: true })
      const { data: product } = await db.from('sc_products').select('name,price_cents,compare_at_cents').eq('slug', 'kit-3-arvores-natal').maybeSingle()
      const list = orders ?? []
      const paid = list.filter((o) => ['paid', 'processing'].includes(o.status))
      const week = Date.now() - 7 * 24 * 60 * 60 * 1000
      return json({
        ok: true,
        stats: {
          orders_total: list.length,
          orders_paid: paid.length,
          orders_pending: list.filter((o) => o.status === 'pending_payment').length,
          orders_failed: list.filter((o) => ['payment_failed', 'expired', 'cancelled'].includes(o.status)).length,
          orders_last_7d: list.filter((o) => Date.parse(o.created_at) > week).length,
          revenue_cents: paid.reduce((s, o) => s + o.total_cents, 0),
          avg_ticket_cents: paid.length ? Math.round(paid.reduce((s, o) => s + o.total_cents, 0) / paid.length) : 0,
          conversion_pct: list.length ? Math.round((paid.length / list.length) * 1000) / 10 : 0,
          payment_attempts: attempts ?? 0,
          webhook_events: events ?? 0,
        },
        product,
      }, 200, O)
    }

    if (action === 'orders') {
      const { from, to, page, per } = pageParams(b)
      const { data, count, error } = await db.from('sc_orders')
        .select('id,number,email,customer_name,phone,status,total_cents,currency,utm,created_at,paid_at', { count: 'exact' })
        .order('created_at', { ascending: false }).range(from, to)
      if (error) throw new ApiError(500, 'QUERY', error.message.slice(0, 200))
      return json({ ok: true, rows: data, total: count ?? 0, page, per }, 200, O)
    }

    if (action === 'order') {
      const id = str(b?.id, 40)
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(400, 'BAD_ID', 'Pedido inválido.')
      const { data: order } = await db.from('sc_orders').select('*').eq('id', id).maybeSingle()
      if (!order) throw new ApiError(404, 'NOT_FOUND', 'Pedido não encontrado.')
      const { data: items } = await db.from('sc_order_items').select('*').eq('order_id', id)
      const { data: attempts } = await db.from('sc_payment_attempts')
        .select('id,provider,provider_ref,status,amount_cents,currency,error,created_at,updated_at')
        .eq('order_id', id).order('created_at', { ascending: false })
      const { data: events } = await db.from('sc_webhook_events')
        .select('id,event_id,event_type,processed_at,error,created_at')
        .order('created_at', { ascending: false }).limit(20)
      return json({ ok: true, order, items: items ?? [], attempts: attempts ?? [], events: events ?? [] }, 200, O)
    }

    if (action === 'attempts') {
      const { from, to, page, per } = pageParams(b)
      const { data, count, error } = await db.from('sc_payment_attempts')
        .select('id,order_id,provider,provider_ref,status,amount_cents,error,created_at,updated_at,sc_orders(number,email,customer_name)', { count: 'exact' })
        .order('created_at', { ascending: false }).range(from, to)
      if (error) throw new ApiError(500, 'QUERY', error.message.slice(0, 200))
      return json({ ok: true, rows: data, total: count ?? 0, page, per }, 200, O)
    }

    if (action === 'events') {
      const { from, to, page, per } = pageParams(b)
      const { data, count, error } = await db.from('sc_webhook_events')
        .select('id,provider,event_id,event_type,processed_at,error,created_at,payload', { count: 'exact' })
        .order('created_at', { ascending: false }).range(from, to)
      if (error) throw new ApiError(500, 'QUERY', error.message.slice(0, 200))
      return json({ ok: true, rows: data, total: count ?? 0, page, per }, 200, O)
    }

    throw new ApiError(400, 'BAD_ACTION', 'Ação inválida.')
  } catch (e) { return errorResponse(e, O) }
})
