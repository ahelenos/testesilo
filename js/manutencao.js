
let records = [];
let viewDate = new Date(); viewDate.setDate(1);
let editingId = null;

const $ = id => document.getElementById(id);
const todayISO = () => {
  const d=new Date(), z=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;
};
const fmt=s=>s?new Date(`${s}T12:00:00`).toLocaleDateString("pt-BR"):"—";
const monthName=d=>d.toLocaleDateString("pt-BR",{month:"long",year:"numeric"});
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const uid=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;
const statusLabel=s=>({planejada:"Planejada",agendada:"Agendada",em_execucao:"Em execução",aberta:"Em aberto",concluida:"Concluída",cancelada:"Cancelada"}[s]||s);

function getSupabase(){
  return window.supabaseClient || window.supabase || null;
}
async function getRole(){
  if(window.currentUserRole)return String(window.currentUserRole).toLowerCase();
  if(window.appUserRole)return String(window.appUserRole).toLowerCase();
  try{
    const sb=getSupabase();
    if(!sb)return "admin";
    const {data:{user}}=await sb.auth.getUser();
    if(!user)return "viewer";
    const {data,error}=await sb.from("profiles").select("role,perfil,user_role").eq("id",user.id).maybeSingle();
    if(error||!data)return "viewer";
    return String(data.role||data.perfil||data.user_role||"viewer").toLowerCase();
  }catch{return "viewer"}
}
function isAdmin(role){return ["admin","administrador","administrator"].includes(String(role).toLowerCase())}

