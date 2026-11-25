// Fenêtre de l'extension : connexion, produit affiché, « Suivre ce produit », relevé immédiat.
/* global TP */
const $ = (id) => document.getElementById(id);
const t = (k, subs) => chrome.i18n.getMessage(k, subs) || k;
const send = (msg) => chrome.runtime.sendMessage(msg);
const main = $("main");
let state = { api: "https://tarifping.com" };

/** Élément HTML construit sans innerHTML (textes de pages tierces) */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
const render = (...nodes) => main.replaceChildren(...nodes.filter((n) => n != null && n !== false));
const openTab = (path) => chrome.tabs.create({ url: state.api + path });

document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
// hébreu et arabe : de droite à gauche
document.documentElement.lang = chrome.i18n.getUILanguage();
document.documentElement.dir = chrome.i18n.getMessage("@@bidi_dir") || "ltr";
$("open").addEventListener("click", (e) => { e.preventDefault(); openTab("/app"); });
$("logout").addEventListener("click", async () => { await send({ type: "disconnect" }); init(); });

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}
async function detect(tab) {
  try { return await chrome.tabs.sendMessage(tab.id, { type: "detect" }); } catch { return undefined; } // script absent : page à recharger
}

function notConnected() {
  const server = h("input", { value: state.api, type: "url" });
  render(
    h("p", {}, t("connectIntro")),
    h("div", { class: "sites" }, Object.values(TP.NAMES).map((s) => h("span", {}, s))),
    h("button", { class: "btn", onclick: () => openTab("/app/extension") }, t("connect")),
    h("details", { class: "small muted" }, h("summary", {}, t("server")),
      h("label", {}, t("serverHint"), server),
      h("button", { class: "link", onclick: async () => {
        state.api = server.value.replace(/\/+$/, "");
        await chrome.storage.local.set({ api: state.api });
        openTab("/app/extension");
      } }, t("connect"))),
  );
}

/** « NOEL20 (-20 %) · 30/11/2026 · Black Friday » : promotion lue par TarifPing au dernier relevé */
function promoText(p) {
  if (!p) return "";
  const parts = (p.codes || []).map((c) => c.code + (c.value ? ` (${c.value})` : ""));
  if (p.ends_at) parts.push(new Date(p.ends_at + "T12:00:00").toLocaleDateString(chrome.i18n.getUILanguage()));
  if (p.event) parts.push(p.event);
  return parts.join(" · ");
}

function productCard(page, extra, promo) {
  const regular = page.price && page.promo?.regular ? TP.fmt({ amount: page.promo.regular, currency: page.price.currency }) : null;
  const details = promoText(promo);
  return h("div", { class: "card" },
    h("div", { class: "small muted" }, TP.NAMES[page.market]),
    h("div", { class: "title" }, page.title || "—"),
    h("div", { class: "price" }, page.price ? TP.fmt(page.price) : "—",
      regular ? h("s", { class: "regular muted" }, regular) : null,
      page.price?.stock === "out" ? h("span", { class: "badge" }, t("outOfStock")) : null),
    details ? h("p", { class: "small promo" }, "🏷 " + t("promo", [details])) : null,
    extra);
}

function trackedView(page, item) {
  const status = h("p", { class: "small", role: "status" });
  const btn = h("button", { class: "btn ghost", disabled: !page.price, onclick: async () => {
    btn.disabled = true;
    const r = await send({ type: "observe", page });
    btn.disabled = false;
    if (r?.error) { status.className = "small err"; status.textContent = r.error; return; }
    const res = r.results?.[0];
    status.className = "small ok";
    status.textContent = t(res?.status === "changed" ? "changed" : "recorded");
  } }, t("recordNow"));
  render(
    productCard(page, h("p", { class: "ok small" }, "✓ " + t("tracked"),
      item.price ? h("span", { class: "muted" }, " · " + t("lastPrice", [TP.fmt(item.price)])) : null), item.promo),
    page.price ? null : h("p", { class: "err small" }, t("noPrice")),
    btn, status,
    h("button", { class: "link small", onclick: () => openTab(`/app/m/${item.id}`) }, t("viewInApp")),
    h("p", { class: "muted small" }, t("autoHint")),
  );
}

function trackForm(page, me, tabId) {
  const name = h("input", { value: (page.title || "").slice(0, 60), maxlength: 60 });
  const folder = h("select", {}, h("option", { value: "" }, t("noFolder")), me.folders.map((f) => h("option", { value: f.id }, f.name)));
  const status = h("p", { class: "small", role: "status" });
  const full = me.limit != null && me.usage >= me.limit;
  const btn = h("button", { class: "btn", disabled: !page.price || full, onclick: async () => {
    btn.disabled = true;
    const r = await send({ type: "track", page, name: name.value.trim(), folderId: folder.value ? Number(folder.value) : null, tabId });
    if (r?.error) { btn.disabled = false; status.className = "small err"; status.textContent = r.error; return; }
    init();
  } }, t("track"));
  render(
    productCard(page),
    page.price ? null : h("p", { class: "err small" }, t("noPrice")),
    h("label", {}, t("nameLabel"), name),
    me.folders.length ? h("label", {}, t("folder"), folder) : null,
    btn, status,
    h("p", { class: "muted small" }, full ? t("limitReached", [String(me.limit)]) : t("usage", [String(me.usage), me.limit == null ? "∞" : String(me.limit)])),
  );
}

async function init() {
  const tab = await activeTab();
  const page = tab ? await detect(tab) : undefined;
  const s = await send({ type: "status", key: page?.key, force: true });
  if (s?.api) state.api = s.api;
  $("logout").hidden = !s?.connected;
  $("account").textContent = s?.connected ? s.me.email : "";
  if (s?.error && s.code !== 401) return render(h("p", { class: "err" }, s.error));
  if (!s?.connected) return notConnected();
  if (page === undefined && TP.marketOf(tab?.url || "")) return render(h("p", {}, t("reload")));
  if (!page) {
    return render(
      h("p", {}, t("openProduct")),
      h("div", { class: "sites" }, Object.values(TP.NAMES).map((x) => h("span", {}, x))),
      h("p", { class: "muted small" }, t("trackedCount", [String(s.me.tracked.length)])),
    );
  }
  if (s.item) trackedView(page, s.item);
  else trackForm(page, s.me, tab.id);
}
init();
