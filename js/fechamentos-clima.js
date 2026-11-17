/* V7.0.6 — Condições Climáticas: dados independentes dos fechamentos de produção.
   O endpoint aberto do Open-Meteo é destinado à avaliação/não-comercial.
   Para uso comercial, configurar um proxy no servidor com plano licenciado.
   Nunca colocar uma chave comercial no JavaScript distribuído. */
(() => {
  "use strict";

  const CONFIG = Object.freeze({
    latitude: -29.49698776598969,
    longitude: -52.03655804859432,
    timezone: "America/Sao_Paulo",
    model: "era5",
    threshold: 1,
    table: "fm_condicoes_climaticas",
    archiveUrl: "https://archive-api.open-meteo.com/v1/archive",
    // Opcional: URL de um proxy próprio que devolva o mesmo JSON do Open-Meteo.
    // Usar um proxy autenticado e credenciais comerciais exclusivamente no servidor.
    proxyUrl: ""
  });
  const $ = id => document.getElementById(id);
  const MONTH_FORMAT = /^\d{4}-(0[1-9]|1[0-2])$/;
  const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
  const weekNames = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  const state = {
    month: "",
    snapshot: null,
    busy: false,
    message: "",
    warning: false,
    requestId: 0,
    controller: null
  };

  function monthDates(month) {
    const [year, m] = month.split("-").map(Number);
    const length = new Date(Date.UTC(year, m, 0)).getUTCDate();
    return Array.from({length}, (_,i) => `${month}-${String(i+1).padStart(2, "0")}`);
  }
  function brToday() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: CONFIG.timezone, year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date());
    const get = type => parts.find(part => part.type === type)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }
  function yesterday(isoDate) {
    const [y,m,d] = isoDate.split("-").map(Number);
    return new Date(Date.UTC(y,m-1,d-1)).toISOString().slice(0,10);
  }
  function formatMm(value) {
    return Number(value).toLocaleString("pt-BR", {minimumFractionDigits:1,maximumFractionDigits:1});
  }
  function formatDate(date) {
    return `${date.slice(8,10)}/${date.slice(5,7)}/${date.slice(0,4)}`;
  }
  function roundMm(value) { return Math.round((value+Number.EPSILON)*10)/10; }
  function isNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 9999;
  }
  function normalizeDays(month, daily) {
    const byDate = new Map(
      (Array.isArray(daily) ? daily : [])
        .filter(row => row && DATE_FORMAT.test(String(row.data)) && String(row.data).startsWith(`${month}-`))
        .map(row => [String(row.data), isNumber(row.chuva_mm) ? roundMm(row.chuva_mm) : null])
    );
    return monthDates(month).map(data => ({ data, chuva_mm: byDate.has(data) ? byDate.get(data) : null }));
  }
  function summarize(month, days, updatedAt = new Date().toISOString()) {
    const valid = days.filter(row => isNumber(row.chuva_mm));
    return {
      mes: `${month}-01`,
      latitude: CONFIG.latitude,
      longitude: CONFIG.longitude,
      timezone: CONFIG.timezone,
      modelo: CONFIG.model,
      limiar_chuva_mm: CONFIG.threshold,
      dias_chuva: valid.filter(row => row.chuva_mm >= CONFIG.threshold).length,
      chuva_acumulada_mm: roundMm(valid.reduce((total,row)=>total+row.chuva_mm,0)),
      dias_com_dados: valid.length,
      total_dias_mes: days.length,
      completo: valid.length === days.length,
      dados_diarios: days,
      fonte: "Open-Meteo",
      updated_at: updatedAt
    };
  }
  function readSnapshot(month, row) {
    if (!row || String(row.mes).slice(0,7) !== month) return null;
    if (Number(row.latitude) !== CONFIG.latitude ||
        Number(row.longitude) !== CONFIG.longitude ||
        row.modelo !== CONFIG.model ||
        Number(row.limiar_chuva_mm) !== CONFIG.threshold ||
        row.timezone !== CONFIG.timezone) return null;
    return summarize(month, normalizeDays(month,row.dados_diarios),row.updated_at);
  }
  function badgeText() {
    const snapshot = state.snapshot;
    if (state.busy && !snapshot) return "Consultando";
    if (!snapshot || snapshot.dias_com_dados === 0) return "Sem dados";
    return snapshot.completo ? "Histórico completo" :
      `Parcial · ${snapshot.dias_com_dados}/${snapshot.total_dias_mes} dias`;
  }
  function renderCalendar(month, days, opts={report:false}) {
    if (!MONTH_FORMAT.test(month)) return "";
    const first = new Date(`${month}-01T12:00:00Z`).getUTCDay();
    const today = brToday();
    const stored = new Map((days||[]).map(row=>[row.data,row.chuva_mm]));
    const blank = Array.from({length:first},()=>`<span class="fm-climate-day is-blank" aria-hidden="true"></span>`).join("");
    const cells = monthDates(month).map(date=>{
      const mm = stored.has(date) ? stored.get(date) : null;
      const valid = isNumber(mm);
      const wet = valid && mm >= CONFIG.threshold;
      const lightRain = valid && mm > 0 && !wet;
      const pending = date >= today && !valid;
      const status = valid ? `${formatMm(mm)} mm de chuva` : pending ? "Dia ainda não consolidado" : "Dados não disponíveis";
      const label = `${weekNames[new Date(`${date}T12:00:00Z`).getUTCDay()]}, ${formatDate(date)}: ${status}`;
      const css = `fm-climate-day${wet?" is-rainy":lightRain?" is-light-rain":valid?" is-dry":" is-missing"}`;
      // O valor diario permanece visivel tambem em telas sem hover e no relatorio/PDF.
      // "0,0 mm" indica ausencia de chuva; "—" significa que nao ha dados disponiveis.
      const amount = valid
        ? `<span class="fm-climate-amount">${formatMm(mm)}</span><span class="fm-climate-unit"> mm</span>`
        : "—";
      const content = `<span class="fm-climate-day-number" aria-hidden="true">${Number(date.slice(-2))}</span>` +
        `<small class="fm-climate-day-value" aria-hidden="true">${amount}</small>`;
      if (opts.report) {
        return `<span class="${css}" aria-label="${label}">${content}</span>`;
      }
      // O tooltip original continua disponivel no mouse e no foco do teclado.
      return `<span class="${css}" tabindex="0" data-tooltip="${formatDate(date)} · ${status}" aria-label="${label}">${content}</span>`;
    });
    return blank+cells.join("");
  }
  function refreshReport() {
    const el = document.querySelector("[data-fm-weather-report]");
    if (el) el.outerHTML = reportHtml(state.month);
  }
  function render() {
    const snapshot = state.snapshot;
    const info = $("climateInfo");
    if (info) {
      info.textContent = state.message || (snapshot?.completo ?
        "Histórico completo para a localização da fábrica." :
        "Dados parciais: o histórico do modelo meteorológico pode ter alguns dias de atraso.");
      info.classList.toggle("is-warning",state.warning);
    }
    if ($("climateBadge")) $("climateBadge").textContent = badgeText();
    if ($("climateRainDays")) $("climateRainDays").textContent = snapshot?.dias_com_dados ? String(snapshot.dias_chuva) : "—";
    if ($("climateRainTotal")) $("climateRainTotal").textContent = snapshot?.dias_com_dados ? formatMm(snapshot.chuva_acumulada_mm) : "—";
    if ($("climateCalendar")) $("climateCalendar").innerHTML = renderCalendar(state.month,snapshot?.dados_diarios);
    refreshReport();
  }
  function archiveUrl(month) {
    const dates = monthDates(month);
    const lastEnded = yesterday(brToday());
    const end = dates.at(-1) < lastEnded ? dates.at(-1) : lastEnded;
    if (end < dates[0]) return null;
    const url = new URL(CONFIG.proxyUrl || CONFIG.archiveUrl);
    const params = {
      latitude: String(CONFIG.latitude), longitude: String(CONFIG.longitude),
      start_date: dates[0], end_date: end, daily: "rain_sum",
      timezone: CONFIG.timezone, precipitation_unit: "mm", models: CONFIG.model
    };
    for (const [key,val] of Object.entries(params)) url.searchParams.set(key,val);
    return url.toString();
  }
  async function fetchArchive(month, controller) {
    const url = archiveUrl(month);
    if (!url) return null;
    const response = await fetch(url,{signal:controller.signal,headers:{Accept:"application/json"}});
    if (!response.ok) throw new Error(`Open-Meteo retornou HTTP ${response.status}.`);
    const payload = await response.json();
    if (payload?.error) throw new Error(String(payload.reason||"Open-Meteo não retornou os dados."));
    const dates = payload?.daily?.time;
    const values = payload?.daily?.rain_sum;
    if (!Array.isArray(dates) || !Array.isArray(values) || dates.length!==values.length) {
      throw new Error("O Open-Meteo devolveu um histórico sem os campos esperados.");
    }
    const rows = dates.map((data,i)=>({
      data,
      chuva_mm: values[i]===null || values[i]===undefined ? null : Number(values[i])
    }));
    return summarize(month,normalizeDays(month,rows));
  }
  async function getSaved(month) {
    const {data,error} = await window.supabaseClient.from(CONFIG.table)
      .select("*").eq("mes",`${month}-01`).maybeSingle();
    if (error) throw error;
    return readSnapshot(month,data);
  }
  function canSave() {
    // Esta função complementa as políticas RLS, sem substituí-las.
    return window.FechamentosIsAdmin?.() === true;
  }
  async function saveSnapshot(snapshot) {
    if (!canSave()) return;
    const {error} = await window.supabaseClient.from(CONFIG.table).upsert(snapshot,{onConflict:"mes"});
    if (error) throw error;
  }
  function cacheFreshEnough(snapshot,force) {
    if (force || !snapshot) return false;
    if (snapshot.completo) return true;
    const updated = new Date(snapshot.updated_at).getTime();
    if (!Number.isFinite(updated)) return false;
    return Date.now()-updated < 6*60*60*1000;
  }
  async function load(month, options={}) {
    if (!MONTH_FORMAT.test(month)) return;
    const requestId = ++state.requestId;
    state.controller?.abort();
    const controller = new AbortController();
    state.controller = controller;
    state.month=month;
    state.snapshot=null;
    state.message="Consultando histórico de chuva...";
    state.warning=false;
    state.busy=true;
    render();
    let cached=null, storageError=null;
    try { cached = await getSaved(month); }
    catch(error) { storageError = error; console.warn("Consulta do histórico climático salvo:",error); }
    if (requestId!==state.requestId) return;
    if (cached) {
      state.snapshot=cached;
      state.message="Histórico salvo no Supabase.";
      state.busy=false;
      render();
    }
    if (cacheFreshEnough(cached,Boolean(options.force))) return;
    const url = archiveUrl(month);
    if (!url) {
      state.busy=false;
      state.message="Este período ainda não possui histórico meteorológico consolidado.";
      render();
      return;
    }
    state.busy=true;
    state.message=cached ? "Atualizando o histórico meteorológico..." : "Consultando dados meteorológicos...";
    render();
    try {
      const fresh = await fetchArchive(month,controller);
      if (requestId!==state.requestId) return;
      if (!fresh || fresh.dias_com_dados===0) throw new Error("Ainda não há registros diários disponíveis para este mês.");
      // Não substituir um histórico mais completo já salvo por uma resposta incompleta.
      const result = cached && cached.dias_com_dados > fresh.dias_com_dados ? cached : fresh;
      state.snapshot=result;
      state.warning=false;
      state.message = result.completo ?
        "Histórico meteorológico completo para a localização da fábrica." :
        `Dados parciais: ${result.dias_com_dados} de ${result.total_dias_mes} dias disponíveis (ERA5 pode ter atraso de alguns dias).`;
      state.busy=false;
      render();
      if (result===fresh) {
        try { await saveSnapshot(fresh); }
        catch(error) {
          if (requestId!==state.requestId) return;
          console.warn("Não foi possível guardar os dados meteorológicos:",error);
          state.warning=true;
          state.message+=" Não foi possível atualizar o histórico no Supabase; verifique o SQL V7.0.5.";
          render();
        }
      }
      if (storageError && !canSave()) console.warn("Histórico consultado na API, sem cache do banco.",storageError);
    } catch(error) {
      if (requestId!==state.requestId || error.name==="AbortError") return;
      console.warn("Erro ao consultar Open-Meteo:",error);
      state.busy=false;
      state.warning=true;
      state.message=cached ?
        `Não foi possível atualizar o Open-Meteo. Exibindo último histórico salvo. (${error.message})` :
        `Dados de chuva indisponíveis no momento: ${error.message}`;
      render();
    }
  }
  function reportHtml(month) {
    const snapshot = month===state.month ? state.snapshot : null;
    const hasData = Boolean(snapshot?.dias_com_dados);
    const status = !hasData ? "Histórico não disponível" :
      snapshot.completo ? "Histórico completo" :
        `Dados parciais (${snapshot.dias_com_dados}/${snapshot.total_dias_mes} dias)`;
    const dayCount = hasData ? snapshot.dias_chuva : "—";
    const rain = hasData ? `${formatMm(snapshot.chuva_acumulada_mm)} mm` : "—";
    return `<section class="fm-report-weather" data-fm-weather-report>
      <h3>Condições Climáticas · Chuvas do mês</h3>
      <div class="fm-report-weather-summary">
        <div><span>Dias com chuva (≥ 1 mm)</span><strong>${dayCount}</strong></div>
        <div><span>Chuva acumulada</span><strong>${rain}</strong></div>
        <div><span>Situação dos dados</span><strong>${status}</strong></div>
      </div>
      <h4>Distribuição diária de chuva</h4>
      <div class="fm-climate-weekdays" aria-hidden="true">
        <span>Dom</span><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span>
      </div>
      <div class="fm-climate-calendar is-report">${renderCalendar(month,snapshot?.dados_diarios,{report:true})}</div>
      <p class="fm-report-weather-note">Localização: -29.49698776598969, -52.03655804859432 · Fonte: Open-Meteo, ERA5, chuva diária (rain_sum).
      Valores estimados por modelo meteorológico, não medidos diretamente na fábrica. Dias sem dados não são considerados dias secos.</p>
    </section>`;
  }
  window.FechamentosClima={load, reportHtml};
})();
