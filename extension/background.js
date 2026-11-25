// Seul point de contact avec TarifPing : jeton de connexion, liste des produits suivis, envoi des relevés.
const DEFAULT_API = "https://tarifping.com";
const OBSERVE_EVERY = 20 * 60 * 1000; // un relevé par produit toutes les 20 minutes au plus
const TRACKED_TTL = 10 * 60 * 1000;
let tracked = null; // { keys: Map(clé -> page suivie), at }

const store = {
  get: (k) => chrome.storage.local.get(k),
  set: (v) => chrome.storage.local.set(v),
};

async function call(path, { method = "GET", body } = {}) {
  const { token, api = DEFAULT_API } = await store.get(["token", "api"]);
  if (!token) throw Object.assign(new Error(chrome.i18n.getMessage("notConnected")), { code: 401 });
  const res = await fetch(`${api}/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Lang": chrome.i18n.getUILanguage().slice(0, 2) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (res.status === 401) { await store.set({ token: null }); tracked = null; }
  if (!res.ok) throw Object.assign(new Error(data?.error || `HTTP ${res.status}`), { code: res.status });
  return data;
}

async function me(force = false) {
  if (!force && tracked && Date.now() - tracked.at < TRACKED_TTL) return tracked.me;
  const data = await call("/ext/me");
  tracked = { me: data, keys: new Map(data.tracked.map((t) => [t.key, t])), at: Date.now() };
  return data;
}

function badge(tabId, state) {
  const look = { tracked: ["✓", "#12a383"], new: ["+", "#6366f1"], error: ["!", "#c62839"] }[state];
  chrome.action.setBadgeText({ tabId, text: look ? look[0] : "" });
  if (look) try { chrome.action.setBadgeBackgroundColor({ tabId, color: look[1] }); } catch { /* Safari iOS : couleur du badge non gérée */ }
}

/** Relevé d'un produit suivi, au plus toutes les 20 minutes (ou tout de suite si demandé) */
async function observe(page, force = false) {
  const { sent = {} } = await store.get("sent");
  if (!force && Date.now() - (sent[page.key] || 0) < OBSERVE_EVERY) return { skipped: true };
  const r = await call("/ext/observe", { method: "POST", body: { url: page.url, title: page.title, price: page.price, promo: page.promo || null } });
  sent[page.key] = Date.now();
  await store.set({ sent });
  return r;
}

async function onPage(msg, tabId) {
  if (!msg.key) return badge(tabId, null);
  const { token } = await store.get("token");
  if (!token) return badge(tabId, null);
  try {
    await me();
    if (!tracked.keys.has(msg.key)) return badge(tabId, "new");
    badge(tabId, msg.price ? "tracked" : "error");
    if (msg.price) await observe(msg);
  } catch {
    badge(tabId, null);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const run = async () => {
    switch (msg?.type) {
      case "page": return onPage(msg, sender.tab?.id);
      case "connect": // page /app/extension de TarifPing
        await store.set({ token: msg.token, api: msg.api || DEFAULT_API });
        tracked = null;
        return { ok: true, me: await me(true) };
      case "disconnect":
        await store.set({ token: null });
        tracked = null;
        return { ok: true };
      case "status": {
        const { token, api = DEFAULT_API } = await store.get(["token", "api"]);
        if (!token) return { connected: false, api };
        const data = await me(msg.force);
        return { connected: true, api, me: data, item: msg.key ? tracked.keys.get(msg.key) || null : null };
      }
      case "track": {
        const r = await call("/ext/track", { method: "POST", body: { url: msg.page.url, title: msg.page.title, price: msg.page.price, promo: msg.page.promo || null,
          name: msg.name, folder_id: msg.folderId || null } });
        await me(true);
        if (msg.tabId) badge(msg.tabId, "tracked");
        return r;
      }
      case "observe": return observe(msg.page, true);
      default: return null;
    }
  };
  run().then(reply, (e) => reply({ error: e.message, code: e.code }));
  return true; // réponse asynchrone
});
