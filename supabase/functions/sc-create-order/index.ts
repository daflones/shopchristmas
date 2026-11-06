import { cors, errorResponse, json, ApiError, str, allowOrigin } from '../_shared/http.ts'
import { serviceClient } from '../_shared/db.ts'
import { createCharge } from '../_shared/mercosulpay.ts'

/**
 * POST /create-order
 * Cria pedido PIX (preço recalculado no servidor via RPC) + cobrança MercosulPay.
 * O navegador envia apenas dados do cliente e endereço — nunca valores.
 */
Deno.serve(async (req) => {
  const pre = cors(req); if (pre) return pre
  const O = allowOrigin(req)
  try {
    if (req.method !== 'POST') throw new ApiError(405, 'METHOD', 'Método inválido.')
    const b = await req.json().catch(() => ({}))

    const email = str(b?.customer?.email, 200).toLowerCase().trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError(400, 'BAD_EMAIL', 'E-mail inválido.')
    const name = str(b?.customer?.name, 200)
    const phone = str(b?.customer?.phone, 40)

    const address = b?.address && typeof b.address === 'object' ? {
      zip: str(b.address.zip, 20),
      line1: str(b.address.line1, 200),
      number: str(b.address.number, 20),
      line2: str(b.address.line2, 200),
      district: str(b.address.district, 120),
      city: str(b.address.city, 100),
      state: str(b.address.state, 2).toUpperCase(),
    } : null
    if (!address?.zip || !address?.line1 || !address?.number || !address?.city || !/^[A-Z]{2}$/.test(address?.state ?? ''))
      throw new ApiError(400, 'BAD_ADDRESS', 'Informe o endereço completo para entrega.')

    const utm: Record<string, string> = {}
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid']) {
      const v = str(b?.utm?.[k], 120); if (v) utm[k] = v
    }

    const db = serviceClient()
    const { data: result, error } = await db.rpc('sc_create_order', {
      p_product_slug: 'kit-3-arvores-natal',
      p_email: email, p_name: name || null, p_phone: phone || null,
      p_shipping: address, p_utm: utm,
      p_idempotency: str(b?.idempotency_key, 80) || null,
    })
    if (error) throw new ApiError(400, 'ORDER_FAILED', error.message.slice(0, 250))
    if (!result?.ok) throw new ApiError(400, 'ORDER_FAILED', result?.error ?? 'Falha ao criar pedido.')

    const orderId: string = result.order_id
    const total: number = result.total_cents
    const siteUrl = (Deno.env.get('SHOPCHRISTMAS_SITE_URL') ?? 'https://shopchristmas.com.br').replace(/\/$/, '')
    const orderUrl = `${siteUrl}/pedido.html?id=${orderId}&t=${result.access_token}`

    // Pedido já existente (retry/duplo clique): devolve a tentativa atual sem nova cobrança.
    if (result.duplicated) {
      const { data: att } = await db.from('sc_payment_attempts')
        .select('status,qr_code,qr_code_image,amount_cents')
        .eq('order_id', orderId).order('created_at', { ascending: false }).limit(1).maybeSingle()
      const { data: order } = await db.from('sc_orders').select('number,total_cents').eq('id', orderId).single()
      return json({
        ok: true, order_id: orderId, access_token: result.access_token,
        number: order?.number, total_cents: att?.amount_cents ?? order?.total_cents,
        duplicated: true,
        payment: { method: 'pix', status: att?.status ?? 'pending', qr_code: att?.qr_code, qr_code_image: att?.qr_code_image, order_url: orderUrl },
      }, 200, O)
    }

    const { data: order } = await db.from('sc_orders').select('number').eq('id', orderId).single()
    const charge = await createCharge(total, orderId, `Pedido #${order?.number ?? ''} ShopChristmas`)
    await db.from('sc_payment_attempts').insert({
      order_id: orderId, provider: 'mercosulpay', provider_ref: charge.id,
      status: 'pending', amount_cents: total, currency: 'BRL',
      qr_code: charge.qrCode ?? null, qr_code_image: charge.qrCodeImage ?? null,
    })

    return json({
      ok: true, order_id: orderId, access_token: result.access_token,
      number: order?.number, total_cents: total, duplicated: false,
      payment: { method: 'pix', status: 'pending', qr_code: charge.qrCode, qr_code_image: charge.qrCodeImage, order_url: orderUrl },
    }, 200, O)
  } catch (e) { return errorResponse(e, O) }
})