async function load(){
  const sb=getSupabase();
  if(!sb){records=[];showError("Supabase não foi inicializado nesta página.");return;}
  const {data,error}=await sb.from("manutencoes").select(`
    *,
    manutencao_pecas(*),
    manutencao_terceirizados(*),
    manutencao_historico(*)
  `).order("created_at",{ascending:false});
  if(error){console.error(error);showError(`Erro ao carregar manutenções: ${error.message}`);records=[];return;}
  records=(data||[]).map(normalize);
  render();
}
function normalize(r){
  const third=(r.manutencao_terceirizados||[])[0]||{};
  return {
    ...r,id:r.id,type:r.tipo,equipment:r.equipamento,description:r.descricao,
    requestDate:r.data_solicitacao,plannedDate:r.data_prevista,occurrenceDate:r.data_ocorrencia,
    status:r.status,responsible:r.responsavel,labor:r.mao_de_obra,
    done:r.servico_realizado,notes:r.observacoes,
    parts:{enabled:r.troca_peca,items:(r.manutencao_pecas||[]),purchaseRequestDate:(r.manutencao_pecas||[])[0]?.solicitado_em||"",purchaseDueDate:(r.manutencao_pecas||[])[0]?.previsao_entrega||"",received:(r.manutencao_pecas||[]).length>0&&(r.manutencao_pecas||[]).every(x=>x.recebido),receivedDate:(r.manutencao_pecas||[]).find(x=>x.data_recebimento)?.data_recebimento||""},
    thirdParty:{enabled:!!third.id,name:third.empresa_responsavel||"",date:third.data_agendada||"",done:!!third.realizado,doneDate:third.data_execucao||""},
    history:(r.manutencao_historico||[]).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))
  };
}
function showError(msg){
  const el=$("pageError");if(el){el.textContent=msg;el.classList.remove("hidden")}
}
function dateForRecord(r){return r.type==="preventiva"?(r.requestDate||r.plannedDate):r.occurrenceDate}
function nextCommitments(){
  const out=[];
  records.forEach(r=>{
    if(r.parts?.purchaseDueDate&&!r.parts.received)out.push({kind:"🧩",label:r.parts.items?.map(x=>x.nome).filter(Boolean).join(", ")||"Peça",date:r.parts.purchaseDueDate,extra:"Previsão de entrega"});
    if(r.thirdParty?.enabled&&r.thirdParty.date&&!r.thirdParty.done)out.push({kind:"👷",label:r.thirdParty.name||"Terceirizado",date:r.thirdParty.date,extra:"Execução prevista"});
    if(r.plannedDate&&!["concluida","cancelada"].includes(r.status))out.push({kind:"🔧",label:r.description,date:r.plannedDate,extra:"Execução prevista"});
  });
  return out.sort((a,b)=>a.date.localeCompare(b.date));
}
async function render(){
  const role=await getRole();
  const now=todayISO(),open=records.filter(r=>!["concluida","cancelada"].includes(r.status)).length;
  const parts=records.filter(r=>r.parts?.purchaseDueDate&&!r.parts.received).length;
  const sched=records.filter(r=>r.thirdParty?.enabled&&r.thirdParty.date&&!r.thirdParty.done).length;
  const overdue=nextCommitments().filter(x=>x.date<now).length;
  $("openCount").textContent=open;$("partsCount").textContent=parts;$("scheduledCount").textContent=sched;$("overdueCount").textContent=overdue;
  $("monthLabel").textContent=monthName(viewDate);$("roleIndicator").textContent=isAdmin(role)?"ADMIN":"VISUALIZAÇÃO";
  $("newMaintenanceBtn").classList.toggle("hidden",!isAdmin(role));

  const cs=nextCommitments().slice(0,8);
  $("commitmentsList").innerHTML=cs.length?cs.map(x=>{
    const cls=x.date<now?"overdue":x.date===now?"today":"";
    const st=x.date<now?"Atrasado":x.date===now?"Hoje":`Em ${Math.ceil((new Date(`${x.date}T12:00:00`)-new Date(`${now}T12:00:00`))/86400000)} dia(s)`;
    return `<div class="commitment ${cls}"><div class="date">${x.kind} ${fmt(x.date)} · ${st}</div><strong>${esc(x.label)}</strong><div>${esc(x.extra)}</div></div>`;
  }).join(""):`<div class="empty">Nenhuma pendência encontrada.</div>`;

  const filter=$("typeFilter").value,q=$("searchInput").value.trim().toLowerCase(),y=viewDate.getFullYear(),m=viewDate.getMonth();
  const list=records.filter(r=>{
    const d=dateForRecord(r);if(!d)return false;const dt=new Date(`${d}T12:00:00`);
    if(dt.getFullYear()!==y||dt.getMonth()!==m)return false;
    if(["preventiva","corretiva"].includes(filter)&&r.type!==filter)return false;
    if(filter==="open"&&["concluida","cancelada"].includes(r.status))return false;
    if(filter==="completed"&&r.status!=="concluida")return false;
    return !q||JSON.stringify(r).toLowerCase().includes(q);
  }).sort((a,b)=>dateForRecord(b).localeCompare(dateForRecord(a)));
  $("maintenanceList").innerHTML=list.length?list.map(r=>card(r,role)).join(""):`<div class="empty">Nenhuma manutenção registrada neste mês com os filtros atuais.</div>`;
}
function card(r,role){
  const admin=isAdmin(role),date=dateForRecord(r);
  const intervention=[r.labor?"Mão de obra":"",r.parts?.enabled?"Troca de peça":""].filter(Boolean).join(" + ")||"Não informado";
  const events=[];
  if(r.type==="preventiva"&&r.requestDate)events.push(`Solicitação em ${fmt(r.requestDate)}`);
  if(r.type==="preventiva"&&r.plannedDate)events.push(`Execução prevista: ${fmt(r.plannedDate)}`);
  if(r.type==="corretiva"&&r.occurrenceDate)events.push(`Ocorrência em ${fmt(r.occurrenceDate)}`);
  if(r.parts?.purchaseRequestDate)events.push(`Compra solicitada em ${fmt(r.parts.purchaseRequestDate)}`);
  if(r.parts?.purchaseDueDate)events.push(`Peça: ${r.parts.received?`recebida em ${fmt(r.parts.receivedDate)}`:`entrega prevista ${fmt(r.parts.purchaseDueDate)}`}`);
  if(r.thirdParty?.enabled&&r.thirdParty.date)events.push(`Terceirizado: ${r.thirdParty.done?`realizado em ${fmt(r.thirdParty.doneDate)}`:`agendado para ${fmt(r.thirdParty.date)}`}`);
  if(r.done)events.push(`Execução registrada: ${r.done}`);
  const actions=admin?`<div class="card-actions"><button class="secondary-btn small-btn" data-edit="${esc(r.id)}">✏️ Editar</button><button class="danger-btn small-btn" data-delete="${esc(r.id)}">🗑️ Excluir</button></div>`:`<div class="viewer-note">Somente visualização</div>`;
  return `<article class="maintenance-card"><div class="maintenance-top"><div><span class="badge ${r.type}">${r.type}</span><h3>${esc(r.description)}</h3><div class="status">${statusLabel(r.status)}</div></div><div class="date-side"><strong>${fmt(date)}</strong>${actions}</div></div>
  <div class="meta"><span>⚙ ${esc(r.equipment)}</span><span>🔧 ${esc(intervention)}</span><span>👤 ${esc(r.responsible||"—")}</span></div>
  <div class="timeline">${events.map(e=>`<div class="event"><i class="event-dot"></i><div>${esc(e)}</div></div>`).join("")}</div>
  ${r.notes?`<p style="margin-top:10px"><strong>Observações:</strong> ${esc(r.notes)}</p>`:""}
  ${r.history?.length?`<details class="audit"><summary>Histórico de alterações (${r.history.length})</summary>${r.history.map(h=>`<div class="audit-item"><strong>${esc(h.acao)}</strong><small>${new Date(h.created_at).toLocaleString("pt-BR")}</small>${h.descricao?`<div>${esc(h.descricao)}</div>`:""}</div>`).join("")}</details>`:""}</article>`;
}

