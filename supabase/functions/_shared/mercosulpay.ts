import { ApiError } from './http.ts'
import { requireEnv } from './http.ts'

const BASE = () => Deno.env.get('MERCOSULPAY_API_URL') ?? 'https://mercosulpay.com/api/public/v1'

interface ProviderResult { id?: string; status?: string; reference_id?: string; amount?: number; qr_code?: string; qr_code_image?: string; [k: string]: unknown }

async function provider(path: string, method = 'GET', body?: unknown): Promise<ProviderResult> {
  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await fetch(BASE() + path, {
        method,
        headers: { Authorization: `Bearer ${requireEnv('MERCOSULPAY_API_KEY')}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20_000),
      })
    } catch (e) {
      if (attempt < 1) { await new Promise(r => setTimeout(r, 1000)); continue }
      throw new ApiError(502, 'GATEWAY_UNCERTAIN', `Falha de rede com o gateway: ${(e as Error).message}`)
    }
    let data: any
    try { data = await res.json() } catch { throw new ApiError(502, 'GATEWAY_RESPONSE', 'Resposta incompleta do gateway.') }
    if (!res.ok) {
      const code = data?.error?.code ?? 'unknown'
      const retryable = res.status === 429 || res.status === 502 || code === 'provider_unavailable'
      const definitive = res.status === 401 || res.status === 403 || (res.status === 422 && !retryable)
      if (retryable && attempt < 1) { await new Promise(r => setTimeout(r, 1200)); continue }
      throw new ApiError(definitive ? 400 : 502, definitive ? 'GATEWAY_REJECTED' : 'GATEWAY_UNCERTAIN',
        `Gateway (${res.status} ${code}): ${data?.error?.message ?? 'erro'}`.slice(0, 250))
    }
    return data?.data ?? data
  }
}

export const brl = (cents: number) => cents / 100

export interface ChargeRecord {
  id: string; status: string; reference: string | null; amountCents: number
  qrCode?: string; qrCodeImage?: string
}
export function parseCharge(d: ProviderResult): ChargeRecord {
  if (typeof d?.id !== 'string' || typeof d?.amount !== 'number') throw new ApiError(502, 'GATEWAY_SCHEMA', 'Resposta do gateway sem campos obrigatórios.')
  return {
    id: d.id,
    status: String(d.status ?? 'pending'),
    reference: typeof d.reference_id === 'string' ? d.reference_id : null,
    amountCents: Math.round(d.amount * 100),
    qrCode: typeof d.qr_code === 'string' ? d.qr_code : undefined,
    qrCodeImage: typeof d.qr_code_image === 'string' ? d.qr_code_image : undefined,
  }
}

export async function createCharge(amountCents: number, referenceId: string, description: string): Promise<ChargeRecord> {
  const r = await provider('/pix/charges', 'POST', { amount: brl(amountCents), currency: 'BRL', description: description.slice(0, 200), reference_id: referenceId })
  return parseCharge(r)
}

export async function getCharge(id: string): Promise<ChargeRecord> {
  return parseCharge(await provider(`/pix/charges/${encodeURIComponent(id)}`))
}

// ---------- webhook (HMAC-SHA256: sha256=hmac(secret, `${ts}.${rawBody}`)) ----------
async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
}
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function verifyWebhook(headers: Headers, rawBody: string) {
  // Secret dedicado da ShopChristmas; fallback para o compartilhado do projeto.
  const secret = Deno.env.get('SHOPCHRISTMAS_MERCOSULPAY_WEBHOOK_SECRET')
    ?? requireEnv('MERCOSULPAY_WEBHOOK_SECRET')
  const ts = headers.get('x-mercosulpay-timestamp') ?? ''
  const sig = headers.get('x-mercosulpay-signature') ?? ''
  if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) throw new ApiError(401, 'STALE_DELIVERY', 'Entrega expirada.')
  const expected = `sha256=${await hmacHex(secret, `${ts}.${rawBody}`)}`
  if (!timingSafeEqual(expected, sig)) throw new ApiError(401, 'INVALID_SIGNATURE', 'Assinatura inválida.')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawBody))
  return {
    eventType: headers.get('x-mercosulpay-event') ?? '',
    deliveryId: headers.get('x-mercosulpay-delivery') ?? '',
    payloadHash: [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join(''),
  }
}
