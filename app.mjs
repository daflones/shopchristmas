import { store, money, offerSummary } from "./catalog.mjs";

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
    title: "Privacidade nesta demonstração",
    paragraphs: [
      "Esta prévia não coleta informações pessoais, não envia formulários e não utiliza cookies de marketing, pixels, ferramentas de analytics ou armazenamento de dados de cartão.",
      "Os campos do checkout estão desabilitados e contêm somente exemplos. Nenhuma conexão com banco de dados ou provedor de pagamentos é realizada.",
      "Antes de uma operação comercial, será necessário informar o controlador dos dados, seus canais de contato, finalidades e bases legais do tratamento, prazos de retenção, operadores e os meios de exercício dos direitos previstos na LGPD."
    ]
  },
  terms: {
    title: "Condições da prévia",
    paragraphs: [
      `Oferta informada pelo responsável: ${store.product.name}, com ${store.product.heightMeters.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} m cada, incluindo bolas, laços, estrelas e luzes. Preço original ${money(store.product.originalPriceCents)} e promocional ${money(summary.productCents)} pelo kit completo.`,
      "Esta página é um protótipo visual. Não há venda, reserva de estoque, contratação, cobrança ou aprovação de pagamento. As imagens são ilustrativas e os presentes pertencem ao cenário.",
      "Identificação do fornecedor, CNPJ ou CPF aplicável, endereço, atendimento, fotos reais e condições comerciais completas devem ser definidos antes de disponibilizar vendas."
    ]
  },
  delivery: {
    title: "Entrega e devolução",
    paragraphs: [
      `Condição fornecida pelo responsável: frete grátis para ${store.shipping.coverage}, com entrega em até ${store.shipping.calendarDays} dias corridos. O evento que inicia a contagem do prazo ainda não foi informado.`,
      `O responsável informa a possibilidade de solicitar devolução em até ${store.returns.daysAfterPurchase} dias após a compra. O procedimento, canal de solicitação e condições de logística reversa e reembolso ainda precisam ser definidos, sem prejuízo dos direitos legais do consumidor.`,
      "Nenhuma entrega ou devolução é solicitada por esta demonstração."
    ]
  }
};

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
