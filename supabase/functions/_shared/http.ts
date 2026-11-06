export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}

const ALLOWED_ORIGIN = Deno.env.get('SHOPCHRISTMAS_SITE_URL') ?? Deno.env.get('SITE_URL') ?? '*'

export function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', ...extraHeaders },
  })
}

export function errorResponse(e: unknown) {
  if (e instanceof ApiError) return json({ error: { code: e.code, message: e.message } }, e.status)
  console.error('UNHANDLED', e instanceof Error ? e.message : e)
  return json({ error: { code: 'INTERNAL', message: 'Erro interno.' } }, 500)
}

export function cors(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, GET' } })
  return null
}

export function requireEnv(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new ApiError(500, 'ENV_MISSING', `Configuração ausente: ${name}`)
  return v
}

export const str = (v: unknown, max = 2000): string => typeof v === 'string' ? v.slice(0, max) : ''
