(() => {
"use strict";
const APP_VERSION = "4.2.1";
const $=id=>document.getElementById(id);
const sb=window.supabaseClient || window.supabase;
let role="viewer", modulePermission="viewer", tools=[], repairs=[], loans=[], assists=[], toolTypes=[];
let currentTab="tools", editing=null, editingType=null;

const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const dateBR=v=>v?new Date(`${v}T12:00:00`).toLocaleDateString("pt-BR"):"—";
const isAdmin=()=>role==="admin" || modulePermission==="admin";
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
const statusMap={disponivel:["Disponível","green"],em_conserto:["Em assistência","orange"],emprestada:["Emprestada","blue"],baixada:["Inservível","red"]};
const repairStatus={enviado:"Enviado",aguardando_orcamento:"Aguardando orçamento",orcamento_aprovado:"Orçamento aprovado",em_conserto:"Em conserto",pronto:"Pronto",retornado:"Retornado",cancelado:"Cancelado"};
const budgetStatus={aguardando:"Aguardando orçamento",aprovado:"Aprovado",reprovado:"Reprovado",dispensado:"Sem orçamento"};
const loanStatus={emprestada:"No canteiro",devolvida:"Devolvida",cancelada:"Cancelada"};

async function boot(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session){ location.href="index.html"; return; }
  const {data:p,error}=await sb.from("profiles").select("role").eq("id",session.user.id).maybeSingle();
  if(error){showError(error.message);return}
  role=String(p?.role||"viewer").toLowerCase();
  try{
    if(window.SiloSupabase?.getModulePermission) modulePermission=await window.SiloSupabase.getModulePermission("ferramentas",session.user);
    else {
      const {data:mp}=await sb.from("module_permissions").select("permission").eq("user_id",session.user.id).eq("module","ferramentas").maybeSingle();
      modulePermission=String(mp?.permission||"viewer").toLowerCase();
    }
  }catch(e){ modulePermission="viewer"; console.warn("Permissão por módulo:",e); }
  $("roleLabel").textContent=isAdmin()?"ADMIN":"VISUALIZAÇÃO";
  $("userEmail").textContent=session.user.email||"";
  if(!isAdmin()) document.querySelectorAll(".admin-only").forEach(e=>e.remove());
  $("logoutBtn").onclick=async()=>{await sb.auth.signOut();location.href="index.html"};
  bind();
  await loadAll();
}
function bind(){
  $("newToolBtn")?.addEventListener("click",()=>openTool());
  $("closeModal").onclick=closeModal;
  $("modal").addEventListener("click",e=>{if(e.target.id==="modal")closeModal()});
  $("closeAssistModal").onclick=closeAssistModal;
  $("cancelAssistForm").onclick=closeAssistModal;
  $("assistQuickForm").onsubmit=saveQuickAssist;
  $("assistModal").addEventListener("click",e=>{if(e.target.id==="assistModal")closeAssistModal()});
  $("closeTypeModal").onclick=closeTypeModal;
  $("cancelTypeForm").onclick=closeTypeModal;
  $("typeQuickForm").onsubmit=saveQuickType;

  // Gerenciamento de tipos de ferramenta
  $("manageTypesBtn")?.addEventListener("click",openTypeManager);
  $("closeTypeManager")?.addEventListener("click",closeTypeManager);
  $("newTypeFromManager")?.addEventListener("click",()=>{
    closeTypeManager();
    openQuickType();
  });
  $("typeManagerModal")?.addEventListener("click",e=>{
    if(e.target.id==="typeManagerModal")closeTypeManager();
  });

  $("typeModal").addEventListener("click",e=>{if(e.target.id==="typeModal")closeTypeModal()});
  $("search").addEventListener("input",render);
  $("statusFilter").addEventListener("change",render);
  document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{currentTab=b.dataset.tab;document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));["tools","repairs","loans"].forEach(x=>$(`${x}Panel`).classList.toggle("hidden",x!==currentTab));const sf=$("statusFilter");if(currentTab==="repairs"||currentTab==="loans"){sf.value="current"}else{sf.value="all"}render()});
}
async function loadAll(){
  const [a,b,c,d,e]=await Promise.all([
    sb.from("ferramentas").select("*").order("codigo"),
    sb.from("ferramentas_consertos").select("*, ferramentas(codigo,tipo,marca,modelo,apelido,ativo), assistencias_tecnicas(nome)").order("created_at",{ascending:false}),
    sb.from("ferramentas_emprestimos").select("*, ferramentas(codigo,tipo,marca,modelo,apelido,ativo)").order("created_at",{ascending:false}),
    sb.from("assistencias_tecnicas").select("*").order("nome"),
    sb.from("tipos_ferramentas").select("*").eq("ativo",true).order("nome")
  ]);
  if(a.error||b.error||c.error||d.error||e.error){showError((a.error||b.error||c.error||d.error||e.error).message);return}
  tools=a.data||[];repairs=b.data||[];loans=c.data||[];assists=d.data||[];toolTypes=e.data||[];
  updateStats();render();
}
function updateStats(){
  const activeTools=tools.filter(x=>x.ativo!==false);
  $("statTotal").textContent=activeTools.length;
  $("statAvailable").textContent=activeTools.filter(x=>x.status==="disponivel").length;
  $("statRepair").textContent=activeTools.filter(x=>x.status==="em_conserto").length;
  $("statLoan").textContent=activeTools.filter(x=>x.status==="emprestada").length;
}
function setTabFilter(){
  const select=$("statusFilter");
  if(!select)return;
  const value=select.value;
  if(currentTab==="repairs"){
    select.innerHTML=`<option value="current">Somente em assistência</option><option value="all">Mostrar todos</option>`;
    select.value=(value==="all"||value==="current")?value:"current";
  }else if(currentTab==="loans"){
    select.innerHTML=`<option value="current">Somente emprestadas</option><option value="all">Mostrar todos</option>`;
    select.value=(value==="all"||value==="current")?value:"current";
  }else{
    select.innerHTML=`<option value="all">Ferramentas ativas</option><option value="disponivel">Disponíveis</option><option value="em_conserto">Em assistência</option><option value="emprestada">Emprestadas</option><option value="baixada">Inservíveis</option>`;
    select.value=(["all","disponivel","em_conserto","emprestada","baixada"].includes(value))?value:"all";
  }
}
function render(){
  setTabFilter();
  if(currentTab==="tools")renderTools(); else if(currentTab==="repairs")renderRepairs(); else renderLoans();
}
function renderTools(){
  const q=$("search").value.trim().toLowerCase(), f=$("statusFilter").value;
  const onlyInserviveis=f==="baixada";
  const rows=tools.filter(t=>{
    const visibilityOk=onlyInserviveis ? t.ativo===false : t.ativo!==false;
    const statusOk=onlyInserviveis ? true : (f==="all"||t.status===f);
    const searchOk=!q||[t.codigo,t.tipo,t.marca,t.modelo,t.apelido].some(v=>String(v||"").toLowerCase().includes(q));
    return visibilityOk&&statusOk&&searchOk;
  });
  const heading=onlyInserviveis
    ? "Ferramentas inservíveis — somente visualização"
    : "Ferramentas ativas";
  const note=onlyInserviveis
    ? `<div class="notice" style="margin-bottom:14px">As ferramentas inservíveis são mantidas apenas para consulta histórica. Nenhum cadastro, conserto, empréstimo ou exclusão pode ser alterado nesta visão.</div>`
    : "";
  $("toolsPanel").innerHTML=note+(rows.length?`<div class="section-caption"><strong>${heading}</strong><span>${rows.length} registro${rows.length===1?"":"s"}</span></div><div class="tool-grid">${rows.map(t=>toolCard(t,onlyInserviveis)).join("")}</div>`:`<div class="empty">${onlyInserviveis?"Nenhuma ferramenta inservível registrada.":"Nenhuma ferramenta encontrada."}</div>`);
  $("toolsPanel").querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>openTool(tools.find(t=>t.id===b.dataset.edit)));
  $("toolsPanel").querySelectorAll("[data-repair]").forEach(b=>b.onclick=()=>openRepair(null,b.dataset.repair));
  $("toolsPanel").querySelectorAll("[data-loan]").forEach(b=>b.onclick=()=>openLoan(null,b.dataset.loan));
  $("toolsPanel").querySelectorAll("[data-history]").forEach(b=>b.onclick=()=>showToolHistory(b.dataset.history));
  $("toolsPanel").querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>deactivateTool(tools.find(t=>t.id===b.dataset.delete)));
}
function toolCard(t, readOnly=false){
  const [label,color]=statusMap[t.status]||[t.status,""];
  const actions=readOnly
    ? `<div class="card-actions"><button class="btn secondary" data-history="${t.id}">Histórico</button></div>`
    : isAdmin()
      ? `<div class="card-actions"><button class="btn secondary" data-edit="${t.id}">Editar</button><button class="btn secondary" data-repair="${t.id}">🛠️ Conserto</button><button class="btn secondary" data-loan="${t.id}">🚚 Empréstimo</button><button class="btn secondary" data-history="${t.id}">Histórico</button><button class="btn danger" data-delete="${t.id}">Inservível</button></div>`
      : `<div class="card-actions"><button class="btn secondary" data-history="${t.id}">Histórico</button></div>`;
  return `<article class="card"><div class="card-head"><span class="code">${esc(t.codigo)}</span><span class="chip ${color}">${esc(label)}</span></div><div class="title">${esc(toolName(t))}</div><div class="chips">${t.data_aquisicao?`<span class="chip">Aquisição ${dateBR(t.data_aquisicao)}</span>`:""}${t.em_garantia?`<span class="chip green">Garantia até ${dateBR(t.garantia_ate)}</span>`:""}${t.numero_serie?`<span class="chip">Série ${esc(t.numero_serie)}</span>`:""}</div>${t.observacoes?`<p class="muted">${esc(t.observacoes)}</p>`:""}${actions}</article>`;
}
function historyDate(v){
  if(!v) return "—";
  return new Date(v).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});
}
function historyFieldLabel(k){
  return ({
    tipo:"Tipo",marca:"Marca",modelo:"Modelo",apelido:"Apelido",numero_serie:"Número de série",
    data_aquisicao:"Data de aquisição",em_garantia:"Em garantia",garantia_ate:"Garantia até",
    observacoes:"Observações",status:"Status",ativo:"Ativa",data_envio:"Data do envio",
    assistencia_id:"Assistência",status_orcamento:"Status do orçamento",prazo_conserto:"Prazo para conserto",
    data_retorno:"Data de retorno",problema_relatado:"Problema relatado",canteiro:"Canteiro",
    responsavel:"Responsável",data_saida:"Data de saída",previsao_retorno:"Previsão de retorno"
  })[k]||k;
}
function historyValue(k,v){
  if(v===null||v===undefined||v==="") return "não informado";
  if(["data_aquisicao","garantia_ate","data_envio","prazo_conserto","data_retorno","data_saida","previsao_retorno"].includes(k)) return dateBR(v);
  if(k==="em_garantia"||k==="ativo") return v?"Sim":"Não";
  if(k==="status") return statusMap[v]?.[0]||repairStatus[v]||loanStatus[v]||v;
  if(k==="status_orcamento") return budgetStatus[v]||v;
  return String(v);
}
function historyDiff(oldData,newData,ignore=[]){
  const keys=[...new Set([...Object.keys(oldData||{}),...Object.keys(newData||{})])].filter(k=>!ignore.includes(k)&&!["id","created_at","updated_at","created_by","updated_by"].includes(k));
  return keys.filter(k=>JSON.stringify(oldData?.[k])!==JSON.stringify(newData?.[k]))
    .map(k=>`<div><strong>${esc(historyFieldLabel(k))}:</strong> ${esc(historyValue(k,oldData?.[k]))} → ${esc(historyValue(k,newData?.[k]))}</div>`).join("");
}
function toolSnapshotHtml(t){
  if(!t) return "";
  return `<div class="history-snapshot"><strong>${esc(toolName(t))}</strong><div class="history-mini-grid">
    <span><b>Tipo:</b> ${esc(t.tipo||"—")}</span>
    <span><b>Marca:</b> ${esc(t.marca||"—")}</span>
    <span><b>Modelo:</b> ${esc(t.modelo||"—")}</span>
    <span><b>Série:</b> ${esc(t.numero_serie||"—")}</span>
    <span><b>Aquisição:</b> ${dateBR(t.data_aquisicao)}</span>
    <span><b>Garantia:</b> ${t.em_garantia?(t.garantia_ate?`até ${dateBR(t.garantia_ate)}`:"Sim, sem data"):"Não"}</span>
  </div></div>`;
}
async function showToolHistory(id){
  const [toolRes,toolHistRes,repairRes,loanRes]=await Promise.all([
    sb.from("ferramentas").select("*").eq("id",id).maybeSingle(),
    sb.from("ferramentas_historico").select("*").eq("equipamento_id",id).order("created_at",{ascending:true}),
    sb.from("ferramentas_consertos").select("*, assistencias_tecnicas(nome)").eq("equipamento_id",id).order("created_at",{ascending:true}),
    sb.from("ferramentas_emprestimos").select("*").eq("equipamento_id",id).order("created_at",{ascending:true})
  ]);
  const error=toolRes.error||toolHistRes.error||repairRes.error||loanRes.error;
  if(error){showError(error.message);return}
  const t=toolRes.data||tools.find(x=>x.id===id);
  const events=[];
  (toolHistRes.data||[]).forEach(h=>{
    if(h.acao==="INSERT"){
      const n=h.dados_novos||{};
      events.push({date:h.created_at,type:"cadastro",icon:"🟢",title:"Ferramenta cadastrada",
        body:`${toolSnapshotHtml(n)}${n.observacoes?`<p>${esc(n.observacoes)}</p>`:""}`});
    }else if(h.acao==="UPDATE"){
      const diff=historyDiff(h.dados_anteriores,h.dados_novos);
      if(diff) events.push({date:h.created_at,type:"alteracao",icon:"⚫",title:"Cadastro atualizado",body:`<div class="history-changes">${diff}</div>`});
    }else if(h.acao==="DELETE"){
      events.push({date:h.created_at,type:"baixa",icon:"🔴",title:"Ferramenta marcada como inservível",body:"A ferramenta foi retirada do uso. O cadastro e todo o histórico foram preservados para consulta."});
    }
  });
  const assistById={};
  (repairRes.data||[]).forEach(r=>{
    assistById[r.assistencia_id]=r.assistencias_tecnicas?.nome||"Assistência não informada";
  });
  const repairHist=await Promise.all((repairRes.data||[]).map(r=>sb.from("ferramentas_conserto_historico").select("*").eq("conserto_id",r.id).order("created_at",{ascending:true})));
  (repairRes.data||[]).forEach((r,idx)=>{
    const hs=repairHist[idx].data||[];
    hs.forEach(h=>{
      if(h.acao==="INSERT"){
        events.push({date:h.created_at,type:"assistencia",icon:"🛠️",title:"Enviada para assistência",body:
          `<div class="history-detail"><b>Assistência:</b> ${esc(r.assistencias_tecnicas?.nome||"Não informada")}<br>
          <b>Problema:</b> ${esc(r.problema_relatado||"—")}<br>
          <b>Orçamento:</b> ${esc(budgetStatus[r.status_orcamento]||r.status_orcamento||"—")}<br>
          <b>Status:</b> ${esc(repairStatus[r.status]||r.status||"—")}<br>
          <b>Prazo:</b> ${r.prazo_conserto?dateBR(r.prazo_conserto):"não definido"}${r.data_retorno?`<br><b>Retorno:</b> ${dateBR(r.data_retorno)}`:""}
          ${r.observacoes?`<br><b>Observações:</b> ${esc(r.observacoes)}`:""}</div>`});
      }else if(h.acao==="UPDATE"){
        const diff=historyDiff(h.dados_anteriores,h.dados_novos);
        if(diff) events.push({date:h.created_at,type:"assistencia",icon:"🛠️",title:"Conserto atualizado",body:`<div class="history-changes">${diff}</div>`});
      }else if(h.acao==="DELETE"){
        events.push({date:h.created_at,type:"alteracao",icon:"⚫",title:"Registro de assistência removido",body:"O registro foi removido do controle da assistência."});
      }
    });
  });
  const loanHist=await Promise.all((loanRes.data||[]).map(r=>sb.from("ferramentas_emprestimo_historico").select("*").eq("emprestimo_id",r.id).order("created_at",{ascending:true})));
  (loanRes.data||[]).forEach((r,idx)=>{
    const hs=loanHist[idx].data||[];
    hs.forEach(h=>{
      if(h.acao==="INSERT"){
        events.push({date:h.created_at,type:"emprestimo",icon:"🚚",title:"Enviada para canteiro",body:
          `<div class="history-detail"><b>Canteiro:</b> ${esc(r.canteiro)}<br><b>Responsável:</b> ${esc(r.responsavel)}<br>
          <b>Saída:</b> ${dateBR(r.data_saida)}<br><b>Retorno previsto:</b> ${r.previsao_retorno?dateBR(r.previsao_retorno):"não definido"}<br>
          <b>Status:</b> ${esc(loanStatus[r.status]||r.status||"—")}${r.data_retorno?`<br><b>Devolução:</b> ${dateBR(r.data_retorno)}`:""}
          ${r.observacoes?`<br><b>Observações:</b> ${esc(r.observacoes)}`:""}</div>`});
      }else if(h.acao==="UPDATE"){
        const diff=historyDiff(h.dados_anteriores,h.dados_novos);
        if(diff) events.push({date:h.created_at,type:"emprestimo",icon:"🚚",title:"Empréstimo atualizado",body:`<div class="history-changes">${diff}</div>`});
      }else if(h.acao==="DELETE"){
        events.push({date:h.created_at,type:"alteracao",icon:"⚫",title:"Registro de empréstimo removido",body:"O registro foi removido do controle de empréstimos."});
      }
    });
  });
  events.sort((a,b)=>new Date(a.date)-new Date(b.date));
  const currentStatus=statusMap[t?.status]?.[0]||"—";
  const repairCount=(repairRes.data||[]).length, loanCount=(loanRes.data||[]).length;
  const content=`<div class="life-history">
    <div class="history-summary">${toolSnapshotHtml(t)}
      <div class="history-counters"><span><b>${repairCount}</b> assistência${repairCount===1?"":"s"}</span><span><b>${loanCount}</b> empréstimo${loanCount===1?"":"s"}</span><span><b>${esc(currentStatus)}</b> status atual</span></div>
    </div>
    <div class="history-timeline">${events.length?events.map(ev=>`<article class="timeline-event ${ev.type}"><div class="timeline-marker">${ev.icon}</div><div class="timeline-content"><div class="timeline-date">${historyDate(ev.date)}</div><h3>${esc(ev.title)}</h3>${ev.body}</div></article>`).join(""):`<div class="empty">Nenhum acontecimento registrado para esta ferramenta.</div>`}</div>
  </div>`;
  openModal("VIDA DA FERRAMENTA",`${t?.codigo||"Ferramenta"}`,content);
}
function renderRepairs(){
  const q=$("search").value.trim().toLowerCase(), f=$("statusFilter").value;
  const openStatuses=["enviado","aguardando_orcamento","orcamento_aprovado","em_conserto","pronto"];
  const rows=repairs.filter(r=>{
    const isCurrent=openStatuses.includes(r.status);
    const statusOk=f==="all"||f==="current"&&isCurrent;
    const searchOk=!q||[r.ferramentas?.codigo,r.ferramentas?.tipo,r.ferramentas?.apelido,r.assistencias_tecnicas?.nome,r.problema_relatado].some(v=>String(v||"").toLowerCase().includes(q));
    return statusOk&&searchOk;
  });
  const heading=f==="all"?"Histórico completo de assistências":"Ferramentas atualmente em assistência";
  $("repairsPanel").innerHTML=`<div class="section-caption"><strong>${heading}</strong><span>${rows.length} registro${rows.length===1?"":"s"}</span></div><div class="record-list">${rows.length?rows.map(r=>`<article class="record"><div><span class="chip ${openStatuses.includes(r.status)?"orange":"green"}">${esc(repairStatus[r.status]||r.status)}</span><h3>${esc(r.codigo||"CON-—")} • ${esc(toolName(r.ferramentas))}</h3><div class="muted">${esc(r.assistencias_tecnicas?.nome||"Assistência não informada")} • envio ${dateBR(r.data_envio)}</div><p>${esc(r.problema_relatado)}</p><div class="chips"><span class="chip">${esc(budgetStatus[r.status_orcamento]||r.status_orcamento)}</span>${r.prazo_conserto?`<span class="chip blue">Prazo ${dateBR(r.prazo_conserto)}</span>`:`<span class="chip orange">Prazo não definido</span>`}${r.data_retorno?`<span class="chip green">Retorno ${dateBR(r.data_retorno)}</span>`:""}</div></div><div class="record-right">${isAdmin()?`<button class="btn secondary" data-edit-repair="${r.id}">Editar</button>`:""}<button class="btn secondary" data-history-repair="${r.id}">Histórico</button></div></article>`).join(""):`<div class="empty">${f==="current"?"Nenhuma ferramenta está atualmente em assistência.":"Nenhum envio para assistência registrado."}</div>`}</div>`;
  $("repairsPanel").querySelectorAll("[data-edit-repair]").forEach(b=>b.onclick=()=>openRepair(repairs.find(x=>x.id===b.dataset.editRepair)));
  $("repairsPanel").querySelectorAll("[data-history-repair]").forEach(b=>b.onclick=()=>showRepairHistory(b.dataset.historyRepair));
}
function renderLoans(){
  const q=$("search").value.trim().toLowerCase(), f=$("statusFilter").value;
  const rows=loans.filter(r=>{
    const isCurrent=r.status==="emprestada";
    const statusOk=f==="all"||f==="current"&&isCurrent;
    const searchOk=!q||[r.ferramentas?.codigo,r.ferramentas?.tipo,r.ferramentas?.apelido,r.canteiro,r.responsavel].some(v=>String(v||"").toLowerCase().includes(q));
    return statusOk&&searchOk;
  });
  const heading=f==="all"?"Histórico completo de empréstimos":"Ferramentas atualmente emprestadas";
  $("loansPanel").innerHTML=`<div class="section-caption"><strong>${heading}</strong><span>${rows.length} registro${rows.length===1?"":"s"}</span></div><div class="record-list">${rows.length?rows.map(r=>`<article class="record"><div><span class="chip ${r.status==="emprestada"?"blue":"green"}">${esc(loanStatus[r.status]||r.status)}</span><h3>${esc(r.codigo||"EMP-—")} • ${esc(toolName(r.ferramentas))}</h3><div class="muted">${esc(r.canteiro)} • responsável: ${esc(r.responsavel)}</div><div class="chips"><span class="chip">Saída ${dateBR(r.data_saida)}</span>${r.previsao_retorno?`<span class="chip orange">Retorno previsto ${dateBR(r.previsao_retorno)}</span>`:`<span class="chip orange">Retorno não definido</span>`}${r.data_retorno?`<span class="chip green">Devolvida ${dateBR(r.data_retorno)}</span>`:""}</div></div><div class="record-right">${isAdmin()?`<button class="btn secondary" data-edit-loan="${r.id}">Editar</button>`:""}<button class="btn secondary" data-history-loan="${r.id}">Histórico</button></div></article>`).join(""):`<div class="empty">${f==="current"?"Nenhuma ferramenta está atualmente emprestada.":"Nenhum empréstimo registrado."}</div>`}</div>`;
  $("loansPanel").querySelectorAll("[data-edit-loan]").forEach(b=>b.onclick=()=>openLoan(loans.find(x=>x.id===b.dataset.editLoan)));
  $("loansPanel").querySelectorAll("[data-history-loan]").forEach(b=>b.onclick=()=>showLoanHistory(b.dataset.historyLoan));
}
function openModal(eyebrow,title,body){$("modalEyebrow").textContent=eyebrow;$("modalTitle").textContent=title;$("modalBody").innerHTML=body;$("modal").classList.remove("hidden")}
function closeModal(){$("modal").classList.add("hidden");$("modalBody").innerHTML=""}
function toolName(t){
  if(!t) return "Ferramenta";
  const brandModel=[t.marca,t.modelo].filter(Boolean).join(" - ");
  return [t.codigo,t.tipo,brandModel,t.apelido].filter(Boolean).join(" | ");
}
function typeOptions(selected=""){
  return toolTypes.map(t=>`<option value="${esc(t.nome)}" ${t.nome===selected?"selected":""}>${esc(t.nome)}</option>`).join("");
}
function toolOptions(selected=""){
  return tools.filter(t=>(t.ativo!==false && t.status!=="baixada") || t.id===selected)
    .map(t=>`<option value="${t.id}" ${t.id===selected?"selected":""}>${esc(toolName(t))}</option>`).join("");
}
function assistOptions(selected=""){return assists.filter(a=>a.ativo||a.id===selected).map(a=>`<option value="${a.id}" ${a.id===selected?"selected":""}>${esc(a.nome)}</option>`).join("")}

