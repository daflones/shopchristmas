import { store, money, offerSummary } from "./catalog.mjs";
import { FUNCTIONS_URL } from "./site-config.mjs";

const summary = offerSummary();
const amounts = {
  original: store.product.originalPriceCents,
  price: summary.productCents,
  saving: summary.savingCents,
  total: summary.totalCents
};

document.querySelectorAll("[data-money]").forEach((element) => {
  element.textContent = money(amounts[element.dataset.money]);
});
document.querySelectorAll("[data-discount]").forEach((element) => {
  element.textContent = `≈ ${summary.discountPercent}% OFF`;
});
document.querySelector("#year").textContent = new Date().getFullYear();

const checkout = document.querySelector("#checkout-dialog");
const policy = document.querySelector("#policy-dialog");
let previousFocus;

function openDialog(dialog) {
  previousFocus = document.activeElement;
  dialog.showModal();
  document.body.classList.add("dialog-open");
}

document.querySelectorAll("[data-checkout]").forEach((button) => {
  button.addEventListener("click", () => openDialog(checkout));
});

document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener("close", () => {
    document.body.classList.remove("dialog-open");
    previousFocus?.focus();
  });
});

const policies = {
  privacy: {
    title: "Privacidade",
    paragraphs: [
      "Para concluir o pedido coletamos nome, e-mail, telefone e endereço de entrega. Esses dados são usados exclusivamente para processar a compra, emitir a cobrança PIX via MercosulPay e realizar a entrega.",
      "Não solicitamos nem armazenamos dados de cartão. O pagamento é confirmado diretamente pelo provedor e registramos apenas o status da transação.",
      "Identificação do controlador dos dados, canais de contato e prazos de retenção serão informados pela loja antes da operação definitiva, conforme a LGPD."
    ]
  },
  terms: {
    title: "Termos de compra",
    paragraphs: [
      `Oferta: ${store.product.name}, com ${store.product.heightMeters.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} m cada, incluindo bolas, laços, estrelas e luzes. Preço original ${money(store.product.originalPriceCents)} e promocional ${money(summary.productCents)} pelo kit completo, com frete grátis.`,
      "O pedido é confirmado somente após a aprovação do pagamento PIX pelo provedor. Códigos PIX expirados ou não pagos podem cancelar o pedido automaticamente.",
      "As imagens da campanha são ilustrativas e os presentes pertencem ao cenário. Fotos reais do produto serão disponibilizadas pela loja."
    ]
  },
  delivery: {
    title: "Entrega e devolução",
    paragraphs: [
      `Frete grátis para ${store.shipping.coverage}, com entrega em até ${store.shipping.calendarDays} dias corridos a partir da confirmação do pagamento.`,
      `É possível solicitar a devolução em até ${store.returns.daysAfterPurchase} dias após a compra, sem prejuízo dos direitos legais do consumidor. O canal de solicitação será informado no acompanhamento do pedido.`,
      "Você pode acompanhar o status do pedido pelo link gerado após a compra."
    ]
  }
};

// ---------- avaliações (somente depoimentos reais cadastrados no catálogo) ----------
const reviewsGrid = document.querySelector("#reviews-grid");
if (store.reviews.length) {
  for (const review of store.reviews) {
    const card = document.createElement("article");
    card.className = "review-card";
    const stars = document.createElement("div");
    stars.className = "review-stars";
    stars.textContent = "★".repeat(5);
    stars.setAttribute("aria-label", "Avaliação: 5 de 5 estrelas");
    const text = document.createElement("p");
    text.textContent = review.text;
    const author = document.createElement("footer");
    const name = document.createElement("strong");
    name.textContent = review.name;
    const meta = document.createElement("span");
    meta.textContent = review.meta ?? "";
    author.append(name, meta);
    card.append(stars, text, author);
    reviewsGrid.append(card);
  }
} else {
  document.querySelector("#reviews-empty").hidden = false;
}