function toggleConditional(){
  const p=$("mType").value==="preventiva";
  $("preventiveDates").classList.toggle("hidden",!p);$("preventiveStatus").classList.toggle("hidden",!p);
  $("correctiveDate").classList.toggle("hidden",p);$("correctiveResponsible").classList.toggle("hidden",p);
}
function addPart(name="",qty=1){
  const row=document.createElement("div");row.className="part-row";
  row.innerHTML=`<input class="part-name" placeholder="Nome da peça" value="${esc(name)}"><input class="part-qty" type="number" min="1" value="${qty}"><button type="button" class="remove-part">×</button>`;
  row.querySelector(".remove-part").onclick=()=>row.remove();$("partsRows").appendChild(row);
}
function resetForm(){
  $("maintenanceForm").reset();$("partsRows").innerHTML="";addPart();$("mRequestDate").value=todayISO();$("mOccurrenceDate").value=todayISO();
  $("mType").value="preventiva";$("mStatusPreventive").value="planejada";$("mStatus").value="aberta";toggleConditional();
  $("partsSection").classList.add("hidden");$("thirdPartySection").classList.add("hidden");$("partReceivedDateWrap").classList.add("hidden");$("thirdPartyDoneDateWrap").classList.add("hidden");
}
function fillForm(r){
  resetForm();$("mType").value=r.type;$("mEquipment").value=r.equipment||"";$("mDescription").value=r.description||"";
  $("mRequestDate").value=r.requestDate||todayISO();$("mPlannedDate").value=r.plannedDate||"";$("mOccurrenceDate").value=r.occurrenceDate||todayISO();
  $("mStatusPreventive").value=r.status;$("mStatus").value=r.status;$("mResponsible").value=r.type==="preventiva"?r.responsible||"":"";$("mResponsible2").value=r.type==="corretiva"?r.responsible||"":"";
  $("mLabor").checked=!!r.labor;$("mParts").checked=!!r.parts?.enabled;$("partsRows").innerHTML="";
  (r.parts?.items?.length?r.parts.items:[{}]).forEach(x=>addPart(x.nome||"",x.quantidade||1));
  $("purchaseRequestDate").value=r.parts?.purchaseRequestDate||"";$("purchaseDueDate").value=r.parts?.purchaseDueDate||"";
  $("partReceived").checked=!!r.parts?.received;$("partReceivedDate").value=r.parts?.receivedDate||"";
  $("isThirdParty").checked=!!r.thirdParty?.enabled;$("thirdPartyName").value=r.thirdParty?.name||"";$("thirdPartyDate").value=r.thirdParty?.date||"";
  $("thirdPartyDone").value=r.thirdParty?.done?"sim":"nao";$("thirdPartyDoneDate").value=r.thirdParty?.doneDate||"";$("mDone").value=r.done||"";$("mNotes").value=r.notes||"";
  toggleConditional();$("partsSection").classList.toggle("hidden",!$("mParts").checked);$("thirdPartySection").classList.toggle("hidden",!$("isThirdParty").checked);
  $("partReceivedDateWrap").classList.toggle("hidden",!$("partReceived").checked);$("thirdPartyDoneDateWrap").classList.toggle("hidden",$("thirdPartyDone").value!=="sim");
}
async function openNew(){if(!isAdmin(await getRole()))return;editingId=null;resetForm();$("modalTitle").textContent="Nova manutenção";$("saveBtn").textContent="Salvar manutenção";$("maintenanceModal").classList.remove("hidden")}
async function openEdit(id){if(!isAdmin(await getRole()))return;const r=records.find(x=>x.id===id);if(!r)return;editingId=id;fillForm(r);$("modalTitle").textContent="Editar manutenção";$("saveBtn").textContent="Salvar alterações";$("maintenanceModal").classList.remove("hidden")}
function closeModal(){$("maintenanceModal").classList.add("hidden");editingId=null}

$("newMaintenanceBtn").onclick=openNew;$("closeModal").onclick=$("cancelModal").onclick=closeModal;$("mType").onchange=toggleConditional;
$("mParts").onchange=()=> $("partsSection").classList.toggle("hidden",!$("mParts").checked);
$("isThirdParty").onchange=()=> $("thirdPartySection").classList.toggle("hidden",!$("isThirdParty").checked);
$("partReceived").onchange=()=> $("partReceivedDateWrap").classList.toggle("hidden",!$("partReceived").checked);
$("thirdPartyDone").onchange=()=> $("thirdPartyDoneDateWrap").classList.toggle("hidden",$("thirdPartyDone").value!=="sim");
$("addPartBtn").onclick=()=>addPart();$("prevMonth").onclick=()=>{viewDate.setMonth(viewDate.getMonth()-1);render()};$("nextMonth").onclick=()=>{viewDate.setMonth(viewDate.getMonth()+1);render()};
$("typeFilter").onchange=$("searchInput").oninput=render;

