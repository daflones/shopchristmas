import { cors, errorResponse, json, ApiError } from '../_shared/http.ts'
import { serviceClient } from '../_shared/db.ts'
import { getCharge } from '../_shared/mercosulpay.ts'

/**
 * GET /order-status?id=<uuid>&t=<access_token>
 * Polling público de status do pedido (checkout convidado).
 * Não expõe dados do cliente — apenas status e dados da tentativa PIX.
 */
Deno.serve(async (req) => {
  const pre = cors(req); if (pre) return pre
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id') ?? ''
    const t = url.searchParams.get('t') ?? ''
    if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(t))
      throw new ApiError(404, 'NOT_FOUND', 'Pedido não encontrado.')

    const db = serviceClient()
    const { data } = await db.from('sc_orders')
      .select('number,status,total_cents,currency')
      .eq('id', id).eq('access_token', t).maybeSingle()
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Pedido não encontrado.')

    const { data: att } = await db.from('sc_payment_attempts')
      .select('status,provider_ref,qr_code,qr_code_image,updated_at')
      .eq('order_id', id).eq('provider', 'mercosulpay')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()

    // Fallback: se o webhook não chegou, confirma direto no provedor (a cada 30s no máximo).
    if (data.status === 'pending_payment' && att?.provider_ref
        && Date.now() - Date.parse(att.updated_at) > 30_000) {
      const charge = await getCharge(att.provider_ref).catch(() => null)
      if (charge) {
        const r = await db.rpc('sc_apply_payment_state', {
          p_order: id, p_provider: 'mercosulpay',
          p_provider_ref: charge.id, p_amount: charge.amountCents, p_state: charge.status,
        })
        if (!r.error && r.data?.ok && !r.data?.already) {
          const { data: fresh } = await db.from('sc_orders').select('status').eq('id', id).single()
          if (fresh) data.status = fresh.status
          const { data: freshAtt } = await db.from('sc_payment_attempts').select('status').eq('order_id', id)
            .order('created_at', { ascending: false }).limit(1).maybeSingle()
          if (freshAtt) att.status = freshAtt.status
        }
      }
    }

    return json({
      ok: true, number: data.number, status: data.status,
      total_cents: data.total_cents, currency: data.currency,
      payment: att ? { status: att.status, qr_code: att.qr_code, qr_code_image: att.qr_code_image } : null,
    })
  } catch (e) { return errorResponse(e) }
})