document.querySelectorAll("[data-policy]").forEach((button) => {
  button.addEventListener("click", () => {
    const content = policies[button.dataset.policy];
    document.querySelector("#policy-title").textContent = content.title;
    const paragraphs = content.paragraphs.map((text) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = text;
      return paragraph;
    });
    document.querySelector("#policy-content").replaceChildren(...paragraphs);
    openDialog(policy);
  });
});

// ---------- checkout PIX (MercosulPay via Supabase Edge Functions) ----------
const form = document.querySelector("#customer-form");
const submitButton = document.querySelector("#submit-order");
const formError = document.querySelector("#form-error");
const pixIntro = document.querySelector("#pix-intro");
const pixLive = document.querySelector("#pix-live");
const pixStatus = document.querySelector("#pix-status");
const pixQrImg = document.querySelector("#pix-qr-img");
const pixCode = document.querySelector("#pix-code");
const pixCopy = document.querySelector("#pix-copy");
const pixTrack = document.querySelector("#pix-track");

const utm = {};
for (const [key, value] of new URLSearchParams(location.search)) {
  if (/^(utm_|fbclid|gclid)/.test(key)) utm[key] = value.slice(0, 120);
}
const idempotencyKey = crypto.randomUUID();
let pollTimer;

const STATUS_TEXT = {
  pending_payment: "Aguardando pagamento PIX…",
  paid: "Pagamento confirmado! Pedido recebido.",
  payment_failed: "Pagamento não identificado — gere um novo PIX.",
  expired: "PIX expirado — gere um novo código.",
  cancelled: "Pedido cancelado.",
  refunded: "Pagamento estornado.",
  processing: "Pagamento confirmado — pedido em preparação."
};

function setPixState(order) {
  pixIntro.hidden = true;
  pixLive.hidden = false;
  pixStatus.textContent = STATUS_TEXT[order.status] ?? `Status: ${order.status}`;
  pixStatus.dataset.state = order.status;
  if (order.payment?.qr_code_image) {
    pixQrImg.src = order.payment.qr_code_image;
    pixQrImg.hidden = false;
  }
  if (order.payment?.qr_code) {
    pixCode.value = order.payment.qr_code;
    pixCode.parentElement.hidden = false;
  }
  if (order.order_url) pixTrack.href = order.order_url;
  if (["paid", "processing"].includes(order.status)) {
    pixStatus.classList.add("is-paid");
    clearInterval(pollTimer);
  }
}

async function pollStatus(orderId, token) {
  try {
    const res = await fetch(`${FUNCTIONS_URL}/sc-order-status?id=${orderId}&t=${token}`);
    if (!res.ok) return;
    const order = await res.json();
    setPixState({ ...order, order_url: pixTrack.href });
  } catch { /* rede instável — nova tentativa no próximo ciclo */ }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitButton.disabled) return;
  formError.hidden = true;
  submitButton.disabled = true;
  submitButton.textContent = "GERANDO PIX…";
  try {
    const data = new FormData(form);
    const res = await fetch(`${FUNCTIONS_URL}/sc-create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer: {
          name: data.get("name"),
          email: data.get("email"),
          phone: data.get("phone")
        },
        address: {
          zip: data.get("zip"),
          line1: data.get("line1"),
          number: data.get("number"),
          line2: data.get("line2"),
          district: data.get("district"),
          city: data.get("city"),
          state: data.get("state")
        },
        utm,
        idempotency_key: idempotencyKey
      })
    });
    const result = await res.json();
    if (!res.ok || !result?.ok) throw new Error(result?.error?.message ?? "Não foi possível gerar o PIX.");
    setPixState(result);
    clearInterval(pollTimer);
    pollTimer = setInterval(() => pollStatus(result.order_id, result.access_token), 5000);
  } catch (error) {
    formError.textContent = error.message;
    formError.hidden = false;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "GERAR PIX";
  }
});

pixCopy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(pixCode.value);
    pixCopy.textContent = "Copiado!";
    setTimeout(() => { pixCopy.textContent = "Copiar código PIX"; }, 2000);
  } catch {
    pixCode.select();
  }
});
