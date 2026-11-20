/* Controle Consoles — gráfico de linhas da produção diária (V7.0.8).
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

  const SVG_NS = "http://www.w3.org/2000/svg";
  const GRAPH_WIDTH = 900;
  const GRAPH_HEIGHT = 212;
  const CHART_TOP = 6;
  const CHART_BOTTOM = 206;

  function svgElement(tag, attributes) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) {
      node.setAttribute(name, String(value));
    }
    return node;
  }

  function lineCoordinates(days, key, max) {
    return days.map((day, i) => {
      const x = (i + 0.5) * GRAPH_WIDTH / DAYS;
      const y = CHART_BOTTOM - (day[key] / max) * (CHART_BOTTOM - CHART_TOP);
      return { x, y, value: day[key] };
    });
  }

  function renderLineChart(days, max) {
    // O SVG representa apenas valores numéricos derivados de registros validados.
    // Cada data possui um botão separado para mouse, teclado e telas sensíveis ao toque.
    const svg = svgElement("svg", {
      viewBox: `0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`,
      preserveAspectRatio: "none",
      "aria-hidden": "true",
      focusable: "false"
    });
    const series = [
      { field: "consoles", className: "cc-trend-line-consoles" },
      { field: "pillars", className: "cc-trend-line-pillars" }
    ];

    for (const item of series) {
      const points = lineCoordinates(days, item.field, max);
      const path = svgElement("path", {
        d: points.map((point, i) => `${i === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" "),
        class: `cc-trend-line ${item.className}`,
        fill: "none",
        "vector-effect": "non-scaling-stroke"
      });
      svg.append(path);

      for (const point of points) {
        if (!point.value) continue; // Evita ruído visual em dias sem produção.
        svg.append(svgElement("circle", {
          cx: point.x.toFixed(2),
          cy: point.y.toFixed(2),
          r: item.field === "consoles" ? 3.8 : 3.4,
          class: `cc-trend-marker ${item.className}-marker`,
          "vector-effect": "non-scaling-stroke"
        }));
      }
    }
    $("ccTrendSeries").replaceChildren(svg);

    const buttons = days.map((day, i) => {
      const pillarText = `${formatNumber.format(day.pillars)} ${day.pillars === 1 ? "pilar concluído" : "pilares concluídos"}`;
      const consoleText = `${formatNumber.format(day.consoles)} ${day.consoles === 1 ? "console executado" : "consoles executados"}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cc-trend-day";
      button.setAttribute("aria-label", `${br(day.date)}: ${pillarText} e ${consoleText}.`);
      button.setAttribute("aria-pressed", "false");
      button.dataset.position = String(i);
      const tooltip = document.createElement("span");
      tooltip.className = "cc-trend-tooltip";
      tooltip.setAttribute("aria-hidden", "true");
      for (const [text, isHeading] of [[br(day.date), true], [pillarText, false], [consoleText, false]]) {
        const node = document.createElement(isHeading ? "strong" : "span");
        node.textContent = text;
        tooltip.append(node);
      }
      button.append(tooltip);
      button.addEventListener("click", () => {
        const selected = button.classList.contains("cc-trend-active");
        for (const item of buttons) {
          item.classList.remove("cc-trend-active");
          item.setAttribute("aria-pressed", "false");
        }
        if (!selected) {
          button.classList.add("cc-trend-active");
          button.setAttribute("aria-pressed", "true");
        }
      });
      return button;
    });
    $("ccTrendColumns").replaceChildren(...buttons);

    const labels = days.map((day, i) => {
      const label = document.createElement("span");
      label.textContent = i === 0 || i === DAYS - 1 || i % 4 === 0 ? compactDate(day.date) : "";
      return label;
    });
    $("ccTrendDates").replaceChildren(...labels);
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

    renderLineChart(days, top);

    $("ccTrendChart").classList.remove("hidden");
    $("ccTrendRetry").classList.add("hidden");
    setStatus(totals.activeDays
      ? `Execuções registradas em ${totals.activeDays} de ${DAYS} dias. Toque ou passe o mouse sobre o gráfico para consultar cada data.`
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
