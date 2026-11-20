/* Controle Consoles — produção diária dos últimos 30 dias (V7.0.7).
 * Somente leitura. A quantidade de pilares é a contagem de registros
 * em cc_execucoes (um registro por pilar); consoles = SUM(quantidade).
 * Usa o calendário da fábrica em America/Sao_Paulo.
 */
(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const DAYS = 30;
  const PAGE = 1000;
  const MAX_ROWS = 100000;
  const TIME_ZONE = "America/Sao_Paulo";
  const formatNumber = new Intl.NumberFormat("pt-BR");
  let requestNumber = 0;

  function factoryToday() {
    const parts = new Intl.DateTimeFormat("pt-BR", {
      timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date());
    const value = type => parts.find(part => part.type === type)?.value;
    return `${value("year")}-${value("month")}-${value("day")}`;
  }

  function shiftDate(iso, offset) {
    // Operações em UTC evitam saltos de data durante mudanças de horário de verão.
    const date = new Date(`${iso}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  }

  function br(iso) {
    const [year, month, day] = iso.split("-");
    return `${day}/${month}/${year}`;
  }

  function compactDate(iso) {
    const [, month, day] = iso.split("-");
    return `${day}/${month}`;
  }

  function niceScale(max) {
    if (!max) return { top: 4, step: 1 };
    const raw = max / 4;
    const unit = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / unit;
    const magnitude = [1, 2, 3, 5, 10].find(value => value >= n) ?? 10;
    const step = Math.max(1, magnitude * unit);
    return { top: step * 4, step };
  }

  function setStatus(text, error = false) {
    const node = $("ccTrendStatus");
    node.textContent = text;
    node.classList.toggle("cc-trend-error", error);
  }

  function setLoading() {
    setStatus("Carregando produção dos últimos 30 dias...");
    $("ccTrendRetry").classList.add("hidden");
  }

  async function fetchExecutions(from, to) {
    const sb = window.supabaseClient;
    if (!sb) throw new Error("Conexão com Supabase indisponível.");
    const rows = [];
    for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
      const { data, error } = await sb.from("cc_execucoes")
        .select("pilar_id,quantidade,data_execucao")
        .gte("data_execucao", from)
        .lte("data_execucao", to)
        .order("data_execucao", { ascending: true })
        .order("pilar_id", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      const batch = data || [];
      rows.push(...batch);
      if (batch.length < PAGE) return rows;
    }
    throw new Error("O período contém muitos registros. Não foi possível carregar o gráfico completo.");
  }

  function dailyTotals(rows, from) {
    const days = Array.from({ length: DAYS }, (_, i) => ({
      date: shiftDate(from, i), pillars: 0, consoles: 0
    }));
    const buckets = new Map(days.map(day => [day.date, day]));
    const seenPillars = new Set();
    for (const row of rows) {
      const day = buckets.get(String(row.data_execucao || "").slice(0, 10));
      if (!day || !row.pilar_id || seenPillars.has(row.pilar_id)) continue;
      const quantity = Number(row.quantidade);
      if (!Number.isSafeInteger(quantity) || quantity < 1) {
        throw new Error("Foi encontrado um registro de execução com quantidade inválida.");
      }
      seenPillars.add(row.pilar_id);
      day.pillars += 1;
      day.consoles += quantity;
    }
    return days;
  }

  function render(days, from, to) {
    const totals = days.reduce((sum, day) => {
      sum.pillars += day.pillars;
      sum.consoles += day.consoles;
      if (day.pillars) sum.activeDays++;
      return sum;
    }, { pillars: 0, consoles: 0, activeDays: 0 });

    $("ccTrendPillars").textContent = formatNumber.format(totals.pillars);
    $("ccTrendConsoles").textContent = formatNumber.format(totals.consoles);
    $("ccTrendPeriod").textContent =
      `${br(from)} a ${br(to)} · Todas as obras · Horário de Brasília`;

    const largest = Math.max(...days.map(day => Math.max(day.pillars, day.consoles)));
    const { top, step } = niceScale(largest);
    $("ccTrendAxis").replaceChildren();
    for (let i = 4; i >= 0; i--) {
      const tick = document.createElement("span");
      tick.textContent = formatNumber.format(step * i);
      $("ccTrendAxis").append(tick);
    }

    // Elementos textuais são tratados como texto, e as alturas como números,
    // não como HTML fornecido pelo banco.
    $("ccTrendColumns").innerHTML = days.map((day, i) => {
      const heightPillars = (day.pillars / top) * 100;
      const heightConsoles = (day.consoles / top) * 100;
      const pillarText = `${formatNumber.format(day.pillars)} ${day.pillars === 1 ? "pilar concluído" : "pilares concluídos"}`;
      const consoleText = `${formatNumber.format(day.consoles)} ${day.consoles === 1 ? "console executado" : "consoles executados"}`;
      const tooltip = `${br(day.date)}: ${pillarText} e ${consoleText}.`;
      return `<button type="button" class="cc-trend-day" aria-label="${tooltip}" data-position="${i}">
        <span class="cc-trend-bar cc-trend-bar-pillars" style="height:${heightPillars}%"></span>
        <span class="cc-trend-bar cc-trend-bar-consoles" style="height:${heightConsoles}%"></span>
        <span class="cc-trend-tooltip" aria-hidden="true">
          <strong>${br(day.date)}</strong>
          <span>${pillarText}</span>
          <span>${consoleText}</span>
        </span>
      </button>`;
    }).join("");

    $("ccTrendDates").innerHTML = days.map((day, i) =>
      `<span>${i === 0 || i === DAYS - 1 || i % 4 === 0 ? compactDate(day.date) : ""}</span>`
    ).join("");

    $("ccTrendChart").classList.remove("hidden");
    $("ccTrendRetry").classList.add("hidden");
    setStatus(totals.activeDays
      ? `Execuções registradas em ${totals.activeDays} de ${DAYS} dias. Toque ou passe o mouse sobre as barras para consultar cada data.`
      : "Nenhuma execução registrada nos últimos 30 dias.");
  }

  async function refresh() {
    const currentRequest = ++requestNumber;
    const to = factoryToday();
    const from = shiftDate(to, -(DAYS - 1));
    setLoading();
    try {
      const rows = await fetchExecutions(from, to);
      if (currentRequest !== requestNumber) return;
      render(dailyTotals(rows, from), from, to);
    } catch (error) {
      if (currentRequest !== requestNumber) return;
      console.error("Falha ao carregar o gráfico de Consoles:", error);
      $("ccTrendChart").classList.add("hidden");
      $("ccTrendPillars").textContent = "—";
      $("ccTrendConsoles").textContent = "—";
      setStatus("Não foi possível carregar o gráfico diário. Os demais controles continuam disponíveis.", true);
      $("ccTrendRetry").classList.remove("hidden");
    }
  }

  document.addEventListener("cc:execucoes-carregadas", refresh);
  $("ccTrendRetry").addEventListener("click", refresh);
})();
