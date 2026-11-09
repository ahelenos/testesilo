const APP_VERSION = "6.0.4";

(() => {
"use strict";

const $ = id => document.getElementById(id);
const sb = window.supabaseClient;

const state = {
  user:null, profile:null, permission:"none", month:"",
  closing:null, attendance:[], presenceBaseline:[], history:[], consolesSynced:false
};

const FIELD_IDS = [
  "producao_total_m3","producao_total_qtd",
  "producao_efetiva_m3","producao_efetiva_qtd",
  "recusas_total_m3","recusas_total_qtd",
  "recusas_fabrica_m3","recusas_fabrica_qtd",
  "outras_recusas_m3","outras_recusas_qtd",
  "maquiagem_m3","maquiagem_qtd",
  "montagem_m3","montagem_qtd",
  "consoles_pecas_qtd","consoles_consoles_qtd",
  "expedicao_m3","expedicao_qtd",
  "projetado_m3","projetado_qtd"
];

const INPUT_FIELDS = FIELD_IDS.filter(id=>!id.startsWith("producao_efetiva_") && !id.startsWith("outras_recusas_"));
const INTEGER_FIELDS = [
  "producao_total_qtd","producao_efetiva_qtd","recusas_total_qtd","recusas_fabrica_qtd",
  "outras_recusas_qtd","maquiagem_qtd","montagem_qtd","consoles_pecas_qtd","consoles_consoles_qtd",
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

// Normaliza valores exibidos no formulário a, no máximo, 3 casas decimais.
// Evita resíduos de ponto flutuante como 293.77000000000004.
function decimal3(value){
  const n = Number(value);
  if(!Number.isFinite(n)) return "0";
  return String(Math.round((n + Number.EPSILON) * 1000) / 1000);
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
  $("producao_efetiva_m3").value=Number.isFinite(effectiveM3)?decimal3(Math.max(0,effectiveM3)):"0";
  $("producao_efetiva_qtd").value=Number.isFinite(effectiveQtd)?Math.max(0,effectiveQtd):0;
  $("outras_recusas_m3").value=Number.isFinite(otherM3)?decimal3(Math.max(0,otherM3)):"0";
  $("outras_recusas_qtd").value=Number.isFinite(otherQtd)?Math.max(0,otherQtd):0;
}
function resetForm(){INPUT_FIELDS.forEach(id=>{const e=$(id);if(e)e.value="";});calculateDerived();}
function fillForm(row){
  FIELD_IDS.forEach(id=>{const e=$(id);if(e)e.value=(id.endsWith("_m3") && row?.[id] !== undefined && row?.[id] !== null && row?.[id] !== "") ? decimal3(row[id]) : (row?.[id]??"");});
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
    montagem_m3:"Montagem (m³)",montagem_qtd:"Montagem (quantidade de peças)",
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
      <td><input id="attendance-imported-${esc(row.data)}" name="attendance_imported_${esc(row.data)}" aria-label="Quantidade importada em ${esc(dateLabel(row.data))}" class="attendance-imported" type="number" value="${imported}" disabled></td>
      <td><input id="attendance-change-${esc(row.data)}" name="attendance_change_${esc(row.data)}" aria-label="Alterações em ${esc(dateLabel(row.data))}" class="attendance-change" data-date="${esc(row.data)}" type="number" step="1" value="${alter}" ${isAdmin()?"":"disabled"}></td>
      <td><input id="attendance-note-${esc(row.data)}" name="attendance_note_${esc(row.data)}" aria-label="Observações em ${esc(dateLabel(row.data))}" class="attendance-note" data-date="${esc(row.data)}" type="text" value="${esc(row.observacoes||"")}" placeholder="Opcional" ${isAdmin()?"":"disabled"}></td>
      <td><strong class="effective-workers">${effective}</strong></td>
    </tr>`;
  }).join("");
  body.querySelectorAll(".attendance-change").forEach(input=>input.addEventListener("input",()=>updateAttendanceRow(input.dataset.date,input)));
  body.querySelectorAll(".attendance-note").forEach(input=>input.addEventListener("input",()=>{
    const row=state.attendance.find(r=>r.data===input.dataset.date); if(row){row.observacoes=input.value;row.atualizado_manualmente=true;}
  }));
}
function updateAttendanceRow(date,input){
  const row=state.attendance.find(r=>r.data===date);if(!row)return;
  row.alteracoes=Number.parseInt(input.value||"0",10)||0;
  row.atualizado_manualmente=true;
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
  renderProductivityKpi(vals.length, avg);
}

function renderProductivityKpi(diasTrabalhados, mediaFuncionarios){
  const valorEl = $("kpiProdutividade");
  const detalheEl = $("kpiProdutividadeDetalhe");
  if(!valorEl || !detalheEl) return;

  // Considera o volume atual do formulário, permitindo prévia ao editar.
  const campoProducao = $("producao_total_m3");
  const producao = Number(String(campoProducao?.value ?? state.closing?.producao_total_m3 ?? "0")
    .trim().replace(",","."));

  if(!state.closing || !Number.isFinite(producao) || diasTrabalhados <= 0 || mediaFuncionarios <= 0){
    valorEl.textContent = "—";
    detalheEl.textContent = diasTrabalhados <= 0 || mediaFuncionarios <= 0
      ? "Sem dias ou funcionários para calcular"
      : "m³/funcionário/dia";
    return;
  }

  const resultado = (producao / diasTrabalhados) / mediaFuncionarios;
  valorEl.textContent = `${fmtNum(resultado,2)} m³`;
  detalheEl.textContent = "por funcionário / dia";
}
async function loadPresenceBaseline(){
  const {data,error}=await sb.rpc("obter_presencas_fechamento_mes",{p_mes:`${state.month}-01`});
  if(error)throw error;
  state.presenceBaseline=(data||[]).map(r=>{
    const imported=Math.max(0,Number(r.funcionarios||0));
    const automaticAdjustment=imported>0?-1:0;
    return {data:String(r.data).slice(0,10),quantidade_importada:imported,alteracoes:automaticAdjustment,observacoes:"",atualizado_manualmente:false,funcionarios:Math.max(0,imported+automaticAdjustment)};
  });
}
async function loadSavedAttendance(id){
  if(!id)return null;
  const {data,error}=await sb.from("fechamentos_mes_presencas").select("data,funcionarios,quantidade_importada,alteracoes,observacoes,atualizado_manualmente").eq("fechamento_id",id).order("data",{ascending:true});
  if(error)throw error;if(!data?.length)return null;
  return data.map(r=>({
    data:String(r.data).slice(0,10),
    quantidade_importada:Number(r.quantidade_importada??r.funcionarios??0),
    alteracoes:Number(r.alteracoes||0),
    observacoes:String(r.observacoes||""),
    atualizado_manualmente:Boolean(r.atualizado_manualmente),
    funcionarios:Math.max(0,Number(r.quantidade_importada??r.funcionarios??0)+Number(r.alteracoes||0))
  }));
}
// Consulta própria para Montagem: preserva o retorno das RPCs existentes.
async function getMontagemRows(){
  const {data,error}=await sb.rpc("obter_montagem_fechamentos_mes",{p_mes:`${state.month}-01`});
  if(error)throw error;
  return Array.isArray(data)?data:[];
}
function montagemByMonth(rows){
  return new Map(rows.map(r=>[String(r.mes).slice(0,7),r]));
}

async function loadClosing(){
  $("currentMonthLabel").textContent=monthLabel(state.month).replace(/ de /g,"/");$("formTitle").textContent=`Dados de ${monthLabel(state.month)}`;$("monthPicker").value=state.month;$("closingError").textContent="";
  loading(`Carregando fechamento de ${monthLabel(state.month)}...`);
  try{
    await loadPresenceBaseline();
    const {data,error}=await sb.rpc("obter_fechamento_mes",{p_mes:`${state.month}-01`});if(error)throw error;
    const row=Array.isArray(data)&&data.length?data[0]:null;state.closing=row;
    if(row){
      const montagemRows=await getMontagemRows();
      const montagemRow=montagemByMonth(montagemRows).get(state.month);
      state.closing={
        ...row,
        montagem_m3:montagemRow?.montagem_m3??0,
        montagem_qtd:montagemRow?.montagem_qtd??0
      };
      fillForm(state.closing);
      const saved=await loadSavedAttendance(row.id);
      // Os dados importados pertencem ao Controle de Presença; jamais tratar
      // uma cópia antiga como fonte definitiva. Preservar ajustes e observações.
      const savedByDate=new Map((saved||[]).map(r=>[r.data,r]));
      const baselineHasData=state.presenceBaseline.some(r=>Number(r.quantidade_importada)>0);
      state.attendance=state.presenceBaseline.map(base=>{
        const previous=savedByDate.get(base.data);
        const imported=baselineHasData
          ? Number(base.quantidade_importada||0)
          : Math.max(Number(base.quantidade_importada||0),Number(previous?.quantidade_importada||0));
        // Respeitar qualquer ajuste feito pelo usuário, inclusive zero explícito.
        // Registros antigos sem personalização recebem a nova regra padrão (-1).
        const manuallyCustomized=Boolean(previous?.atualizado_manualmente)
          || Number(previous?.alteracoes||0)!==0
          || Boolean(previous?.observacoes);
        const alteracoes=manuallyCustomized
          ? Number(previous.alteracoes||0)
          : (imported>0?-1:0);
        return {
          data:base.data,
          quantidade_importada:imported,
          alteracoes,
          observacoes:String(previous?.observacoes||""),
          atualizado_manualmente:manuallyCustomized,
          funcionarios:Math.max(0,imported+alteracoes)
        };
      });
      $("closingStatus").textContent="Fechamento salvo";
      $("closingStatus").className="fm-status saved";
    }
    else{resetForm();state.attendance=state.presenceBaseline.map(r=>({...r}));$("closingStatus").textContent="Novo fechamento";$("closingStatus").className="fm-status new";}
    // Fechamentos existentes sao historicos: nunca substituir os consoles
    // originalmente salvos por valores importados de outra origem.
    if(state.closing?.id){
      preserveSavedConsoles();
    }else try{
      await syncMonthlyConsoles();
    }catch(syncError){
      console.error(syncError);
      const status=$("consolesImportStatus");
      if(status){status.textContent=syncError.message+" O salvamento fica bloqueado até corrigir a importação.";status.classList.add("fm-consoles-error");}
      setMessage(syncError.message,"error");
    }
    renderAttendance();renderKpis();setFormDisabled(!isAdmin());updateHistorySelection();renderComparison();renderAnnualComparison();renderCharts();
  }catch(error){console.error(error);setMessage(translateError(error),"error");state.closing=null;resetForm();state.attendance=state.presenceBaseline||[];renderAttendance();renderKpis();}
  finally{doneLoading();}
}
// V6.0.7: Fechamentos existentes mantem os dados historicos de Consoles.
// Nao consultar o Controle Consoles ao abrir/editar um fechamento ja salvo.
function preserveSavedConsoles(){
  if(!state.closing?.id)return;
  const pillars=Number(state.closing.consoles_pecas_qtd??0);
  const consoles=Number(state.closing.consoles_consoles_qtd??0);
  $("consoles_pecas_qtd").value=String(Number.isFinite(pillars)?pillars:0);
  $("consoles_consoles_qtd").value=String(Number.isFinite(consoles)?consoles:0);
  const status=$("consolesImportStatus");
  if(status){
    status.textContent="Valores preservados do fechamento salvo. A importacao automatica vale apenas para fechamentos novos.";
    status.classList.remove("fm-consoles-error");
  }
  state.consolesSynced=true;
}
// V6.0.4: a origem oficial dos consoles é o Controle Consoles.
// A RPC retorna apenas os totais mensais, sem expor detalhes de obras
// a usuários que possuem acesso somente ao Fechamentos de Mês.
async function syncMonthlyConsoles(){
  state.consolesSynced=false;
  const {data,error}=await sb.rpc("cc_totais_fechamento_mes",{p_mes:`${state.month}-01`});
  if(error)throw new Error(`Erro ao importar Consoles: ${error.message}`);
  const row=Array.isArray(data)?data[0]:data;
  if(!row)throw new Error("A consulta mensal de Consoles não retornou valores.");
  const pillars=Number(row.pilares_executados);
  const consoles=Number(row.consoles_executados);
  if(!Number.isSafeInteger(pillars)||pillars<0||!Number.isSafeInteger(consoles)||consoles<0){
    throw new Error("Os totais importados do Controle Consoles são inválidos.");
  }
  $("consoles_pecas_qtd").value=String(pillars);
  $("consoles_consoles_qtd").value=String(consoles);
  if(state.closing){
    state.closing.consoles_pecas_qtd=pillars;
    state.closing.consoles_consoles_qtd=consoles;
  }
  const status=$("consolesImportStatus");
  if(status){status.textContent=`Importado automaticamente do Controle Consoles para ${monthLabel(state.month)}: ${pillars} pilar(es), ${consoles} console(s).`;status.classList.remove("fm-consoles-error");}
  state.consolesSynced=true;
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

    // A listagem historica nao inclui os campos de consoles.
    // Busca os volumes pela RPC especifica sem comprometer os demais graficos.
    try {
      const {data: evolution, error: evolutionError} = await sb.rpc(
        "obter_evolucao_fechamentos_mes",
        {p_mes: `${state.month}-01`}
      );
      if (evolutionError) throw evolutionError;

      const consolesByMonth = new Map(
        (evolution || []).map(row => [String(row.mes).slice(0, 7), row])
      );
      state.history = state.history.map(row => {
        const extra = consolesByMonth.get(String(row.mes).slice(0, 7));
        return extra ? {
          ...row,
          consoles_pecas_qtd: extra.consoles_pecas_qtd,
          consoles_consoles_qtd: extra.consoles_consoles_qtd
        } : row;
      });
    } catch (evolutionError) {
      console.warn("Nao foi possivel consultar a evolucao dos consoles:", evolutionError);
    }

    const montagemRows=await getMontagemRows();
    const montagemMap=montagemByMonth(montagemRows);
    state.history=state.history.map(row=>{
      const extra=montagemMap.get(String(row.mes).slice(0,7));
      return {...row,montagem_m3:extra?.montagem_m3??0,montagem_qtd:extra?.montagem_qtd??0};
    });

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
    updateHistorySelection();renderComparison();renderAnnualComparison();renderCharts();
  }catch(error){console.error(error);setMessage(translateError(error),"error");}
}
function updateHistorySelection(){document.querySelectorAll(".fm-open-history").forEach(btn=>btn.classList.toggle("primary",btn.dataset.month===state.month));}

function collectAttendance(){return state.attendance.map(r=>({data:r.data,funcionarios:Math.max(0,Number(r.quantidade_importada||0)+Number(r.alteracoes||0)),quantidade_importada:Math.max(0,Number(r.quantidade_importada||0)),alteracoes:Number.parseInt(r.alteracoes||0,10)||0,observacoes:String(r.observacoes||""),atualizado_manualmente:Boolean(r.atualizado_manualmente)||Number(r.alteracoes||0)!==0||Boolean(r.observacoes)}));}
async function saveClosing(event){
  event?.preventDefault();if(!isAdmin())return;
  const errorEl=$("closingError");errorEl.textContent="";
  try{
    // Nao sobrescrever consoles historicos ao editar um fechamento existente.
    // Somente o primeiro salvamento de um mes novo importa valores do Controle Consoles.
    if(state.closing?.id){
      preserveSavedConsoles();
    }else{
      await syncMonthlyConsoles();
    }
    const data=readForm();
    if(state.closing?.id){
      data.consoles_pecas_qtd=Number(state.closing.consoles_pecas_qtd??0);
      data.consoles_consoles_qtd=Number(state.closing.consoles_consoles_qtd??0);
    }
    validateData(data);const attendance=collectAttendance();
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
    ["Montagem",state.closing.montagem_m3,previous.montagem_m3,"m³",true],
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
// Compara o fechamento selecionado com a media dos meses salvos no mesmo
// ano civil, de janeiro ate o mes selecionado. Meses nao cadastrados nao
// entram na media; zeros registrados sao preservados.
function renderAnnualComparison(){
  const grid=$("annualComparisonGrid"), badge=$("annualComparisonLabel");
  if(!grid||!badge)return;

  const selected=String(state.month||"").slice(0,7);
  const year=selected.slice(0,4);
  const months=new Map();
  state.history.forEach(row=>{
    const key=String(row.mes||"").slice(0,7);
    if(key.startsWith(`${year}-`) && key<=selected) months.set(key,row);
  });

  // Caso a listagem ainda nao tenha atualizado, considera o fechamento
  // atualmente carregado, sem duplicar o mes.
  if(state.closing && selected) months.set(selected,state.closing);

  const closingMonths=[...months.values()];
  badge.textContent=closingMonths.length
    ? `${year} · ${closingMonths.length} ${closingMonths.length===1?"mês":"meses"} com fechamento`
    : `Ano ${year} · sem fechamentos`;

  if(!state.closing){
    grid.innerHTML='<div class="fm-empty">Salve o fechamento para visualizar o comparativo anual.</div>';
    return;
  }

  const metrics=[
    ["Produção total","producao_total_m3","m³",true],
    ["Produção efetiva","producao_efetiva_m3","m³",true],
    ["Recusas total","recusas_total_m3","m³",false],
    ["Recusas da fábrica","recusas_fabrica_m3","m³",false],
    ["Expedição","expedicao_m3","m³",true],
    ["Maquiagem","maquiagem_m3","m³",true],
    ["Montagem","montagem_m3","m³",true],
    ["Projetado","projetado_m3","m³",true],
    ["Média funcionários/dia","media_funcionarios_dia","func./dia",true]
  ];
  grid.innerHTML=metrics.map(([name,key,unit,higher])=>{
    const current=key==="media_funcionarios_dia"
      ? Math.floor(averageCurrent())
      : Number(state.closing[key]||0);
    const yearMean=closingMonths.reduce((sum,row)=>{
      const value=key==="media_funcionarios_dia" && String(row.mes).slice(0,7)===selected
        ? current
        : Number(row[key]||0);
      return sum+value;
    },0)/closingMonths.length;
    const pct=comparePct(current,yearMean);
    const validPct=yearMean!==0 ? pct : null;
    const result=validPct===null ? "Sem base anual" : comparisonLabel(validPct,higher);
    const cls=result==="Melhorou"?"better":result==="Piorou"?"worse":"neutral";
    return `<article class="fm-compare-card ${cls}">
      <span>${esc(name)}</span><strong>${validPct===null?"—":`${validPct>=0?"+":""}${fmtNum(validPct,1)}%`}</strong>
      <small>${esc(result)} · atual ${fmtNum(current,1)} ${unit} · média do ano ${fmtNum(yearMean,1)} ${unit}</small>
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

  // Escala decimal para indicadores inferiores a 1 m³ (eficiência).
  // Evita que 0,57 seja desenhado numa escala 0–10.
  const rawMax = Math.max(...values, average, Number(config.targetValue) || 0, config.fractionalScale ? 0.01 : 1);
  const step = config.fractionalScale
    ? (rawMax <= 0.25 ? 0.05 : rawMax <= 0.5 ? 0.1
      : rawMax <= 1 ? 0.2 : rawMax <= 2.5 ? 0.5
      : rawMax <= 5 ? 1 : Math.pow(10, Math.floor(Math.log10(rawMax))) / 2)
    : (rawMax <= 50 ? 10 : rawMax <= 100 ? 20 : rawMax <= 250 ? 50
      : rawMax <= 500 ? 100 : 200);
  const max = Math.max(step * (config.fractionalScale ? 5 : 1),
    Math.ceil(rawMax * 1.16 / step) * step);
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
      <text x="${p.l-10}" y="${(yy+4).toFixed(2)}" text-anchor="end" class="fm-prod-axis">${fmtNum(value,config.axisDecimals ?? 0)}</text>`;
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

  // Meta fixa de volume: exclusiva dos quatro gráficos selecionados.
  // A escala Y inclui a meta mesmo quando todos os volumes estão abaixo dela.
  const target = Number(config.targetValue);
  const hasTarget = Number.isFinite(target) && target > 0;
  const targetY = hasTarget ? y(target) : 0;
  // Evita sobrepor os rótulos se a média e a meta estiverem muito próximas.
  const targetLabelY = hasTarget
    ? Math.max(p.t + 3, Math.min(p.t + h - 24, targetY - 23))
    : 0;
  const meanLabelY = hasTarget && Math.abs(targetY - averageY) < 30
    ? Math.min(p.t + h - 22, averageY + 5)
    : averageY - 23;

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
          <rect x="${W-p.r-128}" y="${meanLabelY.toFixed(2)}" width="116" height="22" rx="11"/>
          <text x="${W-p.r-70}" y="${(meanLabelY+15).toFixed(2)}" text-anchor="middle">
            Média ${config.format(average)}
          </text>
        </g>
        ${hasTarget ? `
          <line x1="${p.l}" y1="${targetY.toFixed(2)}" x2="${W-p.r}" y2="${targetY.toFixed(2)}" class="fm-prod-target-line"/>
          <g class="fm-prod-target-label">
            <rect x="${W-p.r-72}" y="${targetLabelY.toFixed(2)}" width="68" height="22" rx="11"/>
            <text x="${W-p.r-38}" y="${(targetLabelY+15).toFixed(2)}" text-anchor="middle">META</text>
          </g>
        ` : ""}
        ${bars}
        ${labels}
      </svg>
    </div>`;
}

// Histórico mensal da eficiência: usa exatamente a mesma fórmula do card.
// Somente meses com fechamento e dias/funcionários válidos entram no gráfico.
function efficiencyForMonth(row){
  const volume = Number(row?.producao_total_m3);
  const days = Number(row?.dias_trabalhados);
  const avg = Math.floor(Number(row?.media_funcionarios_dia));
  if(!Number.isFinite(volume) || !Number.isFinite(days) ||
     !Number.isFinite(avg) || volume <= 0 || days <= 0 || avg <= 0){
    return 0;
  }
  return volume / days / avg;
}

function renderEvolutionChart(rows){
  renderMetricChart("productionChart", rows, {
    periodId:"evolutionChartPeriod",
    title:"Produção total",
    unit:"m³",
    targetValue:550,
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
    targetValue:550,
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
    targetValue:550,
    value:r=>r.projetado_m3,
    format:fmtM3,
    decimals:2,
    valueDecimals:0,
    barClass:"purple"
  });

  renderMetricChart("efficiencyChart", rows, {
    periodId:"efficiencyChartPeriod",
    title:"Média m³ por funcionário",
    unit:"m³/funcionário/dia",
    value:efficiencyForMonth,
    format:v=>`${fmtNum(v,2)} m³`,
    decimals:3,
    valueDecimals:2,
    axisDecimals:2,
    fractionalScale:true,
    barClass:"indigo"
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

  renderMetricChart("montagemChart", rows, {
    periodId:"montagemChartPeriod",
    title:"Montagem",
    unit:"m³",
    targetValue:550,
    value:r=>r.montagem_m3,
    format:fmtM3,
    decimals:2,
    valueDecimals:2,
    barClass:"cyan"
  });

  renderMetricChart("refusalsChart", rows, {
    periodId:"refusalsChartPeriod",
    title:"Recusas totais",
    unit:"m³",
    value:r=>r.recusas_total_m3,
    format:fmtM3,
    decimals:3,
    valueDecimals:2,
    axisDecimals:2,
    fractionalScale:true,
    barClass:"red"
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
    ["Montagem",fmtM3($("montagem_m3")?.value),fmtInt($("montagem_qtd")?.value)+" peças"],
    ["Consoles",fmtInt(d.consoles_pecas_qtd)+" peças",fmtInt(d.consoles_consoles_qtd)+" consoles"],
    ["Expedição",fmtM3(d.expedicao_m3),fmtInt(d.expedicao_qtd)+" peças"],
    ["Projetado",fmtM3(d.projetado_m3),fmtInt(d.projetado_qtd)+" peças"],
    ["Média funcionários/dia",fmtNum(averageCurrent(),1),`${fmtInt(state.attendance.filter(r=>(Number(r.quantidade_importada||0)+Number(r.alteracoes||0))>0).length)} dias trabalhados`]
  ];
}
// Aproveita os gráficos SVG já renderizados no painel. Não consulta nem altera
// dados no banco e evita resultados diferentes entre a tela e o relatório.
function reportEvolutionCharts(){
  const chartIds=[
    "productionChart",
    "makeupChart",
    "logisticsChart",
    "projectsChart",
    "efficiencyChart",
    "consolesChart",
    "montagemChart",
    "refusalsChart"
  ];
  const cards=chartIds.map(chartId=>{
    const chart=document.getElementById(chartId);
    const sourceCard=chart?.closest(".fm-chart-card");
    if(!sourceCard)return "";
    const copy=sourceCard.cloneNode(true);
    copy.classList.remove("fm-chart-wide");
    copy.querySelectorAll("[id]").forEach(el=>el.removeAttribute("id"));
    copy.querySelectorAll("[tabindex]").forEach(el=>el.removeAttribute("tabindex"));
    return `<section class="fm-report-chart-item">${copy.outerHTML}</section>`;
  }).filter(Boolean);
  return cards.length
    ? `<h3 class="fm-report-chart-title">Evolução dos indicadores mensais</h3>
       <p class="fm-report-chart-note">Gráficos dos fechamentos cadastrados no período analisado. Linha laranja: média dos meses com dados. Linha vermelha (META): 550 m³ nos gráficos de Produção Total, Expedição, Projetado e Montagem.</p>
       <div class="fm-report-charts">${cards.join("")}</div>`
    : `<h3>Evolução dos indicadores mensais</h3><p>Não há gráficos disponíveis para este período.</p>`;
}
function renderReport(){
  $("reportTitle").textContent=`Fechamento de ${monthLabel(state.month)}`;
  const previous=state.history.find(r=>String(r.mes).slice(0,7)===previousMonth(state.month));
  const metrics=reportMetrics();
  const cards=metrics.map(([a,b,c])=>`<div class="fm-report-metric"><span>${esc(a)}</span><strong>${esc(b)}</strong><small>${esc(c)}</small></div>`).join("");
  $("reportContent").innerHTML=`<div class="fm-report-header"><div><strong>Gestão de Fábrica</strong><span>Fechamento mensal · ${esc(monthLabel(state.month))}</span></div><span>${new Date().toLocaleDateString("pt-BR")}</span></div>
  <div class="fm-report-metrics">${cards}</div>
  <h3>Comparativo com ${esc(monthLabel(previousMonth(state.month)))}</h3>
  <div class="fm-report-comparison">${previous?renderReportComparison(previous):`<p>Não há fechamento do mês anterior para comparação.</p>`}</div>
  ${reportEvolutionCharts()}`;
}
function renderReportComparison(previous){
  const d=state.closing||{};
  const items=[["Produção total",d.producao_total_m3,previous.producao_total_m3,true],["Produção efetiva",d.producao_efetiva_m3,previous.producao_efetiva_m3,true],["Recusas total",d.recusas_total_m3,previous.recusas_total_m3,false],["Recusas da fábrica",d.recusas_fabrica_m3,previous.recusas_fabrica_m3,false],["Expedição",d.expedicao_m3,previous.expedicao_m3,true],["Projetado",d.projetado_m3,previous.projetado_m3,true]];
  return `<div class="fm-report-compare-grid">${items.map(([n,c,p,h])=>{const pct=comparePct(c,p),lab=comparisonLabel(pct,h);return `<div><strong>${esc(n)}</strong><span>${pct===null?"—":`${pct>=0?"+":""}${fmtNum(pct,1)}%`}</span><small>${lab}</small></div>`;}).join("")}</div>`;
}
function openReport(){renderCharts();renderReport();const d=$("reportDialog");if(d?.showModal)d.showModal();else d?.setAttribute("open","");}
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
$("monthPicker").addEventListener("change",()=>{const v=$("monthPicker").value;if(v){state.month=v;loadClosing();loadHistory();}});
$("refreshBtn").addEventListener("click",async()=>{await loadClosing();await loadHistory();});
$("resetBtn").addEventListener("click",resetChanges);
$("deleteClosingBtn").addEventListener("click",deleteClosing);
$("closingForm").addEventListener("submit",saveClosing);
$("reportBtn").addEventListener("click",openReport);
$("reportPrintBtn").addEventListener("click",printReport);
$("printBtn").addEventListener("click",printReport);
$("closeReportBtn").addEventListener("click",()=>{$("reportDialog")?.close?.();});
document.querySelectorAll("#closingForm input").forEach(input=>{if(input.id!=="producao_efetiva_m3"&&input.id!=="producao_efetiva_qtd"&&input.id!=="outras_recusas_m3"&&input.id!=="outras_recusas_qtd")input.addEventListener("input",()=>{
  calculateDerived();
  if(input.id === "producao_total_m3") renderAttendanceKpi();
  if(state.closing) renderAnnualComparison();
});});
$("logoutBtn").addEventListener("click",async()=>{try{await SiloSupabase.signOut();}finally{location.href="index.html";}});
boot();
})();