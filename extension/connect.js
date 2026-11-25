// Page « Extension » de TarifPing : signale que l'extension est installée, indique le compte déjà connecté
// (data-tp-ext-account : email, ou vide si non connectée) et récupère le jeton de connexion.
(() => {
  const root = document.documentElement;
  root.dataset.tpExtension = "installed";
  const status = () => chrome.runtime.sendMessage({ type: "status", force: true }, (r) => {
    root.dataset.tpExtAccount = r?.connected ? r.me?.email || "?" : "";
  });
  status();
  const pick = () => {
    const el = document.getElementById("tp-ext-connect");
    if (!el?.dataset.token || el.dataset.state) return;
    el.dataset.state = "pending";
    chrome.runtime.sendMessage({ type: "connect", token: el.dataset.token, api: el.dataset.api || location.origin }, (r) => {
      el.dataset.state = r?.ok ? "connected" : "error";
      if (r?.error) el.dataset.error = r.error;
      status();
    });
  };
  // la page est une application Vue : le jeton apparaît après un clic ou la connexion automatique
  new MutationObserver(pick).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-token"] });
  pick();
})();
