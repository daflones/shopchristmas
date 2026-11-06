import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { store, money, offerSummary } from "../catalog.mjs";
import { createPreviewServer } from "../server.mjs";

test("a oferta representa um kit de três árvores, com preço em centavos", () => {
  assert.equal(store.product.treeCount, 3);
  assert.equal(store.product.heightMeters, 1.8);
  assert.deepEqual(offerSummary(), {
    productCents: 10997,
    shippingCents: 0,
    totalCents: 10997,
    savingCents: 14000,
    discountPercent: 56
  });
  assert.equal(store.shipping.calendarDays, 7);
  assert.equal(store.returns.daysAfterPurchase, 30);
});

test("a moeda usa formato brasileiro e rejeita valores inválidos", () => {
  assert.equal(money(10997).replaceAll("\u00a0", " "), "R$ 109,97");
  assert.equal(money(0).replaceAll("\u00a0", " "), "R$ 0,00");
  for (const value of [-1, 1.5, NaN, Infinity, "10997"]) assert.throws(() => money(value), TypeError);
});

test("o checkout é demonstrativo e não possui formulário de envio", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /PRÉVIA DEMONSTRATIVA/);
  assert.match(html, /disabled>Pagamento em configuração/);
  assert.match(html, /Pagamento via PIX/);
  assert.match(html, /pix-garantia\.webp/);
  assert.doesNotMatch(html, /data-method=|card-panel|Cartão de crédito/);
  assert.doesNotMatch(html, /<form\b/i);
  assert.doesNotMatch(html, /<input[^>]+name=/i);
  assert.match(html, /Imagem ilustrativa/);
});

test("a prévia não inclui chamadas financeiras, rastreadores ou persistência", async () => {
  const source = await readFile(new URL("../app.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\b(fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|sendBeacon)\b/);
  assert.doesNotMatch(source, /document\.cookie|innerHTML/);
});

test("o servidor só entrega arquivos públicos e rejeita escritas", async (t) => {
  const server = createPreviewServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const path of ["/", "/app.mjs", "/catalog.mjs", "/styles.css", "/assets/trees.webp"]) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-security-policy"), /connect-src 'none'/);
    await response.arrayBuffer();
  }
  for (const path of ["/.env", "/package.json", "/server.mjs", "/api/pay", "/%2e%2e/package.json"]) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 404);
    await response.arrayBuffer();
  }
  const response = await fetch(origin, { method: "POST", body: "no-data" });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD");
  await response.arrayBuffer();
});
