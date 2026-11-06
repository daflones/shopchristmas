import { FUNCTIONS_URL } from "./site-config.mjs";

const loginSection = document.querySelector("#admin-login");
const appSection = document.querySelector("#admin-app");
const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const loginSubmit = document.querySelector("#login-submit");
const kpiGrid = document.querySelector("#kpi-grid");
const tableHead = document.querySelector("#table-head");
const tableBody = document.querySelector("#table-body");
const pagerInfo = document.querySelector("#pager-info");
const pagerPrev = document.querySelector("#pager-prev");
const pagerNext = document.querySelector("#pager-next");
const orderDialog = document.querySelector("#order-dialog");
const orderDetail = document.querySelector("#order-detail");

const PER_PAGE = 15;
const state = { tab: "orders", page: 1, total: 0 };
let token = sessionStorage.getItem("sc_admin_token") ?? "";

const money = (cents) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents ?? 0) / 100);
const dateTime = (iso) => iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

const STATUS_LABEL = {
  pending_payment: "Aguardando PIX",
  paid: "Pago",
  processing: "Em preparação",
  payment_failed: "Falhou",
  expired: "Expirado",
  cancelled: "Cancelado",
  refunded: "Estornado",
  created: "Criada",
  pending: "Pendente"
};

async function api(action, extra = {}) {
  const res = await fetch(`${FUNCTIONS_URL}/sc-admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, token, ...extra })
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { logout(); throw new Error(data?.error?.message ?? "Sessão expirada."); }
  if (!res.ok || !data?.ok) throw new Error(data?.error?.message ?? "Falha na consulta.");
  return data;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function statusBadge(status) {
  const badge = el("span", `badge badge-${status}`, STATUS_LABEL[status] ?? status);
  return badge;
}

function renderKpis(stats, product) {
  kpiGrid.replaceChildren();
  const cards = [
    ["Pedidos", stats.orders_total],
    ["Pagos", stats.orders_paid],
    ["Aguardando PIX", stats.orders_pending],
    ["Receita confirmada", money(stats.revenue_cents)],
    ["Ticket médio", money(stats.avg_ticket_cents)],
    ["Conversão", `${stats.conversion_pct}%`],
    ["Últimos 7 dias", stats.orders_last_7d],
    ["Tentativas PIX", stats.payment_attempts],
    ["Eventos webhook", stats.webhook_events],
  ];
  for (const [label, value] of cards) {
    const card = el("div", "kpi-card");
    card.append(el("span", "kpi-label", label), el("strong", "kpi-value", String(value)));
    kpiGrid.append(card);
  }
  if (product) {
    const card = el("div", "kpi-card kpi-product");
    card.append(el("span", "kpi-label", "Produto ativo"), el("strong", "kpi-value kpi-value-sm", product.name), el("span", "kpi-label", `${money(product.price_cents)} (de ${money(product.compare_at_cents)})`));
    kpiGrid.append(card);
  }
}

const COLUMNS = {
  orders: ["#", "Data", "Cliente", "WhatsApp", "Status", "Total", ""],
  attempts: ["Data", "Pedido", "Cliente", "Status", "Valor", "Ref. provedor", "Erro"],
  events: ["Data", "Provedor", "Evento", "Tipo", "Processado", "Erro"]
};

function renderTable(tab, rows) {
  tableHead.replaceChildren();
  const tr = document.createElement("tr");
  for (const col of COLUMNS[tab]) tr.append(el("th", "", col));
  tableHead.append(tr);
  tableBody.replaceChildren();
  if (!rows.length) {
    const td = el("td", "admin-loading", "Nenhum registro.");
    td.colSpan = COLUMNS[tab].length;
    const row = document.createElement("tr");
    row.append(td);
    tableBody.append(row);
    return;
  }
  for (const row of rows) {
    const tr = document.createElement("tr");
    if (tab === "orders") {
      tr.append(
        el("td", "mono", `#${row.number}`),
        el("td", "", dateTime(row.created_at)),
        el("td", "", ""),
        el("td", "", row.phone ?? "—"),
        el("td", "", ""),
        el("td", "mono", money(row.total_cents)),
        el("td", "", "")
      );
      tr.children[2].append(el("strong", "", row.customer_name || "—"), el("small", "cell-sub", row.email));
      tr.children[4].append(statusBadge(row.status));
      const btn = el("button", "row-btn", "Detalhes");
      btn.type = "button";
      btn.addEventListener("click", () => openOrder(row.id));
      tr.children[6].append(btn);
    } else if (tab === "attempts") {
      const order = row.sc_orders ?? {};
      tr.append(
        el("td", "", dateTime(row.created_at)),
        el("td", "mono", order.number ? `#${order.number}` : "—"),
        el("td", "", ""),
        el("td", "", ""),
        el("td", "mono", money(row.amount_cents)),
        el("td", "mono cell-ref", (row.provider_ref ?? "—").slice(0, 18)),
        el("td", "cell-err", row.error ?? "—")
      );
      tr.children[2].textContent = order.customer_name || order.email || "—";
      tr.children[3].append(statusBadge(row.status));
      tr.classList.add("is-clickable");
      tr.addEventListener("click", () => openOrder(row.order_id));
    } else {
      tr.append(
        el("td", "", dateTime(row.created_at)),
        el("td", "", row.provider),
        el("td", "mono cell-ref", (row.event_id ?? "—").slice(0, 24)),
        el("td", "", row.event_type),
        el("td", "", row.processed_at ? dateTime(row.processed_at) : "—"),
        el("td", "cell-err", row.error ?? "—")
      );
    }
    tableBody.append(tr);
  }
}

