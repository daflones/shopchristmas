import { cors, errorResponse, json, ApiError } from '../_shared/http.ts'
import { serviceClient } from '../_shared/db.ts'
import { verifyWebhook, getCharge } from '../_shared/mercosulpay.ts'

/**
 * Webhook MercosulPay — ShopChristmas.
 * Assinatura HMAC-SHA256 + timestamp + idempotência por delivery id.
 * Confirmação cruzada via consulta autenticada ao gateway antes de marcar pago.
 */
Deno.serve(async (req) => {
  const pre = cors(req); if (pre) return pre
  try {
    if (req.method !== 'POST') throw new ApiError(405, 'METHOD', 'Método inválido.')
    const rawBody = await req.text()
    const { eventType, deliveryId, payloadHash } = await verifyWebhook(req.headers, rawBody)
    const db = serviceClient()

    let payload: any = {}
    try { payload = JSON.parse(rawBody) } catch { /* mantém raw */ }
    const eventId = deliveryId || String(payload?.id ?? payload?.event_id ?? payloadHash)

    // dedupe: constraint unique (provider, event_id)
    const { error: insErr } = await db.from('sc_webhook_events').insert({
      provider: 'mercosulpay', event_id: eventId, event_type: eventType || 'unknown',
      payload_hash: payloadHash, payload,
    })
    if (insErr?.code === '23505') return json({ ok: true, deduplicated: true })

    const chargeId: string | undefined =
      payload?.data?.id ?? payload?.charge_id ?? payload?.id

    const finish = async (note?: string) => {
      await db.from('sc_webhook_events').update({ processed_at: new Date().toISOString(), error: note ?? null })
        .eq('provider', 'mercosulpay').eq('event_id', eventId)
    }

    if (!chargeId) { await finish('no charge id'); return json({ ok: true, ignored: true }) }

    // confirma com consulta autenticada — não confia só no payload
    const charge = await getCharge(chargeId).catch(() => null)
    if (!charge?.reference) { await finish('charge sem referência'); return json({ ok: true, ignored: true }) }

    const r = await db.rpc('sc_apply_payment_state', {
      p_order: charge.reference, p_provider: 'mercosulpay',
      p_provider_ref: charge.id, p_amount: charge.amountCents,
      p_state: charge.status,
    })
    if (r.error || !r.data?.ok) { await finish(r.error?.message ?? r.data?.error); return json({ ok: false }) }

    await finish()
    return json({ ok: true })
  } catch (e) { return errorResponse(e) }
})
