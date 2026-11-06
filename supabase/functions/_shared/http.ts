export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}

const SITE_URL = (Deno.env.get('SHOPCHRISTMAS_SITE_URL') ?? Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '')
const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

export function allowOrigin(req: Request): string {
  const origin = req.headers.get('Origin') ?? ''
  if (origin === SITE_URL || LOCALHOST_ORIGIN.test(origin)) return origin
  return SITE_URL || '*'
}

export function json(data: unknown, status = 200, origin = '', extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin || SITE_URL || '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', ...extraHeaders },
  })
}

export function errorResponse(e: unknown, origin = '') {
  if (e instanceof ApiError) return json({ error: { code: e.code, message: e.message } }, e.status, origin)
  console.error('UNHANDLED', e instanceof Error ? e.message : e)
  return json({ error: { code: 'INTERNAL', message: 'Erro interno.' } }, 500, origin)
}

export function cors(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': allowOrigin(req), 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, GET' } })
  return null
}

export function requireEnv(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new ApiError(500, 'ENV_MISSING', `Configuração ausente: ${name}`)
  return v
}

export const str = (v: unknown, max = 2000): string => typeof v === 'string' ? v.slice(0, max) : ''
