export const store = Object.freeze({
  name: "ShopChristmas",
  currency: "BRL",
  locale: "pt-BR",
  product: Object.freeze({
    id: "kit-3-arvores-natal",
    name: "Kit com 3 árvores de Natal",
    treeCount: 3,
    heightMeters: 1.8,
    originalPriceCents: 24997,
    priceCents: 10997,
    accessories: Object.freeze(["Bolas natalinas", "Laços decorativos", "Estrelas", "Luzes"]),
    image: "/assets/trees.webp",
    campaignImage: "/assets/campaign.webp"
  }),
  shipping: Object.freeze({ priceCents: 0, calendarDays: 7, coverage: "todo o Brasil" }),
  returns: Object.freeze({ daysAfterPurchase: 30 }),
  // Avaliações reais de clientes — preencher apenas com depoimentos verificáveis.
  reviews: Object.freeze([]),
  preview: true
});

export function money(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new TypeError("Valor monetário inválido.");
  return new Intl.NumberFormat(store.locale, { style: "currency", currency: store.currency }).format(cents / 100);
}

export function offerSummary() {
  const { product, shipping } = store;
  return {
    productCents: product.priceCents,
    shippingCents: shipping.priceCents,
    totalCents: product.priceCents + shipping.priceCents,
    savingCents: product.originalPriceCents - product.priceCents,
    discountPercent: Math.round((1 - product.priceCents / product.originalPriceCents) * 100)
  };
}