$("maintenanceList").addEventListener("click",async e=>{
  const edit=e.target.closest("[data-edit]"),del=e.target.closest("[data-delete]");
  if(edit)openEdit(edit.dataset.edit);
  if(del&&isAdmin(await getRole())){
    const id=del.dataset.delete;
    if(!confirm("Excluir esta manutenção e seus registros vinculados?"))return;
    const sb=getSupabase();if(!sb)return;
    const {error}=await sb.from("manutencoes").delete().eq("id",id);
    if(error){alert("Não foi possível excluir: "+error.message);return}
    await load();
  }
});

$("maintenanceForm").onsubmit=async e=>{
  e.preventDefault();if(!isAdmin(await getRole()))return;
  const sb=getSupabase();if(!sb){alert("Supabase não está disponível.");return}
  const p=$("mType").value==="preventiva", items=[...document.querySelectorAll(".part-row")].map(r=>({name:r.querySelector(".part-name").value.trim(),qty:Number(r.querySelector(".part-qty").value||1)})).filter(x=>x.name);
  const payload={tipo:$("mType").value,equipamento:$("mEquipment").value.trim(),descricao:$("mDescription").value.trim(),data_solicitacao:p?$("mRequestDate").value||null:null,data_prevista:p?$("mPlannedDate").value||null:null,data_ocorrencia:p?null:$("mOccurrenceDate").value||null,status:p?$("mStatusPreventive").value:$("mStatus").value,responsavel:(p?$("mResponsible").value:$("mResponsible2").value).trim()||null,mao_de_obra:$("mLabor").checked,troca_peca:$("mParts").checked,servico_realizado:$("mDone").value.trim()||null,observacoes:$("mNotes").value.trim()||null};
  let id=editingId;
  if(id){
    const old=records.find(x=>x.id===id);
    const {error}=await sb.from("manutencoes").update({...payload,updated_by:(await sb.auth.getUser()).data.user?.id||null}).eq("id",id);
    if(error){alert("Erro ao atualizar: "+error.message);return}
    await syncChildren(sb,id,items);
    await writeHistory(sb,id,"Manutenção alterada","Dados da manutenção foram atualizados.",old,payload);
  }else{
    const {data,error}=await sb.from("manutencoes").insert({...payload,created_by:(await sb.auth.getUser()).data.user?.id||null,updated_by:(await sb.auth.getUser()).data.user?.id||null}).select("id").single();
    if(error){alert("Erro ao salvar: "+error.message);return}
    id=data.id;await syncChildren(sb,id,items);await writeHistory(sb,id,"Manutenção criada","Registro inicial criado.",null,payload);
  }
  closeModal();await load();
};

async function syncChildren(sb,id,items){
  await sb.from("manutencao_pecas").delete().eq("manutencao_id",id);
  if($("mParts").checked&&items.length){
    const rows=items.map(x=>({manutencao_id:id,nome:x.name,quantidade:x.qty,solicitado_em:$("purchaseRequestDate").value||null,previsao_entrega:$("purchaseDueDate").value||null,recebido:$("partReceived").checked,data_recebimento:$("partReceived").checked?($("partReceivedDate").value||null):null}));
    const {error}=await sb.from("manutencao_pecas").insert(rows);if(error)throw error;
  }
  await sb.from("manutencao_terceirizados").delete().eq("manutencao_id",id);
  if($("isThirdParty").checked){
    const {error}=await sb.from("manutencao_terceirizados").insert({manutencao_id:id,empresa_responsavel:$("thirdPartyName").value.trim()||null,data_agendada:$("thirdPartyDate").value||null,realizado:$("thirdPartyDone").value==="sim",data_execucao:$("thirdPartyDone").value==="sim"?($("thirdPartyDoneDate").value||null):null});
    if(error)throw error;
  }
}
async function writeHistory(sb,id,action,desc,oldData,newData){
  const user=(await sb.auth.getUser()).data.user;
  const {error}=await sb.from("manutencao_historico").insert({manutencao_id:id,acao:action,descricao:desc,dados_anteriores:oldData?JSON.parse(JSON.stringify(oldData)):null,dados_novos:newData?JSON.parse(JSON.stringify(newData)):null,usuario_id:user?.id||null});
  if(error)console.warn("Histórico não registrado:",error);
}

resetForm();
load();
