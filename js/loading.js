/* =========================================================
   LOADING GLOBAL — V4.2.1
   Mostra um indicador enquanto operações de rede estão
   sendo processadas. Funciona em todas as telas.
========================================================= */
(() => {
  "use strict";

  let activeRequests = 0;
  let showTimer = null;
  let currentMessage = "Carregando...";

  function ensureOverlay(){
    let overlay = document.getElementById("globalLoading");
    if(overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "globalLoading";
    overlay.className = "global-loading hidden";
    overlay.setAttribute("aria-live","polite");
    overlay.setAttribute("aria-busy","true");
    overlay.innerHTML = `
      <div class="global-loading-card" role="status">
        <span class="loading-spinner" aria-hidden="true"></span>
        <strong id="globalLoadingText">Carregando...</strong>
        <span>Aguarde, estamos processando a solicitação.</span>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function setText(text){
    const el = document.getElementById("globalLoadingText");
    if(el) el.textContent = text || "Carregando...";
  }

  function show(text="Carregando..."){
    currentMessage = text;
    const overlay = ensureOverlay();
    setText(text);
    overlay.classList.remove("hidden");
  }

  function hide(){
    const overlay = document.getElementById("globalLoading");
    if(!overlay) return;
    overlay.classList.add("hidden");
  }

  function describeRequest(input, init={}){
    const method = String(init.method || input?.method || "GET").toUpperCase();
    const url = String(typeof input === "string" ? input : (input?.url || ""));

    if(url.includes("/auth/v1/token")) return "Entrando...";
    if(url.includes("/auth/v1/logout")) return "Saindo...";
    if(url.includes("/functions/v1/")) return "Processando solicitação...";
    if(method === "DELETE") return "Excluindo...";
    if(["POST","PATCH","PUT"].includes(method)) return "Salvando alterações...";
    return "Carregando...";
  }

  function beginRequest(message){
    activeRequests++;
    currentMessage = message || currentMessage;
    clearTimeout(showTimer);

    // Evita piscar a tela em consultas muito rápidas.
    showTimer = setTimeout(() => {
      if(activeRequests > 0) show(currentMessage);
    }, 140);
  }

  function endRequest(){
    activeRequests = Math.max(0, activeRequests - 1);
    if(activeRequests === 0){
      clearTimeout(showTimer);
      showTimer = null;
      hide();
    }
  }

  window.AppLoading = {
    show,
    hide,
    isLoading: () => activeRequests > 0
  };

  // Intercepta fetch para cobrir automaticamente:
  // Silo, Manutenção, Ferramentas, Usuários e autenticação.
  const originalFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    const message = describeRequest(input, init || {});
    beginRequest(message);

    return originalFetch(input, init).finally(() => {
      endRequest();
    });
  };

  // Também sinaliza envios de formulários que podem demorar antes
  // de a primeira requisição começar.
  document.addEventListener("submit", event => {
    const form = event.target;
    if(!form || form.dataset.loadingManaged === "true") return;
    const submitter = event.submitter;
    const label = submitter?.dataset?.loadingText || "Salvando alterações...";
    show(label);
  }, true);

  // Se uma página for recarregada/navegada, evita deixar o overlay preso.
  window.addEventListener("pageshow", () => {
    activeRequests = 0;
    clearTimeout(showTimer);
    hide();
  });
})();
