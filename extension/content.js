// Fiches produit des places de marché et boutiques de common.js (Amazon, AliExpress, eBay, Fnac…) : lit le prix affiché à l'utilisateur.
// Rien n'est envoyé pour un produit non suivi ; la page n'est jamais rechargée ni parcourue automatiquement.
/* global TP */
(() => {
  const host = location.hostname;

  const visible = (el) => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const struck = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (/^(DEL|S|STRIKE)$/.test(n.tagName)) return true;
      if (getComputedStyle(n).textDecorationLine.includes("line-through")) return true;
    }
    return false;
  };
  const textOf = (sel) => document.querySelector(sel)?.textContent.replace(/\s+/g, " ").trim() || "";
  const moneyFrom = (el) => (el ? TP.parseMoney(el.textContent.replace(/\s+/g, " "), host) : null);
  function firstMoney(selectors, opts = {}) {
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (!opts.hidden && !visible(el)) continue;
        if (struck(el)) continue;
        const p = moneyFrom(el);
        if (p && p.amount > 0) return p;
      }
    }
    return null;
  }

  // --- données produit standard (JSON-LD, balises meta) -----------------------------------------
  function structured() {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      let data;
      try { data = JSON.parse(s.textContent); } catch { continue; }
      const stack = [data];
      while (stack.length) {
        const n = stack.pop();
        if (!n || typeof n !== "object") continue;
        if (Array.isArray(n)) { stack.push(...n); continue; }
        const types = [].concat(n["@type"] || []);
        if (types.some((t) => /^(Product|ProductGroup)$/.test(t)) && n.offers) {
          for (const o of [].concat(n.offers)) {
            const amount = parseFloat(o.price ?? o.lowPrice ?? o.priceSpecification?.price);
            const currency = o.priceCurrency ?? o.priceSpecification?.priceCurrency;
            if (Number.isFinite(amount) && currency) {
              const avail = String(o.availability || "");
              return { amount, currency, stock: /OutOfStock|SoldOut|Discontinued/.test(avail) ? "out" : avail ? "in" : null, title: n.name || "" };
            }
          }
        }
        for (const k of ["@graph", "mainEntity", "hasVariant"]) if (n[k]) stack.push(n[k]);
      }
    }
    // microdonnées schema.org : <div itemtype="…/Product"> … <meta itemprop="price" content="12.99">
    const product = document.querySelector('[itemtype*="schema.org/Product" i]');
    const offer = product?.querySelector('[itemprop="offers"]') || product;
    const prop = (n) => { const el = offer?.querySelector(`[itemprop="${n}"]`); return el ? (el.getAttribute("content") ?? el.getAttribute("href") ?? el.textContent).trim() : ""; };
    if (offer) {
      const amount = parseFloat(prop("price").replace(/\s/g, "").replace(",", "."));
      const currency = prop("priceCurrency");
      if (Number.isFinite(amount) && currency) {
        const avail = prop("availability");
        return { amount, currency, stock: /OutOfStock|SoldOut|Discontinued/.test(avail) ? "out" : avail ? "in" : null,
          title: product.querySelector('[itemprop="name"]')?.textContent.replace(/\s+/g, " ").trim() || "" };
      }
    }
    const meta = (n) => document.querySelector(`meta[property="${n}"],meta[name="${n}"]`)?.content;
    const amount = parseFloat(meta("product:price:amount") || meta("og:price:amount"));
    const currency = meta("product:price:currency") || meta("og:price:currency");
    return Number.isFinite(amount) && currency ? { amount, currency, stock: null } : null;
  }

  // --- repli : le prix le plus visible du haut de la page (le plus gros, non barré) ---------------
  function prominent() {
    let best = null;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    for (let el = walker.nextNode(); el; el = walker.nextNode()) {
      const text = el.textContent;
      if (!text || text.length > 40 || el.children.length > 6) continue;
      if (/^(SCRIPT|STYLE|NOSCRIPT|OPTION)$/.test(el.tagName)) continue;
      const p = TP.parseMoney(text.replace(/\s+/g, " "), host);
      if (!p || p.amount <= 0) continue;
      const r = el.getBoundingClientRect();
      if (r.top + scrollY > 1400 || !visible(el) || struck(el)) continue;
      // taille du plus gros texte de l'élément (prix découpé en <span> € / 12 / ,99)
      let size = parseFloat(getComputedStyle(el).fontSize);
      for (const c of el.querySelectorAll("*")) size = Math.max(size, parseFloat(getComputedStyle(c).fontSize));
      const score = size * 10 - (r.top + scrollY) / 100;
      if (!best || score > best.score) best = { score, ...p };
    }
    return best ? { amount: best.amount, currency: best.currency, stock: null } : null;
  }

  // --- promotion affichée : prix barré, textes des encadrés (coupons, codes, offres), compte à rebours ----
  // Les textes sont lus par TarifPing (mêmes règles que pour les autres sites, dans toutes les langues).
  const PROMO_SEL = ['[class*="promo" i]', '[class*="coupon" i]', '[class*="deal" i]', '[class*="discount" i]', '[class*="saving" i]',
    '[class*="countdown" i]', '[class*="timer" i]', '[class*="voucher" i]', '[class*="banner" i]', '[class*="badge" i]', '[class*="sale" i]',
    '[id*="promo" i]', '[id*="coupon" i]', '[id*="deal" i]'].join(",");
  const SITE_PROMO = {
    amazon: { regular: [".basisPrice .a-offscreen", "#corePriceDisplay_desktop_feature_div .a-price.a-text-price .a-offscreen",
      "#corePrice_desktop .a-text-price .a-offscreen", "#priceblock_listprice", ".a-text-strike"],
      text: ["#promoPriceBlockMessage_feature_div", "#applicablePromotionList_feature_div", "#couponBadgeRegularVpc", '[id^="couponText"]', "#vpcButton",
        "#dealBadge_feature_div", "#deal_expiry_timer_feature_div", '[id*="dealCountdown"]', ".savingsPercentage", "#promotions_feature_div"] },
    aliexpress: { regular: ['[class*="price--originalText"]', '[class*="price-default--original"]', ".product-price-original"],
      text: ['[class*="coupon"]', '[class*="promotion"]', '[class*="countdown"]', '[class*="uniform-banner"]'] },
    temu: { regular: ['[class*="marketPrice"]', '[class*="originPrice"]', '[class*="linePrice"]'], text: [] },
    shein: { regular: [".del-price", '[class*="productPrice_del"]', ".product-intro__head-price .del-price"],
      text: ['[class*="coupon"]', '[class*="countdown"]', '[class*="discount"]', '[class*="promotion"]'] },
  };
  const top = (el) => el.getBoundingClientRect().top + scrollY;

  function promoInfo(market, price) {
    if (!price) return null;
    const site = SITE_PROMO[market] || { regular: [], text: [] };
    const ok = (p) => p && p.amount > price.amount && p.amount <= price.amount * 10;
    // prix barré : emplacement connu du site, sinon le premier montant barré en haut de la page
    let regular = null;
    for (const sel of site.regular) {
      for (const el of document.querySelectorAll(sel)) { const p = moneyFrom(el); if (ok(p)) { regular = p.amount; break; } }
      if (regular) break;
    }
    if (!regular) {
      for (const el of document.querySelectorAll("del, s, strike, [class*='strike' i], [class*='origin' i], [class*='old' i]")) {
        if (el.textContent.length > 40 || !visible(el) || top(el) > 1400 || !struck(el)) continue;
        const p = moneyFrom(el);
        if (ok(p)) { regular = p.amount; break; }
      }
    }
    // textes des encadrés promotionnels visibles du haut de la page (sans doublons imbriqués)
    const seen = [];
    let text = "";
    for (const el of document.querySelectorAll([...site.text, PROMO_SEL].filter(Boolean).join(","))) {
      if (text.length > 3500) break;
      if (seen.some((s) => s.contains(el)) || !visible(el) || top(el) > 2500) continue;
      const t = el.innerText?.replace(/\s+/g, " ").trim() || "";
      if (t.length < 3 || t.length > 300) continue;
      seen.push(el);
      text += t + " ¶ "; // séparateur de blocs, comme côté serveur
    }
    // compte à rebours (« 2 j 05:12:33 », « 05:12:33 ») dans un encadré d'offre
    let endsInSec = null;
    for (const el of seen) {
      const m = el.innerText.match(/(?:(\d{1,2})\s*(?:j|d|t|g|д|天|days?|jours?|días?|giorni|tage?)\.?\s*)?(\d{1,2}):(\d{2}):(\d{2})/i);
      if (m) { endsInSec = (+m[1] || 0) * 86400 + +m[2] * 3600 + +m[3] * 60 + +m[4]; break; }
    }
    return regular || text || endsInSec ? { regular, text: text.slice(0, 4000), endsInSec } : null;
  }

  // --- chaque site, ses emplacements habituels, puis les replis ------------------------------------
  const SITES = {
    amazon() {
      let p = firstMoney([
        "#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen", "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",
        "#corePrice_feature_div .a-price .a-offscreen", "#corePrice_desktop .a-price .a-offscreen", "#apex_desktop .a-price .a-offscreen",
        "#priceblock_dealprice", "#priceblock_ourprice", "#price_inside_buybox", "#newBuyBoxPrice", "#tp_price_block_total_price_ww .a-offscreen",
      ], { hidden: true });
      if (!p) { // prix découpé : symbole, entier, décimales
        const box = document.querySelector("#corePriceDisplay_desktop_feature_div .a-price, #corePrice_feature_div .a-price, #apex_desktop .a-price");
        if (box) p = TP.parseMoney([".a-price-symbol", ".a-price-whole", ".a-price-fraction"].map((s) => box.querySelector(s)?.textContent.trim() || "").join("").replace(/([.,])\1/, "$1"), host);
      }
      if (!p) {
        const v = document.querySelector("#attach-base-product-price")?.value;
        const c = document.querySelector("#attach-base-product-currency-symbol")?.value;
        if (v && c) p = { amount: parseFloat(v), currency: TP.currencyOf(c, host) };
      }
      const avail = textOf("#availability");
      const out = /indisponible|unavailable|out of stock|nicht verfügbar|no disponible|non disponibile|niet beschikbaar|niedostępny/i.test(avail);
      return p && { ...p, stock: out ? "out" : avail ? "in" : null, title: textOf("#productTitle") };
    },
    aliexpress() {
      const p = firstMoney(['[class*="price--currentPriceText"]', '[class*="price-default--current"]', '[class*="price--current"]',
        ".product-price-current", '[class*="uniform-banner-box-price"]']);
      return p && { ...p, title: textOf('h1[data-pl="product-title"]') || textOf("h1") };
    },
    temu() {
      const p = firstMoney(['[data-type="price"]', '[class*="goodsPrice"]', '[class*="salePrice"]', '[aria-label*="€"]', '[aria-label*="$"]']);
      return p && { ...p, title: textOf("h1") };
    },
    shein() {
      const p = firstMoney([".productPrice_main .from", ".product-intro__head-mainprice .from", '[class*="productPrice"] [class*="from"]',
        ".product-intro__head-mainprice", ".original.from"]);
      const soldOut = !!document.querySelector('[class*="sold-out"], [class*="soldout"]');
      return p && { ...p, stock: soldOut ? "out" : null, title: textOf(".product-intro__head-name") || textOf("h1") };
    },
  };

  /** Ce que la page affiche : { key, market, url, title, price } ou null */
  function detect() {
    const key = TP.productKey(location.href);
    if (!key) return null;
    const market = key.split(":")[0];
    let found = null;
    try { found = SITES[market]?.() ?? null; } catch { /* structure de page inattendue : replis ci-dessous */ }
    // adresse sans identifiant de produit (clé = chemin) : seule une page qui se déclare fiche produit est retenue,
    // jamais une liste ou une page d'accueil (le prix le plus visible y serait celui d'un autre article)
    if (!found && TP.byPathKey(key)) { const s = structured(); if (!s) return null; found = { title: "", ...s }; }
    if (!found) { const s = structured() || prominent(); if (s) found = { title: "", ...s }; }
    const title = (found?.title || document.querySelector('meta[property="og:title"]')?.content || document.title).replace(/\s+/g, " ").trim();
    const price = found ? { amount: Math.round(found.amount * 100) / 100, currency: found.currency, stock: found.stock ?? null } : null;
    let promo = null;
    try { promo = promoInfo(market, price); } catch { /* sans promotion lisible : le prix suffit */ }
    return { key, market, url: location.href, title, price, promo };
  }

  // la fenêtre de l'extension demande ce qui est affiché
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type === "detect") reply(detect());
  });

  // visite d'une fiche : relevé envoyé si (et seulement si) le produit est suivi. Les pages se construisent
  // en JavaScript : on réessaie quelques secondes, et on suit les changements d'adresse sans rechargement.
  let lastUrl = "";
  function scan() {
    if (location.href === lastUrl) return;
    const url = (lastUrl = location.href);
    if (!TP.productKey(url)) { chrome.runtime.sendMessage({ type: "page", key: null }); return; }
    let tries = 0;
    const attempt = () => {
      if (location.href !== url) return;
      const d = detect();
      if (d?.price || ++tries >= 6) chrome.runtime.sendMessage({ type: "page", ...d });
      else setTimeout(attempt, 1500);
    };
    setTimeout(attempt, 1200);
  }
  scan();
  setInterval(scan, 1500);
})();
