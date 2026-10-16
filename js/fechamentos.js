const APP_VERSION = "5.1.35";

(() => {
"use strict";

const $ = id => document.getElementById(id);
const sb = window.supabaseClient;

const state = {
  user: null,
  profile: null,
  permission: "none",
  month: "",
  closing: null,
  attendance: [],
  presenceBaseline: []
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

const INTEGER_FIELDS = [
  "producao_total_qtd","producao_efetiva_qtd",
  "recusas_total_qtd","recusas_fabrica_qtd","outras_recusas_qtd",
  "maquiagem_qtd","consoles_pecas_qtd","consoles_consoles_qtd",
  "expedicao_qtd","projetado_qtd"
];

function esc(value){
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[ch]));
}

function isAdmin(){
  return state.permission === "admin";
}

function isoToday(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}

function monthLabel(month){
  if(!month) return "—";
  const [year,monthNumber] = month.split("-").map(Number);
  return new Date(year,monthNumber-1,1).toLocaleDateString("pt-BR",{
    month:"long",
    year:"numeric"
  });
}

function dateLabel(iso){
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"});
}

function weekdayLabel(iso){
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("pt-BR",{weekday:"short"}).replace(".","");
}

function monthDays(month){
  const [year,monthNumber] = month.split("-").map(Number);
  const total = new Date(year,monthNumber,0).getDate();
  return Array.from({length:total},(_,index) => {
    const day = index + 1;
    return `${year}-${String(monthNumber).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  });
}

function fmtM3(value){
  return `${Number(value||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:3})} m³`;
}

function fmtInt(value){
  return Number(value||0).toLocaleString("pt-BR");
}

function setMessage(text="",type=""){
  const el=$("fmMessage");
  if(!el) return;
  el.textContent=text;
  el.className=`fm-message ${type}`;
}

function loading(text){
  if(window.AppLoading?.show) window.AppLoading.show(text);
}

function doneLoading(){
  if(window.AppLoading?.hide) window.AppLoading.hide();
}

function translateError(error){
  const msg=String(error?.message||error||"");
  const lower=msg.toLowerCase();
  if(lower.includes("permission") || lower.includes("acesso permitido")){
    return "Você não possui permissão para executar esta operação.";
  }
  if(lower.includes("módulo fechamentos") || lower.includes("modulo fechamentos")){
    return "Você não possui acesso ao módulo Fechamentos de Mês.";
  }
  return msg || "Não foi possível concluir a operação.";
}

function setFormDisabled(disabled){
  document.querySelectorAll("#closingForm input,#closingForm button").forEach(el=>{
    if(el.id==="deleteClosingBtn" || el.id==="resetBtn" || el.id==="saveBtn" || el.type==="submit"){
      el.disabled = disabled;
    }else if(el.id!=="monthPicker"){
      el.disabled = disabled;
    }
  });
  $("monthPicker").disabled=false;
  document.querySelectorAll(".admin-only").forEach(el=>{
    el.classList.toggle("hidden",!isAdmin());
  });
}

function resetForm(){
  FIELD_IDS.forEach(id => {
    const el=$(id);
    if(el) el.value="";
  });
}

function fillForm(row){
  FIELD_IDS.forEach(id=>{
    const el=$(id);
    if(!el) return;
    const value=row?.[id];
    el.value = value === null || value === undefined ? "" : value;
  });
}

function readForm(){
  const data={};
  FIELD_IDS.forEach(id=>{
    const el=$(id);
    const raw=String(el?.value??"").trim().replace(",",".");
    data[id]=raw==="" ? 0 : Number(raw);
  });
  return data;
}

function validateData(data){
  for(const id of FIELD_IDS){
    if(!Number.isFinite(data[id]) || data[id] < 0){
      throw new Error(`Informe um valor válido em "${labelFor(id)}".`);
    }
  }
  for(const id of INTEGER_FIELDS){
    if(!Number.isInteger(data[id])){
      throw new Error(`O campo "${labelFor(id)}" deve ser um número inteiro.`);
    }
  }
}

function labelFor(id){
  const labels={
    producao_total_m3:"Produção total (m³)",
    producao_total_qtd:"Produção total (quantidade)",
    producao_efetiva_m3:"Produção efetiva (m³)",
    producao_efetiva_qtd:"Produção efetiva (quantidade)",
    recusas_total_m3:"Recusas total (m³)",
    recusas_total_qtd:"Recusas total (quantidade)",
    recusas_fabrica_m3:"Recusas da fábrica (m³)",
    recusas_fabrica_qtd:"Recusas da fábrica (quantidade)",
    outras_recusas_m3:"Outras recusas (m³)",
    outras_recusas_qtd:"Outras recusas (quantidade)",
    maquiagem_m3:"Maquiagem (m³)",
    maquiagem_qtd:"Maquiagem (quantidade)",
    consoles_pecas_qtd:"Consoles — peças",
    consoles_consoles_qtd:"Consoles — consoles",
    expedicao_m3:"Expedição (m³)",
    expedicao_qtd:"Expedição (quantidade)",
    projetado_m3:"Projetado (m³)",
    projetado_qtd:"Projetado (quantidade)"
  };
  return labels[id]||id;
}

function renderAttendance(){
  const body=$("attendanceBody");
  if(!body) return;

  body.innerHTML=state.attendance.map(row=>{
    const manual=row.atualizado_manualmente===true;
    return `
      <tr data-date="${esc(row.data)}">
        <td>${esc(dateLabel(row.data))}</td>
        <td class="weekday">${esc(weekdayLabel(row.data))}</td>
        <td>
          <input class="attendance-input" data-date="${esc(row.data)}" type="number" min="0" step="1" value="${Number(row.funcionarios||0)}" ${isAdmin()?"":"disabled"} aria-label="Funcionários em ${esc(dateLabel(row.data))}">
        </td>
        <td>
          <span class="fm-origin ${manual?"manual":"presence"}">${manual?"Editado":"Presença"}</span>
        </td>
      </tr>
    `;
  }).join("");

  body.querySelectorAll(".attendance-input").forEach(input=>{
    input.addEventListener("input",()=>{
      const row=state.attendance.find(item=>item.data===input.dataset.date);
      if(!row) return;
      row.funcionarios=Math.max(0,Number.parseInt(input.value||"0",10)||0);
      row.atualizado_manualmente=true;
      const origin=input.closest("tr")?.querySelector(".fm-origin");
      if(origin){
        origin.textContent="Editado";
        origin.className="fm-origin manual";
      }
      renderAttendanceKpi();
    });
  });
}

function renderAttendanceKpi(){
  const total=state.attendance.reduce((sum,row)=>sum+Number(row.funcionarios||0),0);
  const days=state.attendance.filter(row=>Number(row.funcionarios||0)>0).length;
  $("kpiFuncionarios").textContent=fmtInt(total);
  $("kpiDias").textContent=`${fmtInt(days)} ${days===1?"dia":"dias"} com presença`;
}

async function loadPresenceBaseline(){
  const {data,error}=await sb.rpc("obter_presencas_fechamento_mes",{p_mes:`${state.month}-01`});
  if(error) throw error;

  state.presenceBaseline=(data||[]).map(row=>({
    data:String(row.data).slice(0,10),
    funcionarios:Number(row.funcionarios||0),
    atualizado_manualmente:false
  }));
}

async function loadSavedAttendance(closingId){
  if(!closingId) return null;

  const {data,error}=await sb
    .from("fechamentos_mes_presencas")
    .select("data,funcionarios,atualizado_manualmente")
    .eq("fechamento_id",closingId)
    .order("data",{ascending:true});

  if(error) throw error;
  if(!data?.length) return null;

  return data.map(row=>({
    data:String(row.data).slice(0,10),
    funcionarios:Number(row.funcionarios||0),
    atualizado_manualmente:row.atualizado_manualmente===true
  }));
}

async function loadClosing(){
  const month=state.month;
  $("currentMonthLabel").textContent=monthLabel(month);
  $("formTitle").textContent=`Dados de ${monthLabel(month)}`;
  $("monthPicker").value=month;
  $("closingError").textContent="";

  loading(`Carregando fechamento de ${monthLabel(month)}...`);

  try{
    await loadPresenceBaseline();

    const {data,error}=await sb.rpc("obter_fechamento_mes",{p_mes:`${month}-01`});
    if(error) throw error;

    const row=Array.isArray(data)&&data.length ? data[0] : null;
    state.closing=row;

    if(row){
      fillForm(row);
      const saved=await loadSavedAttendance(row.id);
      state.attendance=saved?.length ? saved : state.presenceBaseline.map(item=>({...item}));
      $("closingStatus").textContent="Fechamento salvo";
      $("closingStatus").className="fm-status saved";
    }else{
      resetForm();
      state.attendance=state.presenceBaseline.map(item=>({...item}));
      $("closingStatus").textContent="Novo fechamento";
      $("closingStatus").className="fm-status new";
    }

    renderAttendance();
    renderKpis();
    updateHistorySelection();
    setFormDisabled(!isAdmin());
  }catch(error){
    console.error(error);
    setMessage(translateError(error),"error");
    state.closing=null;
    resetForm();
    state.attendance=state.presenceBaseline||[];
    renderAttendance();
    renderKpis();
  }finally{
    doneLoading();
  }
}

function renderKpis(){
  const d=state.closing;
  if(!d){
    $("kpiProducao").textContent="—";
    $("kpiProducaoQtd").textContent="Nenhum fechamento salvo";
    $("kpiEfetiva").textContent="—";
    $("kpiEfetivaQtd").textContent="—";
    $("kpiExpedicao").textContent="—";
    $("kpiExpedicaoQtd").textContent="—";
    renderAttendanceKpi();
    return;
  }

  $("kpiProducao").textContent=fmtM3(d.producao_total_m3);
  $("kpiProducaoQtd").textContent=`${fmtInt(d.producao_total_qtd)} peças`;
  $("kpiEfetiva").textContent=fmtM3(d.producao_efetiva_m3);
  $("kpiEfetivaQtd").textContent=`${fmtInt(d.producao_efetiva_qtd)} peças`;
  $("kpiExpedicao").textContent=fmtM3(d.expedicao_m3);
  $("kpiExpedicaoQtd").textContent=`${fmtInt(d.expedicao_qtd)} peças`;
  renderAttendanceKpi();
}

async function loadHistory(){
  try{
    const {data,error}=await sb.rpc("listar_fechamentos_mes");
    if(error) throw error;

    const rows=data||[];
    $("historyBody").innerHTML=rows.map(row=>`
      <tr>
        <td><strong>${esc(monthLabel(String(row.mes).slice(0,7)))}</strong></td>
        <td>${esc(fmtM3(row.producao_total_m3))}<small>${fmtInt(row.producao_total_qtd)} peças</small></td>
        <td>${esc(fmtM3(row.producao_efetiva_m3))}<small>${fmtInt(row.producao_efetiva_qtd)} peças</small></td>
        <td>${esc(fmtM3(row.expedicao_m3))}<small>${fmtInt(row.expedicao_qtd)} peças</small></td>
        <td>${fmtInt(row.funcionarios_dias_total)}<small>funcionários/dias</small></td>
        <td><button class="btn secondary fm-open-history" data-month="${esc(String(row.mes).slice(0,7))}" type="button">Abrir</button></td>
      </tr>
    `).join("");

    $("historyEmpty").classList.toggle("hidden",rows.length!==0);

    document.querySelectorAll(".fm-open-history").forEach(btn=>{
      btn.addEventListener("click",()=>{
        state.month=btn.dataset.month;
        loadClosing();
        window.scrollTo({top:0,behavior:"smooth"});
      });
    });

    updateHistorySelection();
  }catch(error){
    console.error(error);
    setMessage(translateError(error),"error");
  }
}

function updateHistorySelection(){
  document.querySelectorAll(".fm-open-history").forEach(btn=>{
    btn.classList.toggle("primary",btn.dataset.month===state.month);
  });
}

function collectAttendance(){
  return state.attendance.map(row=>({
    data:row.data,
    funcionarios:Math.max(0,Number.parseInt(row.funcionarios||0,10)||0),
    atualizado_manualmente:row.atualizado_manualmente===true
  }));
}

async function saveClosing(event){
  event?.preventDefault();
  if(!isAdmin()) return;

  const errorEl=$("closingError");
  errorEl.textContent="";

  try{
    const data=readForm();
    validateData(data);

    const attendance=collectAttendance();
    if(attendance.some(row=>!row.data)){
      throw new Error("Existe um dia de presença sem data.");
    }

    $("saveBtn").disabled=true;
    loading("Salvando fechamento...");

    const {data:result,error}=await sb.rpc("salvar_fechamento_mes",{
      p_mes:`${state.month}-01`,
      p_dados:data,
      p_presencas:attendance
    });

    if(error) throw error;

    setMessage("Fechamento salvo com sucesso.","success");
    await loadClosing();
    await loadHistory();

    if(result){
      $("closingStatus").textContent="Fechamento salvo";
      $("closingStatus").className="fm-status saved";
    }
  }catch(error){
    console.error(error);
    errorEl.textContent=translateError(error);
    setMessage("Não foi possível salvar o fechamento.","error");
  }finally{
    $("saveBtn").disabled=false;
    doneLoading();
  }
}

async function deleteClosing(){
  if(!isAdmin() || !state.closing?.id) return;

  const label=monthLabel(state.month);
  const confirmed=window.confirm(
    `Excluir o fechamento de ${label}?\n\nTodos os registros diários de funcionários deste fechamento também serão excluídos.`
  );
  if(!confirmed) return;

  try{
    $("deleteClosingBtn").disabled=true;
    loading("Excluindo fechamento...");

    const {error}=await sb.rpc("excluir_fechamento_mes",{p_id:state.closing.id});
    if(error) throw error;

    setMessage("Fechamento excluído com sucesso.","success");
    await loadClosing();
    await loadHistory();
  }catch(error){
    console.error(error);
    setMessage(translateError(error),"error");
  }finally{
    $("deleteClosingBtn").disabled=false;
    doneLoading();
  }
}

function newClosing(){
  const month=state.month || isoToday();
  state.month=month;
  $("monthPicker").value=month;
  loadClosing();
  window.scrollTo({top:0,behavior:"smooth"});
}

function resetChanges(){
  if(!isAdmin()) return;
  loadClosing();
}

async function boot(){
  try{
    state.user=await SiloSupabase.getUser();
    if(!state.user){
      $("loginScreen").classList.remove("hidden");
      $("appScreen").classList.add("hidden");
      return;
    }

    state.profile=await SiloSupabase.getProfile(state.user);
    if(!state.profile){
      throw new Error("Perfil do usuário não foi encontrado para a sessão autenticada.");
    }

    if(state.profile.active===false){
      await SiloSupabase.signOut();
      location.href="index.html";
      return;
    }

    const {data:isGlobalAdmin,error:adminError}=await sb.rpc("is_global_admin");
    if(adminError) throw adminError;

    if(isGlobalAdmin===true){
      state.permission="admin";
    }else{
      const permissions=await SiloSupabase.getModulePermissions(state.user);
      state.permission=String(permissions.fechamentos_mes||"none").toLowerCase();
    }

    if(!["viewer","admin"].includes(state.permission)){
      location.href="index.html?access=denied&module=fechamentos_mes";
      return;
    }

    $("userRole").textContent=isAdmin()?"ADMINISTRAR":"VISUALIZAÇÃO";
    $("userEmail").textContent=state.user.email||"";
    $("loginScreen").classList.add("hidden");
    $("appScreen").classList.remove("hidden");

    document.querySelectorAll(".admin-only").forEach(el=>{
      el.classList.toggle("hidden",!isAdmin());
    });

    state.month=isoToday();
    $("monthPicker").value=state.month;

    await loadClosing();
    await loadHistory();
  }catch(error){
    console.error("Fechamentos de Mês:",error);
    $("loginError").textContent=translateError(error);
    $("loginScreen").classList.remove("hidden");
    $("appScreen").classList.add("hidden");
  }
}

$("loginForm").addEventListener("submit",async event=>{
  event.preventDefault();
  $("loginError").textContent="";
  try{
    const result=await SiloSupabase.signIn(
      $("loginEmail").value.trim(),
      $("loginPassword").value
    );
    if(result?.error) throw result.error;
    await boot();
  }catch(error){
    $("loginError").textContent=translateError(error);
  }
});

$("monthPicker").addEventListener("change",()=>{
  const value=$("monthPicker").value;
  if(!value) return;
  state.month=value;
  loadClosing();
});

$("refreshBtn").addEventListener("click",async()=>{
  await loadClosing();
  await loadHistory();
});

$("newClosingBtn").addEventListener("click",newClosing);
$("resetBtn").addEventListener("click",resetChanges);
$("deleteClosingBtn").addEventListener("click",deleteClosing);
$("closingForm").addEventListener("submit",saveClosing);

$("logoutBtn").addEventListener("click",async()=>{
  try{await SiloSupabase.signOut();}
  finally{location.href="index.html";}
});

boot();
})();
