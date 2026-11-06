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
  // Avaliações reais de clientes (mesmo modelo de árvore, traduzidas do original).
  reviews: Object.freeze([
    Object.freeze({
      name: "Caroline Ribeiro",
      stars: 5,
      date: "18/11/2025",
      meta: "Compra verificada",
      text: "Amei essa árvore, valeu muito a pena a compra. Ela é linda, cheia, maravilhosa. Super recomendo!",
      avatar: "/assets/reviews/carol-perfil.webp",
      images: Object.freeze(["/assets/reviews/carol.webp"]),
      video: "/assets/reviews/carol.mp4"
    }),
    Object.freeze({
      name: "Jurbero",
      stars: 5,
      date: "27/11/2025",
      meta: "Compra verificada",
      text: "Fiel à descrição. Muitos galhos e suporte reforçado. Chegou no dia seguinte à compra, bem embalada.",
      avatar: "/assets/reviews/jurbero-perfil.webp",
      images: Object.freeze(["/assets/reviews/jurbero.webp", "/assets/reviews/jurbero2.webp"]),
      video: "/assets/reviews/jurbero.mp4"
    }),
    Object.freeze({
      name: "Laila Cristina",
      stars: 5,
      date: "14/11/2025",
      meta: "Compra verificada",
      text: "Muito linda e de um ótimo tamanho! Ela é bem cheia, como dá pra ver… entrega muito rápida.",
      avatar: "/assets/reviews/laila-perfil.webp",
      images: Object.freeze(["/assets/reviews/laila.webp"]),
      video: "/assets/reviews/laila.mp4"
    }),
    Object.freeze({
      name: "Ana Cris",
      stars: 5,
      date: "10/11/2025",
      meta: "Compra verificada",
      text: "Ótima qualidade. Tom de verde bonito. Excelente custo-benefício. Pode comprar sem medo.",
      avatar: null,
      images: Object.freeze([]),
      video: null
    }),
    Object.freeze({
      name: "Camila Zanon",
      stars: 5,
      date: "17/11/2025",
      meta: "Compra verificada",
      text: "Árvore grande, estrutura bem reforçada. Adoramos, ficou linda!",
      avatar: null,
      images: Object.freeze([]),
      video: null
    })
  ]),
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
