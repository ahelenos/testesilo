/* Controle Compras V8.0 — Supabase, pedidos, acompanhamento e recebimentos */
(() => {
"use strict";
const $ = id => document.getElementById(id);
const sb = window.supabaseClient;
const state = {
  user:null, canEdit:false, requests:[], items:[], receipts:[], history:[],
  requestId:null, itemId:null
};
const esc = value => String(value ?? "").replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
const fmtNum = new Intl.NumberFormat("pt-BR",{maximumFractionDigits:3});
const moneyless = n => fmtNum.format(Number(n)||0);
const statusNames = {
  solicitado:"Aguardando compras", cotacao:"Em cotação", encomendado:"Encomendado",
  parcial:"Recebido parcialmente", recebido:"Recebido",
  atrasado:"Entrega atrasada", cancelado:"Cancelado"
};
const priorityNames = {normal:"Normal",alta:"Alta",urgente:"Urgente"};
const historyNames = {
  solicitacao_criada:"Solicitação criada",solicitacao_atualizada:"Pedido atualizado",
  item_adicionado:"Item acrescentado",item_atualizado:"Andamento atualizado",
  cobranca_registrada:"Cobrança / retorno",recebimento_registrado:"Recebimento registrado"
};
function todayISO(){
  const parts=new Intl.DateTimeFormat("en-US",{
    timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",year:"numeric"
  }).formatToParts(new Date());
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function br(date){
  if(!date)return "—";
  const text=String(date).slice(0,10);
  return /^\d{4}-\d\d-\d\d$/.test(text)?text.split("-").reverse().join("/"):String(date);
}
function timestamp(iso){
  if(!iso)return "—";
  return new Date(iso).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo",dateStyle:"short",timeStyle:"short"});
}
function timestampISO(iso){
  if(!iso)return "";
  const parts=new Intl.DateTimeFormat("en-US",{
    timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",year:"numeric"
  }).formatToParts(new Date(iso));
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function elapsed(older,newer=todayISO()){
  if(!older||!/^\d{4}-\d{2}-\d{2}$/.test(String(older).slice(0,10)))return 0;
  return Math.floor((Date.parse(`${newer}T00:00:00Z`)-Date.parse(`${String(older).slice(0,10)}T00:00:00Z`))/86400000);
}
function milli(n){return Math.round((Number(n)||0)*1000);}
function qty(n){return milli(n)/1000;}
function refNo(r){return `SC-${String(r.numero).padStart(6,"0")}`;}
function busy(show,label="Carregando..."){
  $("globalLoadingText").textContent=label;
  $("globalLoading").classList.toggle("hidden",!show);
}
function msg(text="",error=false){
  const node=$("cmMessage");
  node.textContent=text;
  node.classList.toggle("is-error",!!error);
}
function show(id){const d=$(id);if(!d.open)d.showModal();}
function close(id){const d=$(id);if(d.open)d.close();}
function adminOnly(){if(!state.canEdit)throw new Error("Seu acesso é somente para visualização.");}
function requestById(id){return state.requests.find(r=>r.id===id);}
function itemById(id){return state.items.find(i=>i.id===id);}
function receiptsFor(id){return state.receipts.filter(r=>r.item_id===id);}
function receivedMilli(id){return receiptsFor(id).reduce((acc,r)=>acc+milli(r.quantidade),0);}
function status(item){
  const r=receivedMilli(item.id);
  if(item.status==="cancelado")return "cancelado";
  if(r>=milli(item.quantidade))return "recebido";
  if(late(item))return "atrasado";
  if(r>0)return "parcial";
  return item.status;
}
function late(item){
  const remaining=milli(item.quantidade)-receivedMilli(item.id);
  return remaining>0&&item.status!=="cancelado"&&item.previsao_entrega
    &&item.previsao_entrega<todayISO()&&(item.status==="encomendado"||receivedMilli(item.id)>0);
}
function isOpen(item){return item.status!=="cancelado"&&receivedMilli(item.id)<milli(item.quantidade);}
function itemStatusChip(item){
  const s=status(item);
  return `<span class="cm-chip ${s}">${esc(statusNames[s]||s)}</span>`;
}
function priorityChip(prio){return `<span class="cm-chip ${prio}">${esc(priorityNames[prio]||prio)}</span>`;}
function itemSummary(item){
  return `${moneyless(item.quantidade)} ${esc(item.unidade)}`;
}
function remaining(item){return qty(Math.max(0,milli(item.quantidade)-receivedMilli(item.id))/1000);}
function percent(item){
  const amount=milli(item.quantidade);
  return amount>0?Math.round(Math.min(100,receivedMilli(item.id)*100/amount)):0;
}
function requestItems(id){return state.items.filter(i=>i.solicitacao_id===id).sort((a,b)=>a.ordem-b.ordem);}
function totalInfo(){
  const pending=state.items.filter(i=>isOpen(i)&&receivedMilli(i.id)===0&&["solicitado","cotacao"].includes(i.status)).length;
  const ordered=state.items.filter(i=>isOpen(i)&&(i.status==="encomendado"||receivedMilli(i.id)>0)).length;
  const delayed=state.items.filter(late).length;
  const now=todayISO().slice(0,7);
  const received=new Set(state.receipts.filter(r=>String(r.data_recebimento).slice(0,7)===now).map(r=>r.item_id)).size;
  return {pending,ordered,delayed,received};
}
function itemAttention(item){
  if(!isOpen(item))return null;
  const request=requestById(item.solicitacao_id);
  if(late(item)){
    return {id:item.id,requestId:item.solicitacao_id,level:"danger",
      label:`Entrega atrasada ${elapsed(item.previsao_entrega)} dia(s)`,
      sub:`${refNo(request)} · ${item.descricao} · previsão ${br(item.previsao_entrega)}`,weight:0};
  }
  if(item.status==="encomendado"&&!item.previsao_entrega){
    return {id:item.id,requestId:item.solicitacao_id,level:"info",
      label:"Encomendado sem previsão de entrega",
      sub:`${refNo(request)} · ${item.descricao} · solicite o prazo ao setor de compras`,weight:1};
  }
  if(item.proxima_cobranca && item.proxima_cobranca<=todayISO()){
    return {id:item.id,requestId:item.solicitacao_id,level:"info",
      label:"Cobrança programada para "+br(item.proxima_cobranca),
      sub:`${refNo(request)} · ${item.descricao}`,weight:1};
  }
  const days=elapsed(timestampISO(item.updated_at)||request.data_solicitacao);
  if(["solicitado","cotacao"].includes(item.status)&&days>=4){
    return {id:item.id,requestId:item.solicitacao_id,level:"info",
      label:`${days} dias sem atualização`,
      sub:`${refNo(request)} · ${item.descricao} · ${statusNames[item.status]}`,weight:2};
  }
  return null;
}
function renderKPIs(){
  const k=totalInfo();
  $("kpiPending").textContent=k.pending;
  $("kpiOrdered").textContent=k.ordered;
  $("kpiLate").textContent=k.delayed;
  $("kpiReceived").textContent=k.received;
}
function renderAttention(){
  const entries=state.items.map(itemAttention).filter(Boolean)
    .sort((a,b)=>a.weight-b.weight||a.sub.localeCompare(b.sub,"pt-BR"))
    .slice(0,8);
  $("attentionCount").textContent=entries.length?`${entries.length} prioridade(s) exibida(s)`:"Tudo em dia";
  $("attentionList").innerHTML=entries.length?entries.map(entry=>`
    <div class="cm-attention ${entry.level==="danger"?"":"info"}">
      <div><strong>${esc(entry.label)}</strong><small>${esc(entry.sub)}</small></div>
      <button type="button" data-open-request="${esc(entry.requestId)}">Ver pedido</button>
    </div>
  `).join(""):`<p class="cm-empty-small">Nenhuma entrega atrasada ou cobrança pendente neste momento.</p>`;
}
function matchesItem(i,type){
  if(type==="todos")return true;
  if(type==="atrasado")return !!late(i);
  if(type==="pendente")return receivedMilli(i.id)===0&&["solicitado","cotacao"].includes(i.status);
  if(type==="encomendado")return isOpen(i)&&i.status==="encomendado"&&receivedMilli(i.id)===0;
  if(type==="parcial")return receivedMilli(i.id)>0&&isOpen(i);
  return status(i)===type;
}
function selectedRequests(){
  const search=$("searchInput").value.trim().toLocaleLowerCase("pt-BR");
  const situation=$("statusFilter").value;
  const priority=$("priorityFilter").value;
  return state.requests.filter(r=>{
    if(priority!=="todos"&&r.prioridade!==priority)return false;
    const items=requestItems(r.id);
    if(situation!=="todos"&&!items.some(i=>matchesItem(i,situation)))return false;
    if(!search)return true;
    const fields=[refNo(r),r.observacoes,r.data_solicitacao,
      ...items.flatMap(i=>[i.descricao,i.fornecedor,i.observacoes,i.unidade])];
    return fields.some(f=>String(f||"").toLocaleLowerCase("pt-BR").includes(search));
  }).sort((a,b)=>b.data_solicitacao.localeCompare(a.data_solicitacao)||Number(b.numero)-Number(a.numero));
}
function renderRequests(){
  const data=selectedRequests();
  $("requestCount").textContent=`${data.length} de ${state.requests.length} solicitação(ões)`;
  $("requestsList").innerHTML=data.length?data.map(r=>{
    const items=requestItems(r.id);
    const completed=items.filter(i=>["recebido","cancelado"].includes(status(i))).length;
    const preview=items.map(i=>`
      <div class="cm-request-item">
       <div><strong>${esc(i.descricao)}</strong><small>${itemSummary(i)}
         ${i.previsao_entrega?` · Previsão ${esc(br(i.previsao_entrega))}`:""}
         ${receivedMilli(i.id)>0?` · Recebido ${moneyless(qty(receivedMilli(i.id)/1000))} ${esc(i.unidade)}`:""}
       </small></div>${itemStatusChip(i)}
      </div>`).join("");
    return `<article class="cm-request">
      <div class="cm-request-head"><div><h3>${esc(refNo(r))}</h3><span class="cm-request-meta">Solicitado em ${esc(br(r.data_solicitacao))} · ${items.length} item(ns)</span></div>${priorityChip(r.prioridade)}</div>
      <div class="cm-request-items">${preview}</div>
      <div class="cm-request-foot"><small>${completed} de ${items.length} item(ns) concluído(s) ou cancelado(s)</small>
       <button class="btn secondary" type="button" data-open-request="${esc(r.id)}">Ver detalhes</button></div>
    </article>`;
  }).join(""):`<div class="cm-empty">${state.requests.length?"Nenhum pedido corresponde aos filtros selecionados.":"Nenhuma solicitação cadastrada. Clique em + Nova solicitação para começar."}</div>`;
}
function render(){
  renderKPIs();
  renderAttention();
  renderRequests();
  if($("detailsDialog").open&&state.requestId)renderDetails();
}
function detailItem(i){
  const delivered=qty(receivedMilli(i.id)/1000),remainingQty=remaining(i);
  const acts=state.canEdit?`<div class="cm-item-actions">
    <button class="btn secondary" type="button" data-act="item" data-id="${esc(i.id)}">Atualizar andamento</button>
    ${isOpen(i)?`<button class="btn secondary" type="button" data-act="followup" data-id="${esc(i.id)}">Registrar cobrança</button>
    <button class="btn primary" type="button" data-act="receive" data-id="${esc(i.id)}">+ Recebimento</button>`:""}
   </div>`:"";
  const receipts=receiptsFor(i.id).slice().sort((a,b)=>b.data_recebimento.localeCompare(a.data_recebimento));
  const receiptsHtml=receipts.length?`<p class="cm-detail-notes"><strong>Entregas registradas:</strong> ${receipts.map(r=>`${esc(br(r.data_recebimento))}: ${moneyless(r.quantidade)} ${esc(i.unidade)}`).join(" · ")}</p>`:"";
  return `<article class="cm-detail-item">
     <div class="cm-detail-head"><div><h4>${esc(i.descricao)}</h4><p>Solicitado: ${itemSummary(i)}</p></div>${itemStatusChip(i)}</div>
     <div class="cm-detail-grid">
      <div><small>Fornecedor</small>${esc(i.fornecedor||"Não informado")}</div>
      <div><small>Data da encomenda</small>${esc(br(i.data_encomenda))}</div>
      <div><small>Previsão de entrega</small>${esc(br(i.previsao_entrega))}</div>
      <div><small>Recebido</small>${moneyless(delivered)} ${esc(i.unidade)}</div>
      <div><small>Saldo pendente</small>${moneyless(remainingQty)} ${esc(i.unidade)}</div>
      <div><small>Próxima cobrança</small>${esc(br(i.proxima_cobranca))}</div>
     </div>
     <div class="cm-progress" role="progressbar" aria-label="Recebimento do item" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent(i)}">
      <span style="width:${percent(i)}%"></span></div>
     ${i.observacoes?`<p class="cm-detail-notes"><strong>Observações:</strong> ${esc(i.observacoes)}</p>`:""}
     ${receiptsHtml}${acts}
    </article>`;
}
function renderDetails(){
  const r=requestById(state.requestId);
  if(!r){close("detailsDialog");return;}
  $("detailsTitle").textContent=refNo(r);
  $("detailsSubtitle").textContent=`Solicitado em ${br(r.data_solicitacao)} · ${requestItems(r.id).length} itens`;
  $("detailsMeta").innerHTML=`${priorityChip(r.prioridade)} <span class="cm-muted">· Criado em ${esc(timestamp(r.created_at))}</span>
    ${r.observacoes?`<p class="cm-detail-notes">${esc(r.observacoes)}</p>`:""}`;
  const items=requestItems(r.id);
  $("detailsItems").innerHTML=items.length?items.map(detailItem).join(""):`<p class="cm-empty-small">Nenhum item na solicitação.</p>`;
  const hist=state.history.filter(h=>h.solicitacao_id===r.id)
    .sort((a,b)=>String(b.criado_em).localeCompare(String(a.criado_em))||Number(b.id)-Number(a.id));
  $("detailsHistory").innerHTML=hist.length?hist.map(h=>`
    <div class="cm-history-row"><strong>${esc(historyNames[h.evento]||h.evento)}</strong>
    <p>${esc(h.detalhes)}</p><small>${esc(timestamp(h.criado_em))}</small></div>`).join("")
    :`<p class="cm-empty-small">Nenhum registro no histórico.</p>`;
}
function openDetails(id){
  if(!requestById(id))return;
  state.requestId=id;
  renderDetails();
  show("detailsDialog");
}
async function fetchAll(table,sortColumn="created_at",ascending=false){
  const pageSize=500;
  const items=[];
  for(let start=0; ; start+=pageSize){
    const {data,error}=await sb.from(table).select("*").order(sortColumn,{ascending})
      .range(start,start+pageSize-1);
    if(error)throw error;
    items.push(...(data||[]));
    if(!data||data.length<pageSize)break;
    if(start>=49900)throw new Error("Há muitos registros para carregar de uma vez. Consulte o suporte.");
  }
  return items;
}
async function loadData(silent=false){
  if(!silent)busy(true,"Carregando solicitações de compras...");
  try{
    const [requests,items,receipts,history]=await Promise.all([
      fetchAll("compras_solicitacoes","data_solicitacao"),
      fetchAll("compras_itens","created_at"),
      fetchAll("compras_recebimentos","created_at"),
      fetchAll("compras_historico","criado_em")
    ]);
    state.requests=requests;state.items=items;state.receipts=receipts;state.history=history;
    render();
    if(!silent)msg("");
  }catch(err){
    console.error("Controle Compras — consulta:",err);
    msg(err.message||"Não foi possível carregar as solicitações.",true);
    throw err;
  }finally{
    if(!silent)busy(false);
  }
}
async function call(name,args){
  const {data,error}=await sb.rpc(name,args);
  if(error)throw new Error(error.message||"Erro ao salvar no banco.");
  return data;
}
function newItemRow(){
  const host=$("newItems");
  if(host.children.length>=100){$("requestError").textContent="Limite de 100 itens por solicitação.";return;}
  const row=document.createElement("div");
  row.className="cm-new-item";
  row.innerHTML=`<label>Material / produto / ferramenta<input class="cm-new-description" maxlength="200" placeholder="Ex.: cimento CP-II 50 kg" required></label>
   <label>Quantidade<input class="cm-new-qty" type="number" min="0.001" max="999999999" step="0.001" value="1" required></label>
   <label>Unidade<input class="cm-new-unit" list="unitOptions" maxlength="30" value="unidade" required></label>
   <button class="cm-remove-item" type="button" aria-label="Remover este item">×</button>`;
  host.appendChild(row);
  row.querySelector(".cm-remove-item").addEventListener("click",()=>{
    if(host.children.length>1)row.remove();
    else $("requestError").textContent="Mantenha pelo menos um item na solicitação.";
  });
}
function openNewRequest(){
  adminOnly();
  $("requestForm").reset();
  $("requestDate").value=todayISO();
  $("requestPriority").value="normal";
  $("newItems").replaceChildren();
  $("requestError").textContent="";
  newItemRow();
  show("requestDialog");
}
function collectItems(){
  const rows=[...$("newItems").children];
  if(!rows.length)throw new Error("Inclua pelo menos um material.");
  return rows.map((row,index)=>{
    const description=row.querySelector(".cm-new-description").value.trim();
    const unit=row.querySelector(".cm-new-unit").value.trim();
    const quantity=Number(row.querySelector(".cm-new-qty").value);
    if(description.length<2||description.length>200||unit.length<1||unit.length>30
      ||!Number.isFinite(quantity)||quantity<=0||quantity>999999999
      ||Math.abs(quantity*1000-Math.round(quantity*1000))>1e-6){
      throw new Error(`Preencha corretamente descrição, quantidade e unidade do item ${index+1}.`);
    }
    return {descricao:description,quantidade:quantity,unidade:unit};
  });
}
async function perform(formId,errorId,description,task,success,closeId){
  adminOnly();
  const form=$(formId);
  const button=form.querySelector('button[type="submit"]');
  const error=$(errorId);
  if(button)button.disabled=true;
  error.textContent="";
  busy(true,description);
  try{
    await task();
    if(closeId)close(closeId);
    await loadData(true);
    if(success)msg(success);
    return true;
  }catch(err){
    console.error("Controle Compras — gravação:",err);
    error.textContent=err.message||"Não foi possível salvar.";
    return false;
  }finally{
    if(button)button.disabled=false;
    busy(false);
  }
}
function openEditRequest(){
  adminOnly();
  const r=requestById(state.requestId);
  if(!r)return;
  $("editRequestPriority").value=r.prioridade;
  $("editRequestNotes").value=r.observacoes||"";
  $("editRequestError").textContent="";
  show("editRequestDialog");
}
function openItem(id=null){
  adminOnly();
  state.itemId=id;
  const item=id?itemById(id):null;
  if(id&&!item)return;
  if(!state.requestId)return;
  $("itemForm").reset();
  $("itemDialogTitle").textContent=item?"Atualizar material":"Acrescentar item";
  $("itemDescription").value=item?.descricao||"";
  $("itemQuantity").value=item?.quantidade??1;
  $("itemUnit").value=item?.unidade||"unidade";
  $("itemStatus").value=item?.status||"solicitado";
  $("itemSupplier").value=item?.fornecedor||"";
  $("itemOrderedDate").value=item?.data_encomenda||"";
  $("itemExpected").value=item?.previsao_entrega||"";
  $("itemFollowup").value=item?.proxima_cobranca||"";
  $("itemNotes").value=item?.observacoes||"";
  ["itemStatus","itemSupplier","itemOrderedDate","itemExpected","itemFollowup","itemNotes"].forEach(field=>{
    const el=$(field);
    el.disabled=!item;
    el.closest("label").classList.toggle("hidden",!item);
  });
  $("itemError").textContent="";
  show("itemDialog");
}
function openFollowup(id){
  adminOnly();
  const item=itemById(id);if(!item||!isOpen(item))return;
  state.itemId=id;
  $("followupForm").reset();
  $("followupItemLabel").textContent=item.descricao;
  $("followupDate").value=item.proxima_cobranca||"";
  $("followupError").textContent="";
  show("followupDialog");
}
function openReceive(id){
  adminOnly();
  const item=itemById(id);if(!item||!isOpen(item))return;
  state.itemId=id;
  $("receiveForm").reset();
  const balance=remaining(item);
  $("receiveItemLabel").textContent=item.descricao;
  $("receiveBalance").textContent=`Quantidade ainda pendente: ${moneyless(balance)} ${item.unidade}.`;
  $("receiveQuantity").max=String(balance);
  $("receiveQuantity").value=String(balance);
  $("receiveDate").value=todayISO();
  $("receiveError").textContent="";
  show("receiveDialog");
}
async function boot(){
  try{
    state.user=await SiloSupabase.getUser();
    if(!state.user){
      $("loginScreen").classList.remove("hidden");
      $("appScreen").classList.add("hidden");
      return;
    }
    const profile=await SiloSupabase.getProfile(state.user);
    if(!profile||profile.active!==true){
      await SiloSupabase.signOut();
      $("loginScreen").classList.remove("hidden");
      $("appScreen").classList.add("hidden");
      $("loginError").textContent="Perfil não autorizado ou inativo.";
      return;
    }
    const [viewer,administrator]=await Promise.all([
      sb.rpc("compras_pode_acessar",{p_nivel:"viewer"}),
      sb.rpc("compras_pode_acessar",{p_nivel:"admin"})
    ]);
    if(viewer.error)throw viewer.error;
    if(administrator.error)throw administrator.error;
    if(viewer.data!==true){window.location.replace("index.html");return;}
    state.canEdit=administrator.data===true;
    $("loginScreen").classList.add("hidden");
    $("appScreen").classList.remove("hidden");
    $("userEmail").textContent=state.user.email||"";
    $("userRole").textContent=state.canEdit?"ADMINISTRAR":"VISUALIZAÇÃO";
    document.querySelectorAll(".cm-admin-only").forEach(node=>node.classList.toggle("hidden",!state.canEdit));
    await loadData();
  }catch(err){
    console.error("Controle Compras — inicialização:",err);
    $("loginScreen").classList.add("hidden");
    $("appScreen").classList.remove("hidden");
    document.querySelectorAll(".cm-admin-only").forEach(n=>n.classList.add("hidden"));
    msg("Não foi possível inicializar o módulo. Confira se o SQL da V8.0 foi executado e se sua conta tem permissão: "+(err.message||""),true);
  }
}
$("loginForm").addEventListener("submit",async event=>{
  event.preventDefault();
  $("loginError").textContent="";
  try{
    const result=await SiloSupabase.signIn($("loginEmail").value.trim(),$("loginPassword").value);
    if(result?.error)throw result.error;
    await boot();
  }catch(err){$("loginError").textContent=err.message||"Falha ao entrar.";}
});
$("logoutBtn").addEventListener("click",async()=>{await SiloSupabase.signOut();window.location.assign("index.html");});
$("newRequestBtn").addEventListener("click",openNewRequest);
$("addNewItem").addEventListener("click",newItemRow);
$("printBtn").addEventListener("click",()=>window.print());
["searchInput","statusFilter","priorityFilter"].forEach(id=>
  $(id).addEventListener(id==="searchInput"?"input":"change",renderRequests)
);
document.querySelectorAll("[data-close]").forEach(btn=>
  btn.addEventListener("click",()=>close(btn.dataset.close))
);
["attentionList","requestsList"].forEach(id=>{
  $(id).addEventListener("click",event=>{
    const button=event.target.closest("button[data-open-request]");
    if(button)openDetails(button.dataset.openRequest);
  });
});
$("detailsItems").addEventListener("click",event=>{
  const btn=event.target.closest("button[data-act]");
  if(!btn)return;
  const itemId=btn.dataset.id;
  if(btn.dataset.act==="item")openItem(itemId);
  if(btn.dataset.act==="followup")openFollowup(itemId);
  if(btn.dataset.act==="receive")openReceive(itemId);
});
$("editRequestBtn").addEventListener("click",openEditRequest);
$("addItemBtn").addEventListener("click",()=>openItem());
$("requestForm").addEventListener("submit",event=>{
  event.preventDefault();
  let items;
  try{items=collectItems();}catch(err){$("requestError").textContent=err.message;return;}
  perform("requestForm","requestError","Criando solicitação...",async()=>{
    const id=await call("compras_criar_solicitacao",{
      p_data:$("requestDate").value,p_prioridade:$("requestPriority").value,
      p_observacoes:$("requestNotes").value.trim(),p_itens:items
    });
    state.requestId=id;
  },"Solicitação criada com sucesso.","requestDialog").then(ok=>{
    if(ok&&state.requestId&&requestById(state.requestId))openDetails(state.requestId);
  });
});
$("editRequestForm").addEventListener("submit",event=>{
  event.preventDefault();
  perform("editRequestForm","editRequestError","Salvando solicitação...",()=>call("compras_atualizar_solicitacao",{
    p_id:state.requestId,p_prioridade:$("editRequestPriority").value,
    p_observacoes:$("editRequestNotes").value.trim()
  }),"Solicitação atualizada.","editRequestDialog");
});
$("itemForm").addEventListener("submit",event=>{
  event.preventDefault();
  const amount=Number($("itemQuantity").value);
  if(!Number.isFinite(amount)||amount<=0||amount>999999999||Math.abs(amount*1000-Math.round(amount*1000))>1e-6){
    $("itemError").textContent="Informe uma quantidade válida (até três casas decimais).";return;
  }
  const id=state.itemId;
  const args=id?{
    p_item_id:id,p_descricao:$("itemDescription").value.trim(),
    p_quantidade:amount,p_unidade:$("itemUnit").value.trim(),
    p_status:$("itemStatus").value,p_fornecedor:$("itemSupplier").value.trim(),
    p_data_encomenda:$("itemOrderedDate").value||null,
    p_previsao_entrega:$("itemExpected").value||null,
    p_proxima_cobranca:$("itemFollowup").value||null,
    p_observacoes:$("itemNotes").value.trim()
  }:{
    p_solicitacao_id:state.requestId,p_descricao:$("itemDescription").value.trim(),
    p_quantidade:amount,p_unidade:$("itemUnit").value.trim()
  };
  perform("itemForm","itemError",id?"Atualizando item...":"Adicionando item...",
    ()=>call(id?"compras_atualizar_item":"compras_adicionar_item",args),
    id?"Item atualizado.":"Item adicionado.","itemDialog");
});
$("followupForm").addEventListener("submit",event=>{
  event.preventDefault();
  perform("followupForm","followupError","Registrando cobrança...",()=>call("compras_registrar_cobranca",{
    p_item_id:state.itemId,p_detalhes:$("followupText").value.trim(),
    p_proxima_cobranca:$("followupDate").value||null
  }),"Cobrança registrada no histórico.","followupDialog");
});
$("receiveForm").addEventListener("submit",event=>{
  event.preventDefault();
  const amount=Number($("receiveQuantity").value);
  const item=itemById(state.itemId);
  if(!item||!Number.isFinite(amount)||amount<=0||milli(amount)>milli(remaining(item))
    ||Math.abs(amount*1000-Math.round(amount*1000))>1e-6){
    $("receiveError").textContent="Informe uma quantidade positiva dentro do saldo pendente.";return;
  }
  perform("receiveForm","receiveError","Registrando recebimento...",()=>call("compras_registrar_recebimento",{
    p_item_id:state.itemId,p_quantidade:amount,p_data:$("receiveDate").value,
    p_observacoes:$("receiveNotes").value.trim()
  }),"Recebimento registrado com sucesso.","receiveDialog");
});
boot();
})();
