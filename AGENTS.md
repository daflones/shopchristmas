# ShopChristmas

This repository is a local, static, explicitly labelled storefront and checkout preview. It does not collect personal or payment information, submit orders, simulate real payment outcomes, or connect to another store's database.

Run `npm run dev` to serve the preview on localhost:3000. No dependency installation is necessary. Run `npm test` and `npm run check` for verification.

Commercial values are centralized in `catalog.mjs`, in integer BRL cents. These are display-only values, not a backend payment authority.

The owner supplied the campaign reference from Downloads. Optimized illustrative images are in `assets`. Do not present illustrations as real product photography. The owner stated three 1.80-meter trees with ornaments and lights, free nationwide shipping, seven calendar days for delivery, and a commercial return-request period of 30 days after purchase. The delivery period's starting event and detailed return conditions remain unconfirmed.

Payments are PIX only via MercosulPay — the owner removed card support entirely. Do not reintroduce card fields, raw card numbers, CVVs, false declines, or simulated testimonials presented as real.

The Supabase layer lives in `supabase/`: migration `20261106000001_shopchristmas.sql` creates isolated `sc_*` tables (products, orders, order_items, payment_attempts, webhook_events) with RLS and service-role-only RPCs (`sc_create_order`, `sc_apply_payment_state`, `sc_expire_stale_orders`). Edge Functions `create-order`, `mercosulpay-webhook`, and `order-status` follow the same HMAC + provider-confirmation + idempotency pattern proven in Utilidades Pra Casa. No remote deploy is authorized.

The existing Utilidades Pra Casa project is at `C:\Users\Eduardo Daflon\Desktop\loja produtos`. It has Next.js and Supabase configuration. No remote database has been accessed or changed for this preview.
