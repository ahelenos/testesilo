/* V8.0.8 — Produção diária do mês: totais agregados do Silo e da Presença.
   Sem leitura de movimentos individuais ou dados pessoais no navegador. */
(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const WEEK = ["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];
  const state = {month:"", days:[], loading:false, error:"", requestId:0};

  function datesOfMonth(month) {
    const [year,monthNumber] = month.split("-").map(Number);
    const last = new Date(Date.UTC(year,monthNumber,0)).getUTCDate();
    return Array.from({length:last},(_,i)=>`${month}-${String(i+1).padStart(2,"0")}`);
  }

  function todayInFactory() {
    const parts = new Intl.DateTimeFormat("en-US",{
      timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"
    }).formatToParts(new Date());
    const value = key => parts.find(p=>p.type===key)?.value || "";
    return `${value("year")}-${value("month")}-${value("day")}`;
  }

  function validNumber(value) {
    if (value===null || value===undefined || value==="") return null;
    const n = Number(value);
    return Number.isFinite(n) && n>=0 && n<=1e10 ? n : null;
  }

  function formatM3(value) {
    return Number(value).toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:2});
  }
  function formatPeople(value) {
    return Number(value).toLocaleString("pt-BR",{maximumFractionDigits:0});
  }
  function formatDate(iso) {
    return `${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(0,4)}`;
  }

  function normalize(month, rows) {
    const byDate = new Map();
    for (const item of (Array.isArray(rows) ? rows : [])) {
      const date = String(item?.data || "").slice(0,10);
      const m3 = validNumber(item?.concretagem_m3);
      const consumption = validNumber(item?.registros_consumo);
      const people = validNumber(item?.funcionarios_presentes);
      const attendance = validNumber(item?.registros_presenca);
      if (!DATE_RE.test(date) || !date.startsWith(`${month}-`) ||
          [m3,consumption,people,attendance].some(value=>value===null) ||
          !Number.isSafeInteger(consumption) || !Number.isSafeInteger(people) ||
          !Number.isSafeInteger(attendance)) continue;
      byDate.set(date,{date,m3,consumption,people,attendance});
    }
    const today = todayInFactory();
    return datesOfMonth(month).map(date => {
      // Um dia só é considerado conhecido se houver lançamento real de
      // consumo de cimento ou registro de presença, nunca pela ausência deles.
      const row = byDate.get(date);
      const hasConcrete = Boolean(row && row.consumption > 0 && date<=today);
      const hasPresence = Boolean(row && row.attendance > 0 && date<=today);
      return {
        date,
        // Sem produção e com presença registrada equivale a 0,0 m³.
        // Sem nenhum lançamento, mostrar "—" (não inventar zero).
        m3: hasConcrete ? row.m3 : hasPresence ? 0 : null,
        people: hasPresence ? row.people : null,
        recordedConcrete: hasConcrete,
        recordedPresence: hasPresence
      };
    });
  }

  function summary(days) {
    const produced = days.filter(day=>day.recordedConcrete && day.m3 > 0);
    const attendance = days.filter(day=>day.recordedPresence);
    const total = produced.reduce((sum,day)=>sum+day.m3,0);
    const people = attendance.reduce((sum,day)=>sum+day.people,0);
    return {
      total,
      averageConcrete:produced.length ? total/produced.length : null,
      averagePeople:attendance.length ? people/attendance.length : null,
      productionDays:produced.length,
      attendanceDays:attendance.length,
      availableDays:days.filter(day=>day.recordedConcrete||day.recordedPresence).length
    };
  }

  function calendar(month,days,asReport=false) {
    if (!MONTH_RE.test(month)) return "";
    const first = new Date(`${month}-01T12:00:00Z`).getUTCDay();
    const blank = Array.from({length:first},()=>'<span class="fm-op-day is-blank" aria-hidden="true"></span>').join("");
    return blank + days.map(day => {
      const hasData = day.m3 !== null || day.people !== null;
      const hasRecords = day.recordedConcrete || day.recordedPresence;
      const producing = day.m3 !== null && day.m3 > 0;
      // O dia pode ter apenas lançamentos de ausência (0 presentes).
      // Nesse caso não existe atividade operacional, então exibimos traços
      // sem apagar os registros nem alterar médias e totais já calculados.
      const idle = hasRecords && !producing && !(day.people > 0);
      const css = `fm-op-day ${producing?"is-producing":idle?"is-idle":hasData?"is-registered":"is-missing"}`;
      const m3 = idle || day.m3 === null ? "—" : `${formatM3(day.m3)} m³`;
      const attendance = idle || day.people === null ? "—" : formatPeople(day.people);
      const peopleDescription = day.people === null ? "presença sem registro" :
        `${formatPeople(day.people)} ${day.people===1?"funcionário presente":"funcionários presentes"}`;
      const dayLabel = `${WEEK[new Date(`${day.date}T12:00:00Z`).getUTCDay()]}, ${formatDate(day.date)}: `;
      const label = idle
        ? dayLabel+"sem concretagem e sem funcionários presentes (0 m³ e 0 presentes); há lançamentos registrados neste dia."
        : dayLabel+`${day.m3===null?"concretagem sem registro":`${formatM3(day.m3)} m³ concretados`}; ${peopleDescription}`;
      const text = `<span class="fm-op-number" aria-hidden="true">${Number(day.date.slice(-2))}</span>`+
        `<span class="fm-op-volume" aria-hidden="true">${m3}</span>`+
        `<span class="fm-op-attendance" aria-hidden="true">${attendance=== "—" ? "—" : attendance+
          ' <span class="fm-op-attendance-full">presentes</span><span class="fm-op-attendance-short">pres.</span><span class="fm-op-attendance-mini">p.</span>'}</span>`;
      return asReport
        ? `<span class="${css}" aria-label="${label}">${text}</span>`
        : `<span class="${css}" tabindex="0" aria-label="${label}" data-tooltip="${label}">${text}</span>`;
    }).join("");
  }

  function refreshReport() {
    const existing = document.querySelector("[data-fm-operation-report]");
    if (existing) existing.outerHTML = reportHtml(state.month);
  }

  function render() {
    const month = state.month;
    if (!MONTH_RE.test(month)) return;
    const totals = summary(state.days);
    const info = $("operationInfo");
    const badge = $("operationBadge");
    if (badge) badge.textContent = state.loading ? "Consultando" :
      state.error ? "Consulta indisponível" :
      `${totals.availableDays} de ${state.days.length} dias com registros`;
    if (info) {
      info.textContent = state.loading ? "Consultando dados operacionais do mês..." :
        state.error ? `Dados operacionais indisponíveis: ${state.error}` :
        totals.availableDays===0 ? "Nenhum registro de concretagem ou presença neste mês." :
        "Volume do Silo e presença registrada na fábrica, atualizados ao consultar o mês.";
      info.classList.toggle("is-warning",Boolean(state.error));
    }
    const hasResult = !state.loading && !state.error && state.days.length>0;
    if ($("operationTotal")) $("operationTotal").textContent = hasResult && totals.availableDays>0 ? formatM3(totals.total) : "—";
    if ($("operationAvgM3")) $("operationAvgM3").textContent =
      hasResult && totals.averageConcrete!==null ? formatM3(totals.averageConcrete) : "—";
    if ($("operationAvgPresence")) $("operationAvgPresence").textContent =
      hasResult && totals.averagePeople!==null
        ? totals.averagePeople.toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1}) : "—";
    if ($("operationProductionDays")) $("operationProductionDays").textContent =
      hasResult ? `${totals.productionDays} ${totals.productionDays===1?"dia com concretagem":"dias com concretagem"}` : "—";
    if ($("operationAttendanceDays")) $("operationAttendanceDays").textContent =
      hasResult ? `${totals.attendanceDays} ${totals.attendanceDays===1?"dia com registro":"dias com registro"}` : "—";
    if ($("operationCalendar")) $("operationCalendar").innerHTML = calendar(month,state.days);
    refreshReport();
  }

  async function load(month) {
    if (!MONTH_RE.test(month)) return;
    const requestId = ++state.requestId;
    state.month = month;
    state.days = normalize(month,[]);
    state.loading = true;
    state.error = "";
    render();
    try {
      const sb = window.supabaseClient;
      if (!sb) throw new Error("Conexão Supabase indisponível.");
      const {data,error} = await sb.rpc("fm_producao_diaria_mes",{p_mes:`${month}-01`});
      if (requestId !== state.requestId) return;
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error("A consulta não retornou a estrutura esperada.");
      state.days = normalize(month,data);
      state.loading = false;
      render();
    } catch (error) {
      if (requestId !== state.requestId) return;
      console.error("Falha na consulta da produção diária do mês:",error);
      state.loading = false;
      state.error = /function.*not found|could not find.*function|404|PGRST202/i.test(String(error?.message||error))
        ? "execute o SQL V8.0.7 no Supabase."
        : "não foi possível consultar os dados; verifique sua conexão e permissões.";
      state.days = normalize(month,[]);
      render();
    }
  }

  function reportHtml(month) {
    if (!MONTH_RE.test(month)) return "";
    const days = month === state.month ? state.days : normalize(month,[]);
    const totals = summary(days);
    const ready = month===state.month && !state.loading && !state.error;
    const totalText = ready && totals.availableDays>0 ? `${formatM3(totals.total)} m³` : "—";
    const avgM3 = ready && totals.averageConcrete!==null
      ? `${formatM3(totals.averageConcrete)} m³` : "—";
    const avgPeople = ready && totals.averagePeople!==null
      ? totals.averagePeople.toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1}) : "—";
    return `<section class="fm-report-operation" data-fm-operation-report>
      <h3>Produção diária do mês</h3>
      <div class="fm-report-op-summary">
        <div><span>Concretagem no mês</span><strong>${totalText}</strong></div>
        <div><span>Média por dia com concretagem</span><strong>${avgM3}</strong></div>
        <div><span>Média de presentes por dia registrado</span><strong>${avgPeople}</strong></div>
      </div>
      <h4>Calendário operacional</h4>
      <div class="fm-op-weekdays" aria-hidden="true">
        <span>Dom</span><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span>
      </div>
      <div class="fm-op-calendar is-report">${calendar(month,days,true)}</div>
      <p class="fm-report-op-note">Concretagem: soma de m³ dos consumos do Silo por dia, no horário de Brasília.
      Presentes: colaboradores com manhã e tarde registradas no Controle de Presença, sem os ajustes do Fechamento.
      — indica ausência de dados ou dia com 0 m³ e 0 presentes; neste último caso os registros permanecem nos indicadores.
      0,0 m³ indica presença registrada sem concretagem.</p>
    </section>`;
  }

  window.FechamentosProducaoDiaria = Object.freeze({load,reportHtml});
})();
