import { money } from "./catalog.mjs";
import { FUNCTIONS_URL } from "./site-config.mjs";

const params = new URLSearchParams(location.search);
const id = params.get("id");
const t = params.get("t");

const error = document.querySelector("#order-error");
const info = document.querySelector("#order-info");
const statusEl = document.querySelector("#order-status");
const pixBox = document.querySelector("#order-pix");
const qrImg = document.querySelector("#order-qr");
const codeEl = document.querySelector("#order-code");
const copyButton = document.querySelector("#order-copy");

const STATUS_TEXT = {
  pending_payment: "Aguardando pagamento PIX…",
  paid: "Pagamento confirmado! Seu pedido foi recebido.",
  processing: "Pagamento confirmado — pedido em preparação.",
  shipped: "Pedido enviado.",
  delivered: "Pedido entregue.",
  payment_failed: "Pagamento não identificado.",
  expired: "PIX expirado.",
  cancelled: "Pedido cancelado.",
  refunded: "Pagamento estornado."
};

async function refresh() {
  try {
    const res = await fetch(`${FUNCTIONS_URL}/sc-order-status?id=${encodeURIComponent(id)}&t=${encodeURIComponent(t)}`);
    if (!res.ok) throw new Error("not-found");
    const order = await res.json();
    info.hidden = false;
    error.hidden = true;
    document.querySelector("#order-number").textContent = `#${order.number ?? ""}`;
    document.querySelector("#order-total").textContent = money(order.total_cents ?? 0);
    statusEl.textContent = STATUS_TEXT[order.status] ?? order.status;
    statusEl.dataset.state = order.status;
    statusEl.classList.toggle("is-paid", ["paid", "processing", "shipped", "delivered"].includes(order.status));
    if (order.status === "pending_payment" && order.payment) {
      pixBox.hidden = false;
      if (order.payment.qr_code_image) { qrImg.src = order.payment.qr_code_image; qrImg.hidden = false; }
      if (order.payment.qr_code) { codeEl.value = order.payment.qr_code; codeEl.parentElement.hidden = false; }
    } else {
      pixBox.hidden = true;
    }
    return order.status;
  } catch {
    info.hidden = true;
    error.textContent = "Pedido não encontrado ou link inválido.";
    error.hidden = false;
    return "not-found";
  }
}

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(codeEl.value);
    copyButton.textContent = "Copiado!";
    setTimeout(() => { copyButton.textContent = "Copiar código PIX"; }, 2000);
  } catch { codeEl.select(); }
});

if (!/^[0-9a-f-]{36}$/i.test(id ?? "") || !/^[0-9a-f-]{36}$/i.test(t ?? "")) {
  error.textContent = "Link de acompanhamento inválido.";
  error.hidden = false;
} else {
  refresh();
  setInterval(() => refresh(), 8000);
}
