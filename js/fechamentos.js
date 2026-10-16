const APP_VERSION = "5.1.40";

(() => {
"use strict";

const $ = id => document.getElementById(id);
const sb = window.supabaseClient;

const state = {
  user:null, profile:null, permission:"none", month:"",
  closing:null, attendance:[], presenceBaseline:[], history:[]
};

const FIELD_IDS = [
  "producao_total_m3","producao_total_qtd",
  "producao_efetiva_m3","producao_efetiva_qtd",
  "recusas_total_m3","recusas_total_qtd",
  "recusas_fabrica_m3","recusas_fabrica_qtd",
  "outras_recusas_m3","outras_recusas_qtd",
  "maquiagem_m3","maquiagem_qtd",
  "consoles_pecas_qtd","consoles_consoles_qtd",
  "expedicao_m3","expedicao_qtd",
  "projetado_m3","projetado_qtd"
];

const INPUT_FIELDS = FIELD_IDS.filter(id=>!id.startsWith("producao_efetiva_") && !id.startsWith("outras_recusas_"));
const INTEGER_FIELDS = [
  "producao_total_qtd","producao_efetiva_qtd","recusas_total_qtd","recusas_fabrica_qtd",
  "outras_recusas_qtd","maquiagem_qtd","consoles_pecas_qtd","consoles_consoles_qtd",
  "expedicao_qtd","projetado_qtd"
];

function esc(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]));}
function isAdmin(){return state.permission==="admin";}
function currentMonth(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;}
function monthLabel(month){
  if(!month)return "—";
  const [y,m]=month.split("-").map(Number);
  return new Date(y,m-1,1).toLocaleDateString("pt-BR",{month:"long",year:"numeric"});
}
function previousMonth(month){
  const [y,m]=month.split("-").map(Number);
  const d=new Date(y,m-2,1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function dateLabel(iso){const d=new Date(`${iso}T00:00:00`);return Number.isNaN(d.getTime())?iso:d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"});}
function weekdayLabel(iso){const d=new Date(`${iso}T00:00:00`);return Number.isNaN(d.getTime())?"—":d.toLocaleDateString("pt-BR",{weekday:"short"}).replace(".","");}
function fmtM3(v){return `${Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:3})} m³`;}
function fmtNum(v,d=1){return Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:d});}
function fmtInt(v){return Number(v||0).toLocaleString("pt-BR");}
function setMessage(text="",type=""){const el=$("fmMessage");if(el){el.textContent=text;el.className=`fm-message ${type}`;}}
function loading(text){window.AppLoading?.show?.(text);}
function doneLoading(){window.AppLoading?.hide?.();}
function translateError(error){
  const msg=String(error?.message||error||""); const low=msg.toLowerCase();
  if(low.includes("permission")||low.includes("acesso permitido"))return "Você não possui permissão para executar esta operação.";
  if(low.includes("módulo fechamentos")||low.includes("modulo fechamentos"))return "Você não possui acesso ao módulo Fechamentos de Mês.";
  return msg||"Não foi possível concluir a operação.";
}
function monthDays(month){
  const [y,m]=month.split("-").map(Number), n=new Date(y,m,0).getDate();
  return Array.from({length:n},(_,i)=>`${y}-${String(m).padStart(2,"0")}-${String(i+1).padStart(2,"0")}`);
}

function calculateDerived(){
  const totalM3=Number($("producao_total_m3")?.value||0);
  const totalQtd=Number($("producao_total_qtd")?.value||0);
  const fabM3=Number($("recusas_fabrica_m3")?.value||0);
  const fabQtd=Number($("recusas_fabrica_qtd")?.value||0);
  const recTotalM3=Number($("recusas_total_m3")?.value||0);
  const recTotalQtd=Number($("recusas_total_qtd")?.value||0);
  const effectiveM3=totalM3-fabM3;
  const effectiveQtd=totalQtd-fabQtd;
  const otherM3=recTotalM3-fabM3;
  const otherQtd=recTotalQtd-fabQtd;
  $("producao_efetiva_m3").value=Number.isFinite(effectiveM3)?Math.max(0,effectiveM3):0;
  $("producao_efetiva_qtd").value=Number.isFinite(effectiveQtd)?Math.max(0,effectiveQtd):0;
  $("outras_recusas_m3").value=Number.isFinite(otherM3)?Math.max(0,otherM3):0;
  $("outras_recusas_qtd").value=Number.isFinite(otherQtd)?Math.max(0,otherQtd):0;
}
function resetForm(){INPUT_FIELDS.forEach(id=>{const e=$(id);if(e)e.value="";});calculateDerived();}
function fillForm(row){
  FIELD_IDS.forEach(id=>{const e=$(id);if(e)e.value=row?.[id]??"";});
  calculateDerived();
}
function readForm(){
  calculateDerived();
  const data={};
  FIELD_IDS.forEach(id=>{const raw=String($(id)?.value??"").trim().replace(",",".");data[id]=raw===""?0:Number(raw);});
  return data;
}
function validateData(data){
  for(const id of FIELD_IDS)if(!Number.isFinite(data[id])||data[id]<0)throw new Error(`Informe um valor válido em "${labelFor(id)}".`);
  if(data.producao_efetiva_m3<0 || data.producao_efetiva_qtd<0)throw new Error("A produção efetiva não pode ser negativa.");
  if(data.outras_recusas_m3<0 || data.outras_recusas_qtd<0)throw new Error("As outras recusas não podem ser negativas.");
  for(const id of INTEGER_FIELDS)if(!Number.isInteger(data[id]))throw new Error(`O campo "${labelFor(id)}" deve ser um número inteiro.`);
}
function labelFor(id){
  return ({
    producao_total_m3:"Produção total (m³)",producao_total_qtd:"Produção total (quantidade)",
    producao_efetiva_m3:"Produção efetiva (m³)",producao_efetiva_qtd:"Produção efetiva (quantidade)",
    recusas_total_m3:"Recusas total (m³)",recusas_total_qtd:"Recusas total (quantidade)",
    recusas_fabrica_m3:"Recusas da fábrica (m³)",recusas_fabrica_qtd:"Recusas da fábrica (quantidade)",
    outras_recusas_m3:"Outras recusas (m³)",outras_recusas_qtd:"Outras recusas (quantidade)",
    maquiagem_m3:"Maquiagem (m³)",maquiagem_qtd:"Maquiagem (quantidade)",
    consoles_pecas_qtd:"Consoles — peças",consoles_consoles_qtd:"Consoles — consoles",
    expedicao_m3:"Expedição (m³)",expedicao_qtd:"Expedição (quantidade)",
    projetado_m3:"Projetado (m³)",projetado_qtd:"Projetado (quantidade)"
  })[id]||id;
}

function setFormDisabled(disabled){
  document.querySelectorAll("#closingForm input").forEach(el=>{
    if(el.id==="monthPicker")return;
    el.disabled=disabled || el.readOnly;
  });
  document.querySelectorAll(".admin-only").forEach(el=>el.classList.toggle("hidden",!isAdmin()));
  if($("monthPicker"))$("monthPicker").disabled=false;
}

function renderAttendance(){
  const body=$("attendanceBody"); if(!body)return;
  body.innerHTML=state.attendance.map(row=>{
    const imported=Math.max(0,Number(row.quantidade_importada??row.funcionarios??0));
    const alter=Number(row.alteracoes||0);
    const effective=Math.max(0,imported+alter);
    return `<tr data-date="${esc(row.data)}">
      <td>${esc(dateLabel(row.data))}</td><td class="weekday">${esc(weekdayLabel(row.data))}</td>
      <td><input class="attendance-imported" type="number" value="${imported}" disabled></td>
      <td><input class="attendance-change" data-date="${esc(row.data)}" type="number" step="1" value="${alter}" ${isAdmin()?"":"disabled"}></td>
      <td><input class="attendance-note" data-date="${esc(row.data)}" type="text" value="${esc(row.observacoes||"")}" placeholder="Opcional" ${isAdmin()?"":"disabled"}></td>
      <td><strong class="effective-workers">${effective}</strong></td>
    </tr>`;
  }).join("");
  body.querySelectorAll(".attendance-change").forEach(input=>input.addEventListener("input",()=>updateAttendanceRow(input.dataset.date,input)));
  body.querySelectorAll(".attendance-note").forEach(input=>input.addEventListener("input",()=>{
    const row=state.attendance.find(r=>r.data===input.dataset.date); if(row)row.observacoes=input.value;
  }));
}
function updateAttendanceRow(date,input){
  const row=state.attendance.find(r=>r.data===date);if(!row)return;
  row.alteracoes=Number.parseInt(input.value||"0",10)||0;
  row.funcionarios=Math.max(0,Number(row.quantidade_importada||0)+row.alteracoes);
  const tr=input.closest("tr"); if(tr)tr.querySelector(".effective-workers").textContent=fmtInt(row.funcionarios);
  renderAttendanceKpi();
}
function renderAttendanceKpi(){
  const vals = state.attendance
    .map(r =>
      Math.max(
        0,
        Number(r.quantidade_importada || 0) + Number(r.alteracoes || 0)
      )
    )
    .filter(v => v > 0);

  const total = vals.reduce((a, b) => a + b, 0);

  // Média de funcionários por dia: sempre arredondada para baixo.
  const avg = vals.length
    ? Math.floor(total / vals.length)
    : 0;

  $("kpiFuncionarios").textContent = fmtInt(avg);
  $("kpiDias").textContent =
    `${fmtInt(vals.length)} ${vals.length === 1 ? "dia" : "dias"} trabalhados`;
}
async function loadPresenceBaseline(){
  const {data,error}=await sb.rpc("obter_presencas_fechamento_mes",{p_mes:`${state.month}-01`});
  if(error)throw error;
  state.presenceBaseline=(data||[]).map(r=>({data:String(r.data).slice(0,10),quantidade_importada:Number(r.funcionarios||0),alteracoes:0,observacoes:"",funcionarios:Number(r.funcionarios||0)}));
}
async function loadSavedAttendance(id){
  if(!id)return null;
  const {data,error}=await sb.from("fechamentos_mes_presencas").select("data,funcionarios,quantidade_importada,alteracoes,observacoes,atualizado_manualmente").eq("fechamento_id",id).order("data",{ascending:true});
  if(error)throw error;if(!data?.length)return null;
  return data.map(r=>({data:String(r.data).slice(0,10),quantidade_importada:Number(r.quantidade_importada??r.funcionarios??0),alteracoes:Number(r.alteracoes||0),observacoes:String(r.observacoes||""),funcionarios:Math.max(0,Number(r.quantidade_importada??r.funcionarios??0)+Number(r.alteracoes||0))}));
}
async function loadClosing(){
  $("currentMonthLabel").textContent=monthLabel(state.month);$("formTitle").textContent=`Dados de ${monthLabel(state.month)}`;$("monthPicker").value=state.month;$("closingError").textContent="";
  loading(`Carregando fechamento de ${monthLabel(state.month)}...`);
  try{
    await loadPresenceBaseline();
    const {data,error}=await sb.rpc("obter_fechamento_mes",{p_mes:`${state.month}-01`});if(error)throw error;
    const row=Array.isArray(data)&&data.length?data[0]:null;state.closing=row;
    if(row){fillForm(row);const saved=await loadSavedAttendance(row.id);state.attendance=saved?.length?saved:state.presenceBaseline.map(r=>({...r}));$("closingStatus").textContent="Fechamento salvo";$("closingStatus").className="fm-status saved";}
    else{resetForm();state.attendance=state.presenceBaseline.map(r=>({...r}));$("closingStatus").textContent="Novo fechamento";$("closingStatus").className="fm-status new";}
    renderAttendance();renderKpis();setFormDisabled(!isAdmin());updateHistorySelection();renderComparison();renderCharts();
  }catch(error){console.error(error);setMessage(translateError(error),"error");state.closing=null;resetForm();state.attendance=state.presenceBaseline||[];renderAttendance();renderKpis();}
  finally{doneLoading();}
}
function renderKpis(){
  const d=state.closing;
  if(!d){$("kpiProducao").textContent="—";$("kpiProducaoQtd").textContent="Nenhum fechamento salvo";$("kpiEfetiva").textContent="—";$("kpiEfetivaQtd").textContent="—";$("kpiExpedicao").textContent="—";$("kpiExpedicaoQtd").textContent="—";renderAttendanceKpi();return;}
  $("kpiProducao").textContent=fmtM3(d.producao_total_m3);$("kpiProducaoQtd").textContent=`${fmtInt(d.producao_total_qtd)} peças`;
  $("kpiEfetiva").textContent=fmtM3(d.producao_efetiva_m3);$("kpiEfetivaQtd").textContent=`${fmtInt(d.producao_efetiva_qtd)} peças`;
  $("kpiExpedicao").textContent=fmtM3(d.expedicao_m3);$("kpiExpedicaoQtd").textContent=`${fmtInt(d.expedicao_qtd)} peças`;
  renderAttendanceKpi();
}
async function loadHistory(){
  try{
    const {data,error}=await sb.rpc("listar_fechamentos_mes");if(error)throw error;
    state.history=data||[];
    $("historyBody").innerHTML=state.history.map(row=>`<tr>
      <td><strong>${esc(monthLabel(String(row.mes).slice(0,7)))}</strong></td>
      <td>${esc(fmtM3(row.producao_total_m3))}<small>${fmtInt(row.producao_total_qtd)} peças</small></td>
      <td>${esc(fmtM3(row.producao_efetiva_m3))}<small>${fmtInt(row.producao_efetiva_qtd)} peças</small></td>
      <td>${esc(fmtM3(row.expedicao_m3))}<small>${fmtInt(row.expedicao_qtd)} peças</small></td>
      <td>${fmtNum(row.media_funcionarios_dia||0,1)}<small>${fmtInt(row.dias_trabalhados||0)} dias trabalhados</small></td>
      <td><button class="btn secondary fm-open-history" data-month="${esc(String(row.mes).slice(0,7))}" type="button">Abrir</button></td>
    </tr>`).join("");
    $("historyEmpty").classList.toggle("hidden",state.history.length!==0);
    document.querySelectorAll(".fm-open-history").forEach(btn=>btn.addEventListener("click",()=>{state.month=btn.dataset.month;loadClosing();window.scrollTo({top:0,behavior:"smooth"});}));
    updateHistorySelection();renderComparison();renderCharts();
  }catch(error){console.error(error);setMessage(translateError(error),"error");}
}
function updateHistorySelection(){document.querySelectorAll(".fm-open-history").forEach(btn=>btn.classList.toggle("primary",btn.dataset.month===state.month));}

function collectAttendance(){return state.attendance.map(r=>({data:r.data,funcionarios:Math.max(0,Number(r.quantidade_importada||0)+Number(r.alteracoes||0)),quantidade_importada:Math.max(0,Number(r.quantidade_importada||0)),alteracoes:Number.parseInt(r.alteracoes||0,10)||0,observacoes:String(r.observacoes||""),atualizado_manualmente:Number(r.alteracoes||0)!==0||Boolean(r.observacoes)}));}
async function saveClosing(event){
  event?.preventDefault();if(!isAdmin())return;
  const errorEl=$("closingError");errorEl.textContent="";
  try{
    const data=readForm();validateData(data);const attendance=collectAttendance();
    $("saveBtn").disabled=true;loading("Salvando fechamento...");
    const {error}=await sb.rpc("salvar_fechamento_mes",{p_mes:`${state.month}-01`,p_dados:data,p_presencas:attendance});if(error)throw error;
    setMessage("Fechamento salvo com sucesso.","success");await loadClosing();await loadHistory();
  }catch(error){console.error(error);errorEl.textContent=translateError(error);setMessage("Não foi possível salvar o fechamento.","error");}
  finally{$("saveBtn").disabled=false;doneLoading();}
}
async function deleteClosing(){
  if(!isAdmin()||!state.closing?.id)return;
  if(!confirm(`Excluir o fechamento de ${monthLabel(state.month)}?\n\nTodos os registros diários de funcionários também serão excluídos.`))return;
  try{$("deleteClosingBtn").disabled=true;loading("Excluindo fechamento...");const {error}=await sb.rpc("excluir_fechamento_mes",{p_id:state.closing.id});if(error)throw error;setMessage("Fechamento excluído com sucesso.","success");await loadClosing();await loadHistory();}
  catch(error){console.error(error);setMessage(translateError(error),"error");}finally{$("deleteClosingBtn").disabled=false;doneLoading();}
}
function resetChanges(){if(isAdmin())loadClosing();}

function comparePct(current,previous){
  current=Number(current||0);previous=Number(previous||0);
  if(previous===0)return current===0?0:null;
  return ((current-previous)/Math.abs(previous))*100;
}
function comparisonLabel(pct, higherBetter=true){
  if(pct===null)return "Sem base anterior";
  if(Math.abs(pct)<0.01)return "Manteve";
  const improved=higherBetter?pct>0:pct<0;
  return improved?"Melhorou":"Piorou";
}
function renderComparison(){
  const grid=$("comparisonGrid"), label=$("comparisonLabel");if(!grid)return;
  const prev=previousMonth(state.month), previous=state.history.find(r=>String(r.mes).slice(0,7)===prev);
  label.textContent=`Comparado com ${monthLabel(prev)}`;
  if(!state.closing){grid.innerHTML=`<div class="fm-empty">Salve o fechamento para visualizar o comparativo.</div>`;return;}
  if(!previous){grid.innerHTML=`<div class="fm-empty">Ainda não existe fechamento de ${monthLabel(prev)} para comparação.</div>`;return;}
  const items=[
    ["Produção total",state.closing.producao_total_m3,previous.producao_total_m3,"m³",true],
    ["Produção efetiva",state.closing.producao_efetiva_m3,previous.producao_efetiva_m3,"m³",true],
    ["Recusas total",state.closing.recusas_total_m3,previous.recusas_total_m3,"m³",false],
    ["Recusas da fábrica",state.closing.recusas_fabrica_m3,previous.recusas_fabrica_m3,"m³",false],
    ["Expedição",state.closing.expedicao_m3,previous.expedicao_m3,"m³",true],
    ["Maquiagem",state.closing.maquiagem_m3,previous.maquiagem_m3,"m³",true],
    ["Projetado",state.closing.projetado_m3,previous.projetado_m3,"m³",true],
    ["Média funcionários/dia",averageCurrent(),previous.media_funcionarios_dia||0,"func./dia",true]
  ];
  grid.innerHTML=items.map(([name,c,p,unit,higher])=>{
    const pct=comparePct(c,p), label=comparisonLabel(pct,higher);
    const cls=label==="Melhorou"?"better":label==="Piorou"?"worse":"neutral";
    return `<article class="fm-compare-card ${cls}">
      <span>${esc(name)}</span><strong>${pct===null?"—":`${pct>=0?"+":""}${fmtNum(pct,1)}%`}</strong>
      <small>${esc(label)} · atual ${fmtNum(c,1)} ${unit} · anterior ${fmtNum(p,1)} ${unit}</small>
    </article>`;
  }).join("");
}
function averageCurrent(){
  const vals=state.attendance.map(r=>Math.max(0,Number(r.quantidade_importada||0)+Number(r.alteracoes||0))).filter(v=>v>0);
  return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0;
}

function monthKeyOffset(monthKey, offset){
  const [year, month] = String(monthKey || "").slice(0,7).split("-").map(Number);
  const d = new Date(year || new Date().getFullYear(), (month || 1) - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}

function monthShortLabel(monthKey){
  const [year, month] = String(monthKey).slice(0,7).split("-").map(Number);
  const d = new Date(year, (month || 1) - 1, 1);
  return d.toLocaleDateString("pt-BR",{month:"short"}).replace(".","").slice(0,3).toLowerCase()+"/"+String(year).slice(-2);
}

function renderMetricChart(containerId, rows, config){
  const container = $(containerId);
  if(!container) return;

  const anchor = state.month || currentMonth();
  const keys = Array.from({length:12},(_,i)=>monthKeyOffset(anchor,i-11));
  const byMonth = new Map(rows.map(r => [String(r.mes).slice(0,7), r]));

  const data = keys
    .map(key => ({key, label:monthShortLabel(key), row:byMonth.get(key)||null}))
    .filter(d => d.row && Number(config.value(d.row) || 0) > 0);

  const periodEl = $(config.periodId);
  if(periodEl){
    periodEl.textContent = data.length
      ? `${monthLabel(data[0].key)} — ${monthLabel(data[data.length-1].key)}`
      : "Sem dados";
  }

  if(!data.length){
    container.innerHTML = `<div class="fm-chart-empty">
      <strong>Nenhum dado registrado no período</strong>
      <span>Salve os fechamentos mensais para visualizar a evolução.</span>
    </div>`;
    return;
  }

  const values = data.map(d => Number(config.value(d.row) || 0));
  const average = values.reduce((sum,v)=>sum+v,0) / values.length;
  const latest = data[data.length-1];
  const latestValue = Number(config.value(latest.row) || 0);

  const W = Math.max(720, data.length * 88);
  const H = 350;
  const p = {l:58,r:28,t:48,b:54};
  const w = W-p.l-p.r;
  const h = H-p.t-p.b;

  const rawMax = Math.max(...values, average, 1);
  const step = rawMax <= 50 ? 10 : rawMax <= 100 ? 20 : rawMax <= 250 ? 50 : rawMax <= 500 ? 100 : 200;
  const max = Math.max(step, Math.ceil(rawMax * 1.16 / step) * step);
  const tickStep = max / 5;

  const groupStep = w / data.length;
  const barWidth = Math.min(54, groupStep * 0.52);
  const x = i => p.l + groupStep*i + groupStep/2;
  const y = value => p.t + h - (value/max)*h;

  const grid = Array.from({length:6},(_,i)=>{
    const value = tickStep * (5-i);
    const yy = y(value);
    return `
      <line x1="${p.l}" y1="${yy.toFixed(2)}" x2="${W-p.r}" y2="${yy.toFixed(2)}" class="fm-prod-grid-line"/>
      <text x="${p.l-10}" y="${(yy+4).toFixed(2)}" text-anchor="end" class="fm-prod-axis">${fmtNum(value,0)}</text>`;
  }).join("");

  const bars = data.map((d,i)=>{
    const value = Number(config.value(d.row) || 0);
    const bx = x(i) - barWidth/2;
    const by = y(value);
    const bh = Math.max(2, p.t+h-by);
    const labelY = Math.max(p.t+15, by-9);
    const isLatest = i === data.length-1;

    return `
      <g class="fm-prod-bar-group${isLatest ? " latest" : ""}" tabindex="0">
        <title>${esc(d.label)} — ${esc(config.title)}: ${fmtNum(value,config.decimals ?? 2)} ${esc(config.unit)}</title>
        <rect x="${bx.toFixed(2)}" y="${by.toFixed(2)}"
              width="${barWidth.toFixed(2)}" height="${bh.toFixed(2)}"
              rx="6" class="fm-prod-bar ${config.barClass || "blue"}${isLatest ? " latest" : ""}"/>
        <text x="${x(i).toFixed(2)}" y="${labelY.toFixed(2)}"
              text-anchor="middle" class="fm-prod-value">
          ${fmtNum(value,config.valueDecimals ?? 0)}
        </text>
      </g>`;
  }).join("");

  const labels = data.map((d,i)=>{
    const isLatest = i === data.length-1;
    return `<text x="${x(i).toFixed(2)}" y="${H-22}" text-anchor="middle"
      class="fm-prod-xlabel${isLatest ? " latest" : ""}">${esc(d.label)}</text>`;
  }).join("");

  const averageY = y(average);

  container.innerHTML = `
    <div class="fm-production-summary compact">
      <div class="fm-production-kpi ${config.kpiClass || ""}">
        <span>${esc(config.title)}</span>
        <strong>${config.format(latestValue)}</strong>
        <small>${esc(latest.label)} · último fechamento</small>
      </div>
      <div class="fm-production-average">
        <span>Média do período</span>
        <strong>${config.format(average)}</strong>
        <small>${data.length} ${data.length===1 ? "mês" : "meses"} com dados</small>
      </div>
    </div>

    <div class="fm-prod-chart-wrap compact-chart">
      <svg viewBox="0 0 ${W} ${H}" role="img"
           aria-label="Evolução de ${esc(config.title)} nos últimos 12 meses">
        ${grid}
        <line x1="${p.l}" y1="${p.t+h}" x2="${W-p.r}" y2="${p.t+h}" class="fm-prod-axis-line"/>
        <line x1="${p.l}" y1="${averageY.toFixed(2)}" x2="${W-p.r}" y2="${averageY.toFixed(2)}" class="fm-prod-average-line"/>
        <g class="fm-prod-average-label">
          <rect x="${W-p.r-128}" y="${(averageY-23).toFixed(2)}" width="116" height="22" rx="11"/>
          <text x="${W-p.r-70}" y="${(averageY-8).toFixed(2)}" text-anchor="middle">
            Média ${config.format(average)}
          </text>
        </g>
        ${bars}
        ${labels}
      </svg>
    </div>`;
}

function renderEvolutionChart(rows){
  renderMetricChart("productionChart", rows, {
    periodId:"evolutionChartPeriod",
    title:"Produção total",
    unit:"m³",
    value:r=>r.producao_total_m3,
    format:fmtM3,
    decimals:2,
    valueDecimals:0,
    barClass:"blue"
  });

  renderMetricChart("makeupChart", rows, {
    periodId:"makeupChartPeriod",
    title:"Maquiagem",
    unit:"m³",
    value:r=>r.maquiagem_m3,
    format:fmtM3,
    decimals:2,
    valueDecimals:0,
    barClass:"green"
  });

  renderMetricChart("logisticsChart", rows, {
    periodId:"logisticsChartPeriod",
    title:"Expedição",
    unit:"m³",
    value:r=>r.expedicao_m3,
    format:fmtM3,
    decimals:2,
    valueDecimals:0,
    barClass:"orange"
  });

  renderMetricChart("projectsChart", rows, {
    periodId:"projectsChartPeriod",
    title:"Projetado",
    unit:"m³",
    value:r=>r.projetado_m3,
    format:fmtM3,
    decimals:2,
    valueDecimals:0,
    barClass:"purple"
  });

  renderMetricChart("consolesChart", rows, {
    periodId:"consolesChartPeriod",
    title:"Consoles",
    unit:"consoles",
    value:r=>r.consoles_consoles_qtd,
    format:v=>`${fmtInt(v)} consoles`,
    decimals:0,
    valueDecimals:0,
    barClass:"teal"
  });
}

function renderCharts(){
  const rows=[...state.history].sort((a,b)=>String(a.mes).localeCompare(String(b.mes)));
  renderEvolutionChart(rows);
}

function reportMetrics(){
  const d=state.closing||{};
  return [
    ["Produção total",fmtM3(d.producao_total_m3),fmtInt(d.producao_total_qtd)+" peças"],
    ["Produção efetiva",fmtM3(d.producao_efetiva_m3),fmtInt(d.producao_efetiva_qtd)+" peças"],
    ["Recusas total",fmtM3(d.recusas_total_m3),fmtInt(d.recusas_total_qtd)+" peças"],
    ["Recusas da fábrica",fmtM3(d.recusas_fabrica_m3),fmtInt(d.recusas_fabrica_qtd)+" peças"],
    ["Outras recusas",fmtM3(d.outras_recusas_m3),fmtInt(d.outras_recusas_qtd)+" peças"],
    ["Maquiagem",fmtM3(d.maquiagem_m3),fmtInt(d.maquiagem_qtd)+" peças"],
    ["Consoles",fmtInt(d.consoles_pecas_qtd)+" peças",fmtInt(d.consoles_consoles_qtd)+" consoles"],
    ["Expedição",fmtM3(d.expedicao_m3),fmtInt(d.expedicao_qtd)+" peças"],
    ["Projetado",fmtM3(d.projetado_m3),fmtInt(d.projetado_qtd)+" peças"],
    ["Média funcionários/dia",fmtNum(averageCurrent(),1),`${fmtInt(state.attendance.filter(r=>(Number(r.quantidade_importada||0)+Number(r.alteracoes||0))>0).length)} dias trabalhados`]
  ];
}
function renderReport(){
  $("reportTitle").textContent=`Fechamento de ${monthLabel(state.month)}`;
  const previous=state.history.find(r=>String(r.mes).slice(0,7)===previousMonth(state.month));
  const metrics=reportMetrics();
  const cards=metrics.map(([a,b,c])=>`<div class="fm-report-metric"><span>${esc(a)}</span><strong>${esc(b)}</strong><small>${esc(c)}</small></div>`).join("");
  const att=state.attendance.map(r=>{
    const imported=Number(r.quantidade_importada||0),alter=Number(r.alteracoes||0),eff=Math.max(0,imported+alter);
    return `<tr><td>${esc(dateLabel(r.data))}</td><td>${esc(weekdayLabel(r.data))}</td><td>${imported}</td><td>${alter>0?"+":""}${alter}</td><td>${eff}</td><td>${esc(r.observacoes||"—")}</td></tr>`;
  }).join("");
  $("reportContent").innerHTML=`<div class="fm-report-header"><div><strong>Gestão de Fábrica</strong><span>Fechamento mensal · ${esc(monthLabel(state.month))}</span></div><span>${new Date().toLocaleDateString("pt-BR")}</span></div>
  <div class="fm-report-metrics">${cards}</div>
  <h3>Comparativo com ${esc(monthLabel(previousMonth(state.month)))}</h3>
  <div class="fm-report-comparison">${previous?renderReportComparison(previous):`<p>Não há fechamento do mês anterior para comparação.</p>`}</div>
  <h3>Funcionários que vieram trabalhar</h3>
  <table class="fm-report-table"><thead><tr><th>Data</th><th>Dia</th><th>Quantidade Importada</th><th>Alterações</th><th>Trabalhadores Efetivos</th><th>Observações</th></tr></thead><tbody>${att}</tbody></table>`;
}
function renderReportComparison(previous){
  const d=state.closing||{};
  const items=[["Produção total",d.producao_total_m3,previous.producao_total_m3,true],["Produção efetiva",d.producao_efetiva_m3,previous.producao_efetiva_m3,true],["Recusas total",d.recusas_total_m3,previous.recusas_total_m3,false],["Recusas da fábrica",d.recusas_fabrica_m3,previous.recusas_fabrica_m3,false],["Expedição",d.expedicao_m3,previous.expedicao_m3,true],["Projetado",d.projetado_m3,previous.projetado_m3,true]];
  return `<div class="fm-report-compare-grid">${items.map(([n,c,p,h])=>{const pct=comparePct(c,p),lab=comparisonLabel(pct,h);return `<div><strong>${esc(n)}</strong><span>${pct===null?"—":`${pct>=0?"+":""}${fmtNum(pct,1)}%`}</span><small>${lab}</small></div>`;}).join("")}</div>`;
}
function openReport(){renderReport();const d=$("reportDialog");if(d?.showModal)d.showModal();else d?.setAttribute("open","");}
function printReport(){if(!$("reportDialog")?.open)openReport();else renderReport();setTimeout(()=>window.print(),120);}

async function boot(){
  try{
    state.user=await SiloSupabase.getUser();
    if(!state.user){$("loginScreen").classList.remove("hidden");$("appScreen").classList.add("hidden");return;}
    state.profile=await SiloSupabase.getProfile(state.user);if(!state.profile)throw new Error("Perfil do usuário não foi encontrado para a sessão autenticada.");
    if(state.profile.active===false){await SiloSupabase.signOut();location.href="index.html";return;}
    const {data:isGlobalAdmin,error:adminError}=await sb.rpc("is_global_admin");if(adminError)throw adminError;
    if(isGlobalAdmin===true)state.permission="admin";else{const permissions=await SiloSupabase.getModulePermissions(state.user);state.permission=String(permissions.fechamentos_mes||"none").toLowerCase();}
    if(!["viewer","admin"].includes(state.permission)){location.href="index.html?access=denied&module=fechamentos_mes";return;}
    $("userRole").textContent=isAdmin()?"ADMINISTRAR":"VISUALIZAÇÃO";$("userEmail").textContent=state.user.email||"";
    $("loginScreen").classList.add("hidden");$("appScreen").classList.remove("hidden");
    document.querySelectorAll(".admin-only").forEach(el=>el.classList.toggle("hidden",!isAdmin()));
    state.month=currentMonth();$("monthPicker").value=state.month;
    await loadClosing();await loadHistory();
  }catch(error){console.error(error);$("loginError").textContent=translateError(error);$("loginScreen").classList.remove("hidden");$("appScreen").classList.add("hidden");}
}

$("loginForm").addEventListener("submit",async e=>{e.preventDefault();$("loginError").textContent="";try{const r=await SiloSupabase.signIn($("loginEmail").value.trim(),$("loginPassword").value);if(r?.error)throw r.error;await boot();}catch(error){$("loginError").textContent=translateError(error);}});
$("monthPicker").addEventListener("change",()=>{const v=$("monthPicker").value;if(v){state.month=v;loadClosing();}});
$("refreshBtn").addEventListener("click",async()=>{await loadClosing();await loadHistory();});
$("resetBtn").addEventListener("click",resetChanges);
$("deleteClosingBtn").addEventListener("click",deleteClosing);
$("closingForm").addEventListener("submit",saveClosing);
$("reportBtn").addEventListener("click",openReport);
$("reportPrintBtn").addEventListener("click",printReport);
$("printBtn").addEventListener("click",printReport);
$("closeReportBtn").addEventListener("click",()=>{$("reportDialog")?.close?.();});
document.querySelectorAll("#closingForm input").forEach(input=>{if(input.id!=="producao_efetiva_m3"&&input.id!=="producao_efetiva_qtd"&&input.id!=="outras_recusas_m3"&&input.id!=="outras_recusas_qtd")input.addEventListener("input",()=>{calculateDerived();});});
$("logoutBtn").addEventListener("click",async()=>{try{await SiloSupabase.signOut();}finally{location.href="index.html";}});
boot();
})();