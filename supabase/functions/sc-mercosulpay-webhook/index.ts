import { cors, errorResponse, json, ApiError, allowOrigin } from '../_shared/http.ts'
import { serviceClient } from '../_shared/db.ts'
import { verifyWebhook, getCharge } from '../_shared/mercosulpay.ts'

/**
 * Webhook MercosulPay â€” ShopChristmas.
 * Assinatura HMAC-SHA256 + timestamp + idempotÃªncia por delivery id.
 * ConfirmaÃ§Ã£o cruzada via consulta autenticada ao gateway antes de marcar pago.
 */
Deno.serve(async (req) => {
  const pre = cors(req); if (pre) return pre
  const O = allowOrigin(req)
  try {
    if (req.method !== 'POST') throw new ApiError(405, 'METHOD', 'MÃ©todo invÃ¡lido.')
    const rawBody = await req.text()
    const { eventType, deliveryId, payloadHash } = await verifyWebhook(req.headers, rawBody)
    const db = serviceClient()

    let payload: any = {}
    try { payload = JSON.parse(rawBody) } catch { /* mantÃ©m raw */ }
    const eventId = deliveryId || String(payload?.id ?? payload?.event_id ?? payloadHash)

    // dedupe: constraint unique (provider, event_id)
    const { error: insErr } = await db.from('sc_webhook_events').insert({
      provider: 'mercosulpay', event_id: eventId, event_type: eventType || 'unknown',
      payload_hash: payloadHash, payload,
    })
    if (insErr?.code === '23505') return json({ ok: true, deduplicated: true }, 200, O)

    const chargeId: string | undefined =
      payload?.data?.id ?? payload?.charge_id ?? payload?.id

    const finish = async (note?: string) => {
      await db.from('sc_webhook_events').update({ processed_at: new Date().toISOString(), error: note ?? null })
        .eq('provider', 'mercosulpay').eq('event_id', eventId)
    }

    if (!chargeId) { await finish('no charge id'); return json({ ok: true, ignored: true }, 200, O) }

    // confirma com consulta autenticada â€” nÃ£o confia sÃ³ no payload
    const charge = await getCharge(chargeId).catch(() => null)
    if (!charge?.reference) { await finish('charge sem referÃªncia'); return json({ ok: true, ignored: true }, 200, O) }

    const r = await db.rpc('sc_apply_payment_state', {
      p_order: charge.reference, p_provider: 'mercosulpay',
      p_provider_ref: charge.id, p_amount: charge.amountCents,
      p_state: charge.status,
    })
    if (r.error || !r.data?.ok) { await finish(r.error?.message ?? r.data?.error); return json({ ok: false }, 200, O) }

    await finish()
    return json({ ok: true }, 200, O)
  } catch (e) { return errorResponse(e, O) }
})