async function loadTab() {
  tableBody.replaceChildren();
  const td = el("td", "admin-loading", "Carregando…");
  td.colSpan = 8;
  const tr = document.createElement("tr");
  tr.append(td);
  tableBody.append(tr);
  const data = await api(state.tab, { page: state.page, per: PER_PAGE });
  state.total = data.total;
  renderTable(state.tab, data.rows);
  const pages = Math.max(1, Math.ceil(state.total / PER_PAGE));
  pagerInfo.textContent = `Página ${state.page} de ${pages} · ${state.total} registro(s)`;
  pagerPrev.disabled = state.page <= 1;
  pagerNext.disabled = state.page >= pages;
}

async function openOrder(id) {
  orderDetail.replaceChildren(el("p", "admin-loading", "Carregando…"));
  orderDialog.showModal();
  const { order, items, attempts, events } = await api("order", { id });
  const ship = order.shipping_address ?? {};
  orderDetail.replaceChildren();
  const title = el("h2", "detail-title", `Pedido #${order.number}`);
  title.append(statusBadge(order.status));
  orderDetail.append(title);
  const grid = el("div", "detail-grid-2");
  const fields = [
    ["Cliente", order.customer_name],
    ["E-mail", order.email],
    ["WhatsApp", order.phone],
    ["Total", money(order.total_cents)],
    ["Criado em", dateTime(order.created_at)],
    ["Pago em", dateTime(order.paid_at)],
    ["Endereço", `${ship.line1 ?? ""}, ${ship.number ?? ""} ${ship.line2 ?? ""}`.trim()],
    ["Bairro", ship.district],
    ["Cidade/UF", `${ship.city ?? "—"}/${ship.state ?? "—"}`],
    ["CEP", ship.zip],
    ["UTM", Object.entries(order.utm ?? {}).map(([k, v]) => `${k}=${v}`).join(" · ") || "—"],
    ["ID", order.id],
  ];
  for (const [label, value] of fields) {
    const div = el("div", "detail-field");
    div.append(el("span", "", label), el("strong", "", value ?? "—"));
    grid.append(div);
  }
  orderDetail.append(grid);
  if (items?.length) {
    orderDetail.append(el("h3", "detail-h3", "Itens"));
    for (const item of items) {
      orderDetail.append(el("p", "detail-line", `${item.qty}× ${item.name} — ${money(item.total_cents)}`));
    }
  }
  if (attempts?.length) {
    orderDetail.append(el("h3", "detail-h3", "Tentativas de pagamento"));
    for (const att of attempts) {
      orderDetail.append(el("p", "detail-line", `${dateTime(att.created_at)} · ${STATUS_LABEL[att.status] ?? att.status} · ${money(att.amount_cents)} · ref ${att.provider_ref ?? "—"}${att.error ? ` · ${att.error}` : ""}`));
    }
  }
  if (events?.length) {
    orderDetail.append(el("h3", "detail-h3", "Últimos eventos webhook"));
    for (const ev of events.slice(0, 5)) {
      orderDetail.append(el("p", "detail-line", `${dateTime(ev.created_at)} · ${ev.event_type}${ev.error ? ` · ${ev.error}` : ""}`));
    }
  }
}

function logout() {
  token = "";
  sessionStorage.removeItem("sc_admin_token");
  appSection.hidden = true;
  loginSection.hidden = false;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  loginSubmit.disabled = true;
  loginSubmit.textContent = "ENTRANDO…";
  try {
    const data = new FormData(loginForm);
    const res = await fetch(`${FUNCTIONS_URL}/sc-admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email: data.get("email"), password: data.get("password") })
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || !result?.ok) throw new Error(result?.error?.message ?? "Falha no login.");
    token = result.token;
    sessionStorage.setItem("sc_admin_token", token);
    loginSection.hidden = true;
    appSection.hidden = false;
    init();
  } catch (error) {
    loginError.textContent = error.message;
    loginError.hidden = false;
  } finally {
    loginSubmit.disabled = false;
    loginSubmit.textContent = "ENTRAR";
  }
});

document.querySelector("#admin-logout").addEventListener("click", logout);
pagerPrev.addEventListener("click", () => { if (state.page > 1) { state.page--; loadTab(); } });
pagerNext.addEventListener("click", () => { state.page++; loadTab(); });
document.querySelector("#admin-tabs").addEventListener("click", (event) => {
  const btn = event.target.closest("[data-tab]");
  if (!btn) return;
  document.querySelectorAll(".admin-tab").forEach((t) => t.classList.toggle("is-active", t === btn));
  state.tab = btn.dataset.tab;
  state.page = 1;
  loadTab();
});
orderDialog.querySelector("[data-close]").addEventListener("click", () => orderDialog.close());
orderDialog.addEventListener("click", (event) => {
  if (event.target !== orderDialog) return;
  const rect = orderDialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) orderDialog.close();
});

async function init() {
  const { stats, product } = await api("stats");
  renderKpis(stats, product);
  await loadTab();
}

if (token) {
  loginSection.hidden = true;
  appSection.hidden = false;
  init().catch(() => logout());
}
