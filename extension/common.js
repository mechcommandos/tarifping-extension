// Logique partagée : reconnaissance des places de marché et lecture des prix (même règles que lib/marketplaces.php du serveur).
/* exported TP */
var TP = (() => {
  // [nom, domaines (sous-domaines compris), identifiant du produit dans le chemin, repli sur le chemin de la page]
  // Repli : clé = chemin de la page, retenue seulement si la page décrit un produit (voir content.js).
  // Même table que MARKETS dans lib/marketplaces.php du serveur.
  const MARKETS = {
    amazon: ["Amazon", ["amazon.com", "amazon.ca", "amazon.com.mx", "amazon.com.br", "amazon.co.uk", "amazon.de", "amazon.fr", "amazon.it", "amazon.es",
      "amazon.nl", "amazon.be", "amazon.se", "amazon.pl", "amazon.com.tr", "amazon.ae", "amazon.sa", "amazon.eg", "amazon.in", "amazon.ie", "amazon.co.jp",
      "amazon.sg", "amazon.com.au"], "/(?:dp|gp/product|gp/aw/d|exec/obidos/ASIN|o/ASIN)/([A-Z0-9]{10})(?:[/?]|$)", false],
    aliexpress: ["AliExpress", ["aliexpress.com", "aliexpress.us", "aliexpress.ru"], "/item/(?:[^/]+/)?(\\d{6,})\\.html", false],
    temu: ["Temu", ["temu.com"], "-g-(\\d{6,})\\.html", false],
    shein: ["Shein", ["shein.com", "shein.co.uk", "shein.fr", "shein.de", "shein.es", "shein.it", "shein.nl", "shein.pl", "shein.se", "shein.com.mx",
      "shein.com.br", "shein.in"], "-p-(\\d{4,})(?:-cat-\\d+)?\\.html", false],
    ebay: ["eBay", ["ebay.com", "ebay.fr", "ebay.de", "ebay.co.uk", "ebay.it", "ebay.es", "ebay.nl", "ebay.be", "ebay.pl", "ebay.at", "ebay.ch", "ebay.ie",
      "ebay.ca", "ebay.com.au"], "/itm/(?:[^/]+/)?(\\d{9,15})", true],
    etsy: ["Etsy", ["etsy.com"], "/listing/(\\d{5,})", true],
    cdiscount: ["Cdiscount", ["cdiscount.com"], "/f-\\d+-([a-z0-9]+)\\.html", true],
    fnac: ["Fnac", ["fnac.com", "fnac.be", "fnac.ch", "fnac.pt", "fnac.es"], "/(a\\d{4,}|mp\\d{4,})(?:/|$)", true],
    darty: ["Darty", ["darty.com"], null, true],
    boulanger: ["Boulanger", ["boulanger.com"], "/ref/(\\d{5,})", true],
    manomano: ["ManoMano", ["manomano.fr", "manomano.es", "manomano.it", "manomano.de", "manomano.co.uk"], "/p/[^/]*-(\\d{5,})$", true],
    leroymerlin: ["Leroy Merlin", ["leroymerlin.fr", "leroymerlin.es", "leroymerlin.it", "leroymerlin.pt", "leroymerlin.pl"], "-(\\d{8,})\\.html$", true],
    castorama: ["Castorama", ["castorama.fr", "castorama.pl"], null, true],
    decathlon: ["Decathlon", ["decathlon.fr", "decathlon.com", "decathlon.de", "decathlon.es", "decathlon.it", "decathlon.be", "decathlon.nl",
      "decathlon.pl", "decathlon.pt", "decathlon.co.uk", "decathlon.ch"], "/R-p-([A-Z0-9]+)", true],
    carrefour: ["Carrefour", ["carrefour.fr", "carrefour.es", "carrefour.it"], null, true],
    conforama: ["Conforama", ["conforama.fr"], null, true],
    sephora: ["Sephora", ["sephora.fr", "sephora.com", "sephora.de", "sephora.es", "sephora.it", "sephora.pl"], null, true],
    zara: ["Zara", ["zara.com"], "-p(\\d{8})\\.html", true],
    hm: ["H&M", ["hm.com"], "productpage\\.(\\d{10})\\.html", true],
    asos: ["ASOS", ["asos.com"], "/prd/(\\d{5,})", true],
    bol: ["bol.com", ["bol.com"], "/p/[^/]+/(\\d{10,})", true],
    coolblue: ["Coolblue", ["coolblue.nl", "coolblue.be", "coolblue.de"], "/product/(\\d{5,})", true],
    kaufland: ["Kaufland", ["kaufland.de", "kaufland.fr", "kaufland.it", "kaufland.pl", "kaufland.cz", "kaufland.sk", "kaufland.at"], "/product/(\\d{5,})", true],
    mediamarkt: ["MediaMarkt", ["mediamarkt.de", "mediamarkt.nl", "mediamarkt.be", "mediamarkt.at", "mediamarkt.es", "mediamarkt.pl", "mediamarkt.ch"],
      "/product/[^/]*-(\\d{6,})\\.html", true],
    mediaworld: ["MediaWorld", ["mediaworld.it"], "/product/[^/]*-(\\d{6,})\\.html", true],
    elcorteingles: ["El Corte Inglés", ["elcorteingles.es"], null, true],
    pccomponentes: ["PcComponentes", ["pccomponentes.com", "pccomponentes.fr", "pccomponentes.it", "pccomponentes.pt"], null, true],
    allegro: ["Allegro", ["allegro.pl"], "/oferta/(?:[^/]*-)?(\\d{8,})", true],
    ozon: ["Ozon", ["ozon.ru"], "/product/(?:[^/]*-)?(\\d{5,})", true],
    wildberries: ["Wildberries", ["wildberries.ru"], "/catalog/(\\d{5,})/detail", true],
    mercadolibre: ["Mercado Libre", ["mercadolibre.com.mx", "mercadolibre.com.ar", "mercadolibre.com.co", "mercadolibre.cl", "mercadolibre.com.pe",
      "mercadolibre.com.uy", "mercadolivre.com.br"], "/(?:p/)?(ML[A-Z])-?(\\d{6,})", true],
    noon: ["noon", ["noon.com"], null, true],
    homedepot: ["The Home Depot", ["homedepot.com"], "/p/(?:[^/]+/)?(\\d{9})(?:/|$)", true],
    wayfair: ["Wayfair", ["wayfair.com", "wayfair.co.uk", "wayfair.de", "wayfair.ca"], null, true],
  };
  const NAMES = Object.fromEntries(Object.entries(MARKETS).map(([k, [name]]) => [k, name]));

  function marketOf(url) {
    let host = "";
    try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
    const m = Object.entries(MARKETS).find(([, [, domains]]) => domains.some((d) => host === d || host.endsWith("." + d)));
    return m ? m[0] : null;
  }
  /** « amazon:B09B2SBHQK », « fnac:A123456 », « darty:/NAV/ACHAT/… » (chemin) ou null si l'adresse ne peut pas être un produit */
  function productKey(url) {
    const market = marketOf(url);
    if (!market) return null;
    const [, , re, byPath] = MARKETS[market];
    const u = new URL(url);
    const m = re ? u.pathname.match(new RegExp(re, "i")) : null;
    let id = m ? m.slice(1).join("").toUpperCase() : null;
    if (!id && market === "temu" && /^\d+$/.test(u.searchParams.get("goods_id") || "")) id = u.searchParams.get("goods_id");
    const path = u.pathname.replace(/\/+$/, "");
    if (!id && byPath && path) id = path.toUpperCase();
    return id ? `${market}:${id}` : null;
  }
  /** La clé vient-elle du chemin de la page (et pas d'un identifiant de produit) ? */
  const byPathKey = (key) => (key || "").split(":")[1]?.startsWith("/") ?? false;

  // symboles et codes monétaires ; « $ » et « kr » dépendent de la boutique
  const SYMBOLS = { "€": "EUR", "£": "GBP", "zł": "PLN", "₹": "INR", "¥": "JPY", "₺": "TRY", "R$": "BRL", "C$": "CAD", "A$": "AUD", "US$": "USD", "S$": "SGD", "₽": "RUB", "руб": "RUB", "руб.": "RUB", "Kč": "CZK", "S/": "PEN", "RUB": "RUB", "CZK": "CZK",
    "AED": "AED", "SAR": "SAR", "EGP": "EGP", "CHF": "CHF", "SEK": "SEK", "PLN": "PLN", "EUR": "EUR", "USD": "USD", "GBP": "GBP", "MAD": "MAD", "DH": "MAD" };
  const DOLLAR_BY_TLD = { ca: "CAD", "com.au": "AUD", "com.mx": "MXN", "com.br": "BRL", sg: "SGD", "com.ar": "ARS", "com.co": "COP", cl: "CLP", "com.uy": "UYU" };
  const CUR = "₽|руб\\.?|Kč|S/|R\\$|C\\$|A\\$|US\\s?\\$|S\\$|€|£|\\$|zł|₹|¥|₺|kr|CHF|EUR|USD|GBP|AED|SAR|EGP|SEK|PLN|MAD|DH|RUB|CZK";
  const NUM = "\\d{1,3}(?:[.,\\s\\u00a0\\u202f]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?";
  const MONEY = new RegExp(`(?:(${CUR})\\s?(${NUM}))|(?:(${NUM})\\s?(${CUR}))`, "i");

  function parseAmount(s) {
    s = s.replace(/[\s  ]/g, "");
    const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
    if (lastDot >= 0 && lastComma >= 0) { // 1.299,99 ou 1,299.99 : le dernier séparateur est la virgule décimale
      const dec = lastDot > lastComma ? "." : ",";
      s = s.split(dec === "." ? "," : ".").join("").replace(dec, ".");
    } else if (lastDot >= 0 || lastComma >= 0) {
      const sep = lastDot >= 0 ? "." : ",";
      const parts = s.split(sep);
      // « 1.299 » : séparateur de milliers ; « 12,99 » : décimales
      s = parts.length > 2 || parts[parts.length - 1].length === 3 ? parts.join("") : parts.join(".");
    }
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }

  function currencyOf(symbol, host) {
    const sym = symbol.replace(/\s/g, "").toUpperCase() === "US$" ? "US$" : symbol.replace(/\s/g, "");
    if (sym === "$") {
      const tld = Object.keys(DOLLAR_BY_TLD).find((t) => host.endsWith("." + t));
      return tld ? DOLLAR_BY_TLD[tld] : "USD";
    }
    if (sym.toLowerCase() === "kr") return "SEK";
    return SYMBOLS[sym] || SYMBOLS[sym.toUpperCase()] || sym.toUpperCase();
  }

  /** Premier montant d'un texte : { amount, currency } */
  function parseMoney(text, host = location.hostname) {
    const m = (text || "").match(MONEY);
    if (!m) return null;
    const amount = parseAmount(m[2] || m[3]);
    if (amount == null) return null;
    return { amount, currency: currencyOf(m[1] || m[4], host) };
  }

  function fmt(p) {
    if (!p) return "—";
    try { return new Intl.NumberFormat(navigator.language, { style: "currency", currency: p.currency }).format(p.amount); }
    catch { return `${p.amount} ${p.currency}`; } // symbole déjà normalisé par le serveur (€, $…)
  }

  return { marketOf, productKey, byPathKey, parseMoney, parseAmount, currencyOf, NAMES, fmt };
})();