function openTool(t=null){
  if(!isAdmin())return;
  editing=t;
  openModal("CADASTRO DE FERRAMENTA",t?"Editar ferramenta":"Nova ferramenta",`<form id="toolForm" class="form"><div class="notice">O código único será gerado automaticamente pelo sistema.</div><div class="form-grid">
  <div class="field"><label>Tipo de ferramenta *</label><div style="display:flex;gap:7px;align-items:stretch"><select name="tipo" id="toolTypeSelect" required style="flex:1"><option value="">Selecione</option>${typeOptions(t?.tipo)}</select><button type="button" class="btn secondary" id="newTypeInlineBtn" title="Cadastrar novo tipo" aria-label="Cadastrar novo tipo">＋</button></div><small class="muted">Cadastre um novo tipo pelo botão +.</small></div>
  <div class="field"><label>Apelido</label><input name="apelido" value="${esc(t?.apelido)}" placeholder="Ex.: Parafusadeira azul"></div>
  <div class="field"><label>Marca</label><input name="marca" value="${esc(t?.marca)}"></div>
  <div class="field"><label>Modelo</label><input name="modelo" value="${esc(t?.modelo)}"></div>
  <div class="field"><label>Data de aquisição</label><input name="data_aquisicao" type="date" value="${t?.data_aquisicao||""}"></div>
  <div class="field"><label>Número de série</label><input name="numero_serie" value="${esc(t?.numero_serie)}"></div>
  <div class="field"><label>Está na garantia?</label><select name="em_garantia" id="emGarantia"><option value="false" ${!t?.em_garantia?"selected":""}>Não</option><option value="true" ${t?.em_garantia?"selected":""}>Sim</option></select></div>
  <div class="field" id="garantiaAteField" ${t?.em_garantia ? "" : 'style="display:none;"'}><label>Garantia até</label><input name="garantia_ate" id="garantiaAte" type="date" value="${t?.garantia_ate||""}"></div>
  <div class="field"><label>Status</label><select name="status"><option value="disponivel" ${t?.status==="disponivel"?"selected":""}>Disponível</option><option value="em_conserto" ${t?.status==="em_conserto"?"selected":""}>Em assistência</option><option value="emprestada" ${t?.status==="emprestada"?"selected":""}>Emprestada</option></select></div>
  <div class="field full"><label>Observações</label><textarea name="observacoes">${esc(t?.observacoes)}</textarea></div>
  </div><div class="form-actions"><button type="button" class="btn secondary" id="cancelForm">Cancelar</button>${t?`<button type="button" class="btn danger" id="deleteToolBtn">Excluir ferramenta</button>`:""}<button class="btn primary">Salvar ferramenta</button></div></form>`);
  $("cancelForm").onclick=closeModal;
  const garantiaSelect=$("emGarantia"), garantiaField=$("garantiaAteField"), garantiaInput=$("garantiaAte");
  garantiaSelect?.addEventListener("change",()=>{
    const ativa=garantiaSelect.value==="true";
    garantiaField.style.display=ativa?"":"none";
    garantiaInput.disabled=!ativa;
    if(!ativa) garantiaInput.value="";
  });
  if(garantiaSelect?.value!=="true" && garantiaInput){
    garantiaInput.value="";
    garantiaInput.disabled=true;
  }
  $("toolForm").onsubmit=saveTool;
  $("newTypeInlineBtn").onclick=openQuickType;
  $("manageTypesBtn")?.addEventListener("click",openTypeManager);
  $("closeTypeManager")?.addEventListener("click",closeTypeManager);
  $("newTypeFromManager")?.addEventListener("click",()=>{closeTypeManager();openQuickType()});
  $("typeManagerModal")?.addEventListener("click",e=>{if(e.target.id==="typeManagerModal")closeTypeManager()});
  $("deleteToolBtn")?.addEventListener("click",()=>deactivateTool(t));
}
async function saveTool(e){
  e.preventDefault();
  const fd=new FormData(e.target), payload=Object.fromEntries(fd.entries());
  payload.em_garantia=payload.em_garantia==="true";

  // Datas são opcionais: o PostgreSQL deve receber NULL, nunca uma string vazia.
  if(!payload.data_aquisicao) payload.data_aquisicao=null;
  if(!payload.em_garantia) payload.garantia_ate=null;
  else if(!payload.garantia_ate) payload.garantia_ate=null;

  const {data:{user}}=await sb.auth.getUser(); payload.updated_by=user?.id||null;
  let res;
  if(editing){res=await sb.from("ferramentas").update(payload).eq("id",editing.id)} else {payload.created_by=user?.id||null;res=await sb.from("ferramentas").insert(payload)}
  if(res.error){alert(res.error.message);return} closeModal();await loadAll();
}
function closeTypeModal(){
  $("typeModal")?.classList.add("hidden");
  editingType=null;
  const form=$("typeQuickForm");
  if(form) form.reset();
  const title=$("typeModalTitle");
  const button=$("typeSubmitBtn");
  if(title) title.textContent="Cadastrar tipo de ferramenta";
  if(button) button.textContent="Cadastrar tipo";
}
function openQuickType(){
  if(!isAdmin()) return;
  editingType=null;
  $("typeQuickForm").reset();
  $("typeModalTitle").textContent="Cadastrar tipo de ferramenta";
  $("typeSubmitBtn").textContent="Cadastrar tipo";
  $("typeModal").classList.remove("hidden");
  setTimeout(()=>$("typeQuickForm")?.querySelector("[name=nome]")?.focus(),50);
}
function openTypeManager(){
  if(!isAdmin()) return;
  renderTypeManager();
  $("typeManagerModal")?.classList.remove("hidden");
}
function closeTypeManager(){
  $("typeManagerModal")?.classList.add("hidden");
}
function renderTypeManager(){
  const panel=$("typeManagerList");
  if(!panel) return;
  if(!toolTypes.length){
    panel.innerHTML='<div class="empty">Nenhum tipo de ferramenta cadastrado.</div>';
    return;
  }
  panel.innerHTML=toolTypes.map(t=>`
    <div class="record">
      <div>
        <span class="eyebrow">TIPO DE FERRAMENTA</span>
        <h3>${esc(t.nome)}</h3>
        ${t.observacoes?`<div class="muted">${esc(t.observacoes)}</div>`:""}
      </div>
      <div class="record-right" style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
        <button type="button" class="btn secondary" data-edit-type="${esc(t.id)}">Editar</button>
        <button type="button" class="btn danger" data-delete-type="${esc(t.id)}">Excluir</button>
      </div>
    </div>
  `).join("");
  panel.querySelectorAll("[data-edit-type]").forEach(b=>{
    b.onclick=()=>editToolType(toolTypes.find(t=>String(t.id)===String(b.dataset.editType)));
  });
  panel.querySelectorAll("[data-delete-type]").forEach(b=>{
    b.onclick=()=>deleteToolType(toolTypes.find(t=>String(t.id)===String(b.dataset.deleteType)));
  });
}
function editToolType(t){
  if(!isAdmin()||!t)return;
  editingType=t;
  $("typeQuickForm").reset();
  $("typeQuickForm").querySelector('[name="nome"]').value=t.nome||"";
  $("typeQuickForm").querySelector('[name="observacoes"]').value=t.observacoes||"";
  $("typeModalTitle").textContent="Editar tipo de ferramenta";
  $("typeSubmitBtn").textContent="Salvar alterações";
  closeTypeManager();
  $("typeModal").classList.remove("hidden");
  setTimeout(()=>$("typeQuickForm")?.querySelector("[name=nome]")?.focus(),50);
}
async function saveQuickType(e){
  e.preventDefault();
  if(!isAdmin()) return;
  const p=Object.fromEntries(new FormData(e.target).entries());
  p.nome=String(p.nome||"").trim();
  p.observacoes=String(p.observacoes||"").trim()||null;
  if(!p.nome){ alert("Informe o tipo de ferramenta."); return; }

  const {data:{user}}=await sb.auth.getUser();

  if(editingType){
    const oldName=editingType.nome;
    if(p.nome===oldName && p.observacoes===(editingType.observacoes||null)){
      closeTypeModal();
      return;
    }

    // Evita duplicidade antes de alterar o tipo.
    const duplicate=toolTypes.find(t=>String(t.id)!==String(editingType.id) &&
      String(t.nome||"").trim().toLocaleLowerCase("pt-BR")===p.nome.toLocaleLowerCase("pt-BR"));
    if(duplicate){
      alert("TIPO DE FERRAMENTA JÁ CADASTRADA");
      return;
    }

    // Se o nome mudou, atualiza também as ferramentas que usam esse tipo.
    // Assim nenhuma ferramenta fica apontando para um nome antigo.
    if(p.nome!==oldName){
      const {error:toolsError}=await sb.from("ferramentas")
        .update({tipo:p.nome,updated_by:user?.id||null})
        .eq("tipo",oldName);
      if(toolsError){
        alert(toolsError.message);
        return;
      }
    }

    const {data,error}=await sb.from("tipos_ferramentas")
      .update({nome:p.nome,observacoes:p.observacoes,updated_by:user?.id||null})
      .eq("id",editingType.id)
      .select("*")
      .single();

    if(error){
      // Tenta restaurar as ferramentas caso a alteração do cadastro do tipo falhe.
      if(p.nome!==oldName){
        await sb.from("ferramentas")
          .update({tipo:oldName,updated_by:user?.id||null})
          .eq("tipo",p.nome);
      }
      if(error.code==="23505" || String(error.message||"").includes("tipos_ferramentas_nome_key")){
        alert("TIPO DE FERRAMENTA JÁ CADASTRADA");
      }else{
        alert(error.message);
      }
      return;
    }

    toolTypes=toolTypes.map(t=>String(t.id)===String(data.id)?data:t)
      .sort((a,b)=>String(a.nome).localeCompare(String(b.nome)));
    closeTypeModal();
    await loadAll();
    return;
  }

  p.created_by=user?.id||null;
  p.updated_by=user?.id||null;
  p.ativo=true;
  const {data,error}=await sb.from("tipos_ferramentas").insert(p).select("*").single();
  if(error){
    if(
      error.code === "23505" ||
      String(error.message || "").includes("tipos_ferramentas_nome_key")
    ){
      alert("TIPO DE FERRAMENTA JÁ CADASTRADA");
    }else{
      alert(error.message);
    }
    return;
  }
  toolTypes=[...toolTypes,data].sort((a,b)=>String(a.nome).localeCompare(String(b.nome)));
  closeTypeModal();
  const select=$("toolTypeSelect");
  if(select){
    select.innerHTML='<option value="">Selecione</option>'+typeOptions(data.nome);
    select.value=data.nome;
  }
}
async function deleteToolType(t){
  if(!isAdmin()||!t)return;
  const {data:usedTools,error:checkError}=await sb.from("ferramentas")
    .select("id,codigo")
    .eq("tipo",t.nome);
  if(checkError){alert(checkError.message);return;}
  if((usedTools||[]).length){
    alert(`NÃO É POSSÍVEL EXCLUIR ESTE TIPO DE FERRAMENTA.\n\nExistem ${usedTools.length} ferramenta(s) usando o tipo "${t.nome}".\n\nAltere o tipo dessas ferramentas antes de excluir o cadastro.`);
    return;
  }
  if(!confirm(`Excluir o tipo de ferramenta "${t.nome}"?\n\nEsta ação não pode ser desfeita.`)) return;
  const {error}=await sb.from("tipos_ferramentas").delete().eq("id",t.id);
  if(error){
    if(error.code==="23503"){
      alert("NÃO É POSSÍVEL EXCLUIR ESTE TIPO DE FERRAMENTA PORQUE ELE ESTÁ SENDO UTILIZADO.");
    }else{
      alert(error.message);
    }
    return;
  }
  toolTypes=toolTypes.filter(x=>String(x.id)!==String(t.id));
  renderTypeManager();
  await loadAll();
}
async function deactivateTool(t){
  if(!isAdmin()||!t?.id)return;
  if(!confirm(`Marcar a ferramenta ${toolName(t)} como INSERVÍVEL?\n\nEla não será apagada do banco. Ficará inativa, sairá das ferramentas ativas e poderá ser consultada somente na opção "Inservíveis".`)) return;
  const {data:{user}}=await sb.auth.getUser();
  const {error}=await sb.from("ferramentas").update({ativo:false,status:"baixada",updated_by:user?.id||null}).eq("id",t.id);
  if(error){alert(error.message);return}
  closeModal(); await loadAll();
}
function closeAssistModal(){ $("assistModal")?.classList.add("hidden"); }
function openQuickAssist(){
  if(!isAdmin()) return;
  $("assistQuickForm").reset();
  $("assistModal").classList.remove("hidden");
  setTimeout(()=>$("assistQuickForm")?.querySelector("[name=nome]")?.focus(),50);
}
function openRepair(r=null, toolId=""){
  if(!isAdmin())return;
  editing=r;
  openModal("ASSISTÊNCIA TÉCNICA",r?"Editar envio para assistência":"Registrar equipamento para conserto",`<form id="repairForm" class="form"><div class="form-grid">
  <div class="field full"><label>Equipamento *</label><select name="equipamento_id" required><option value="">Selecione</option>${toolOptions(r?.equipamento_id||toolId)}</select></div>
  <div class="field"><label>Data do envio *</label><input name="data_envio" type="date" required value="${r?.data_envio||today()}"></div>
  <div class="field"><label>Assistência técnica *</label><div style="display:flex;gap:7px;align-items:stretch"><select name="assistencia_id" id="repairAssistencia" required style="flex:1"><option value="">Selecione</option>${assistOptions(r?.assistencia_id)}</select><button type="button" class="btn secondary" id="newAssistInlineBtn" title="Cadastrar nova assistência" aria-label="Cadastrar nova assistência">＋</button></div><small class="muted">Não encontrou a assistência? Clique em + para cadastrar.</small></div>
  <div class="field"><label>Status do orçamento</label><select name="status_orcamento">${Object.entries(budgetStatus).map(([v,l])=>`<option value="${v}" ${r?.status_orcamento===v?"selected":""}>${l}</option>`).join("")}</select></div>
  <div class="field"><label>Status do conserto</label><select name="status">${Object.entries(repairStatus).map(([v,l])=>`<option value="${v}" ${r?.status===v?"selected":""}>${l}</option>`).join("")}</select></div>
  <div class="field"><label>Prazo para conserto <span class="muted">(opcional)</span></label><input name="prazo_conserto" type="date" value="${r?.prazo_conserto||""}"></div>
  <div class="field"><label>Data de retorno <span class="muted">(opcional)</span></label><input name="data_retorno" type="date" value="${r?.data_retorno||""}"></div>
  <div class="field full"><label>Problema relatado *</label><textarea name="problema_relatado" required>${esc(r?.problema_relatado)}</textarea></div>
  <div class="field full"><label>Observações</label><textarea name="observacoes">${esc(r?.observacoes)}</textarea></div>
  </div><div class="form-actions"><button type="button" class="btn secondary" id="cancelForm">Cancelar</button><button class="btn primary">Salvar registro</button></div></form>`);
  $("cancelForm").onclick=closeModal;$("repairForm").onsubmit=saveRepair;
  $("newAssistInlineBtn").onclick=openQuickAssist;
}
async function saveRepair(e){
  e.preventDefault();const fd=new FormData(e.target),p=Object.fromEntries(fd.entries());["prazo_conserto","data_retorno"].forEach(k=>{if(!p[k])p[k]=null});
  const {data:{user}}=await sb.auth.getUser();p.updated_by=user?.id||null;
  let res;if(editing)res=await sb.from("ferramentas_consertos").update(p).eq("id",editing.id);else{p.created_by=user?.id||null;res=await sb.from("ferramentas_consertos").insert(p)}
  if(res.error){alert(res.error.message);return}closeModal();await loadAll();
}
function openLoan(r=null,toolId=""){
  if(!isAdmin())return;editing=r;
  openModal("EMPRÉSTIMO PARA CANTEIRO",r?"Editar empréstimo":"Registrar empréstimo",`<form id="loanForm" class="form"><div class="form-grid">
  <div class="field full"><label>Equipamento *</label><select name="equipamento_id" required><option value="">Selecione</option>${toolOptions(r?.equipamento_id||toolId)}</select></div>
  <div class="field"><label>Data de saída *</label><input name="data_saida" type="date" required value="${r?.data_saida||today()}"></div>
  <div class="field"><label>Canteiro de obras *</label><input name="canteiro" required value="${esc(r?.canteiro)}"></div>
  <div class="field"><label>Responsável *</label><input name="responsavel" required value="${esc(r?.responsavel)}"></div>
  <div class="field"><label>Previsão de retorno</label><input name="previsao_retorno" type="date" value="${r?.previsao_retorno||""}"></div>
  <div class="field"><label>Data de retorno</label><input name="data_retorno" type="date" value="${r?.data_retorno||""}"></div>
  <div class="field"><label>Status</label><select name="status">${Object.entries(loanStatus).map(([v,l])=>`<option value="${v}" ${r?.status===v?"selected":""}>${l}</option>`).join("")}</select></div>
  <div class="field full"><label>Observações</label><textarea name="observacoes">${esc(r?.observacoes)}</textarea></div>
  </div><div class="form-actions"><button type="button" class="btn secondary" id="cancelForm">Cancelar</button><button class="btn primary">Salvar empréstimo</button></div></form>`);
  $("cancelForm").onclick=closeModal;$("loanForm").onsubmit=saveLoan;
}
async function saveLoan(e){
  e.preventDefault();const fd=new FormData(e.target),p=Object.fromEntries(fd.entries());["previsao_retorno","data_retorno"].forEach(k=>{if(!p[k])p[k]=null});
  const {data:{user}}=await sb.auth.getUser();p.updated_by=user?.id||null;
  let res;if(editing)res=await sb.from("ferramentas_emprestimos").update(p).eq("id",editing.id);else{p.created_by=user?.id||null;res=await sb.from("ferramentas_emprestimos").insert(p)}
  if(res.error){alert(res.error.message);return}closeModal();await loadAll();
}
function openAssist(){
  if(!isAdmin())return;
  openModal("ASSISTÊNCIAS TÉCNICAS","Cadastrar assistência técnica",`<form id="assistForm" class="form"><div class="form-grid"><div class="field full"><label>Nome *</label><input name="nome" required></div><div class="field"><label>Contato</label><input name="contato"></div><div class="field"><label>Telefone</label><input name="telefone"></div><div class="field"><label>E-mail</label><input name="email" type="email"></div><div class="field full"><label>Observações</label><textarea name="observacoes"></textarea></div></div><div class="form-actions"><button type="button" class="btn secondary" id="cancelForm">Cancelar</button><button class="btn primary">Salvar</button></div></form>`);
  $("cancelForm").onclick=closeModal;$("assistForm").onsubmit=saveAssist;
}
async function saveQuickAssist(e){
  e.preventDefault();
  const p=Object.fromEntries(new FormData(e.target).entries());
  const {data:{user}}=await sb.auth.getUser();
  p.created_by=user?.id||null;
  p.updated_by=user?.id||null;
  p.ativo=true;
  const {data,error}=await sb.from("assistencias_tecnicas").insert(p).select("*").single();
  if(error){alert(error.message);return}
  assists=[...assists,data].sort((a,b)=>String(a.nome||"").localeCompare(String(b.nome||"")));
  closeAssistModal();
  const select=$("repairAssistencia");
  if(select){
    select.innerHTML='<option value="">Selecione</option>'+assistOptions(data.id);
    select.value=data.id;
  }
}
async function saveAssist(e){
  e.preventDefault();const p=Object.fromEntries(new FormData(e.target).entries());const {data:{user}}=await sb.auth.getUser();p.created_by=user?.id||null;p.updated_by=user?.id||null;
  const {error}=await sb.from("assistencias_tecnicas").insert(p);if(error){alert(error.message);return}closeModal();await loadAll();
}
async function showRepairHistory(id){
  const {data,error}=await sb.from("ferramentas_conserto_historico").select("*").eq("conserto_id",id).order("created_at",{ascending:false});
  if(error){showError(error.message);return}openModal("HISTÓRICO","Histórico do conserto",`<div class="form">${data?.length?`<div class="history">${data.map(h=>`<div class="history-row"><strong>${esc(h.acao)}</strong> • ${new Date(h.created_at).toLocaleString("pt-BR")}<br>${esc(h.descricao||"")}</div>`).join("")}</div>`:`<div class="empty">Nenhuma alteração registrada.</div>`}</div>`);
}
async function showLoanHistory(id){
  const {data,error}=await sb.from("ferramentas_emprestimo_historico").select("*").eq("emprestimo_id",id).order("created_at",{ascending:false});
  if(error){showError(error.message);return}openModal("HISTÓRICO","Histórico do empréstimo",`<div class="form">${data?.length?`<div class="history">${data.map(h=>`<div class="history-row"><strong>${esc(h.acao)}</strong> • ${new Date(h.created_at).toLocaleString("pt-BR")}<br>${esc(h.descricao||"")}</div>`).join("")}</div>`:`<div class="empty">Nenhuma alteração registrada.</div>`}</div>`);
}
function showError(msg){$("pageError").textContent=msg;$("pageError").classList.remove("hidden")}
boot();
})();