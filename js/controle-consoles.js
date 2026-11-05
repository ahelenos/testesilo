(() => {
"use strict";
const $ = id => document.getElementById(id);
const sb = window.supabaseClient;
const state = { user:null, permission:"none", works:[], pillars:[], executions:[], currentWorkId:null, editingWorkId:null, editingPillarId:null };
const admin = () => state.permission === "admin";
const esc = v => String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const today = () => { const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const br = d => d ? String(d).slice(0,10).split("-").reverse().join("/") : "—";
const collator = new Intl.Collator("pt-BR",{numeric:true,sensitivity:"base"});
function msg(text="",error=false){ $("ccMessage").textContent=text;$("ccMessage").classList.toggle("error",error); }
function busy(show,text="Carregando..."){$("globalLoadingText").textContent=text;$("globalLoading").classList.toggle("hidden",!show);}
function showDialog(id){const d=$(id);if(!d.open)d.showModal();}
function closeDialog(id){const d=$(id);if(d.open)d.close();}
function checkAdmin(){if(!admin())throw Error("Você não tem permissão para alterar o Controle Consoles.");}
async function authGuard(){
 state.user=await SiloSupabase.getUser();
 if(!state.user){$("loginScreen").classList.remove("hidden");$("appScreen").classList.add("hidden");return false;}
 const profile=await SiloSupabase.getProfile(state.user);
 if(!profile||profile.active===false){await SiloSupabase.signOut();$("loginScreen").classList.remove("hidden");$("appScreen").classList.add("hidden");return false;}
 const {data:isGlobalAdmin,error:adminError}=await sb.rpc("is_global_admin");
 if(!adminError&&isGlobalAdmin===true)state.permission="admin";
 else{
  const permissions=await SiloSupabase.getModulePermissions(state.user);
  state.permission=String(permissions.controle_consoles||"none").toLowerCase();
 }
 if(!["admin","viewer"].includes(state.permission)){location.replace("index.html");return false;}
 $("loginScreen").classList.add("hidden");$("appScreen").classList.remove("hidden");
 $("userRole").textContent=admin()?"ADMINISTRAR":"VISUALIZAÇÃO";
 $("userEmail").textContent=state.user.email||"";
 document.querySelectorAll(".cc-admin-only").forEach(el=>el.classList.toggle("hidden",!admin()));
 return true;
}
async function loadAll(silent=false){
 if(!silent)busy(true,"Carregando obras e pilares...");
 try{
  const [a,b,c]=await Promise.all([
   sb.from("cc_obras").select("*").order("nome"),
   sb.from("cc_pilares").select("*").order("ordem",{ascending:true}),
   sb.from("cc_execucoes").select("*")
  ]);
  if(a.error)throw a.error;if(b.error)throw b.error;if(c.error)throw c.error;
  state.works=a.data||[];state.pillars=b.data||[];state.executions=c.data||[];
  render();
  if($("pillarsDialog").open)renderPillars();
 }catch(err){console.error(err);msg(err.message||"Erro ao carregar os dados.",true);}
 finally{if(!silent)busy(false);}
}
function workPillars(id){return state.pillars.filter(p=>p.obra_id===id);}
function executionFor(id){return state.executions.find(e=>e.pilar_id===id);}
function stats(id){const pillars=workPillars(id),ready=pillars.filter(p=>Boolean(executionFor(p.id))).length;return {total:pillars.length,ready,pending:pillars.length-ready};}
// The pillar's UUID and ordem remain unchanged in the database.
// Only the user-facing label is adjusted; duplicate names stay distinguishable.
function displayPillarNames(pillars){
 const grouped=new Map();
 for(const p of pillars){
  const name=String(p.nome||"").trim().toLocaleLowerCase("pt-BR");
  if(!grouped.has(name))grouped.set(name,[]);
  grouped.get(name).push(p);
 }
 const labels=new Map();
 for(const siblings of grouped.values()){
  siblings.sort((a,b)=>Number(a.ordem)-Number(b.ordem));
  siblings.forEach((p,i)=>{
   labels.set(p.id, siblings.length>1 ? `${p.nome} (${i+1} de ${siblings.length})` : p.nome);
  });
 }
 return labels;
}
function latestWorkExecutionDate(workId){
 const pillarIds=new Set(workPillars(workId).map(p=>p.id));
 let latest=null;
 for(const execution of state.executions){
  if(!pillarIds.has(execution.pilar_id)||!execution.data_execucao)continue;
  const day=String(execution.data_execucao).slice(0,10);
  if(/^\d{4}-\d{2}-\d{2}$/.test(day)&&(!latest||day>latest))latest=day;
 }
 return latest;
}

function render(){
 const totals=state.works.reduce((a,w)=>{let s=stats(w.id);a.pillars+=s.total;a.ready+=s.ready;return a;},{pillars:0,ready:0});
 $("totalWorks").textContent=state.works.length;
 $("totalPillars").textContent=totals.pillars;
 $("totalReady").textContent=totals.ready;
 $("totalPending").textContent=totals.pillars-totals.ready;
 const filter=$("searchWork").value.trim().toLocaleLowerCase("pt-BR");
 const works=[...state.works].filter(w=>w.nome.toLocaleLowerCase("pt-BR").includes(filter)).sort((a,b)=>collator.compare(a.nome,b.nome));
 $("emptyWorks").classList.toggle("hidden",works.length!==0);
 $("worksGrid").innerHTML=works.map(w=>{
  const s=stats(w.id),pct=s.total?(s.ready/s.total)*100:0,latestExecution=latestWorkExecutionDate(w.id);
  return `<article class="cc-work" data-work="${esc(w.id)}">
   <div class="cc-work-head"><h3>${esc(w.nome)}</h3><span class="cc-status">${s.total?Math.round(pct)+"% concluído":"Sem pilares"}</span></div>
   <div class="cc-stats"><div><strong>${s.total}</strong><small>Total de pilares</small></div><div><strong>${s.ready}</strong><small>Prontos com console</small></div><div><strong>${s.pending}</strong><small>A fazer console</small></div></div>
   <div class="cc-progress-track"><div class="cc-progress-bar" style="width:${pct}%"></div></div>
   <div class="cc-last-execution"><span>Último pilar concluído</span><strong>${latestExecution?br(latestExecution):"Nenhum registro"}</strong></div>
   <div class="cc-work-actions"><button class="btn secondary" data-action="open" data-id="${esc(w.id)}">Ver pilares</button>
   ${admin()?`<button class="btn secondary" data-action="register" data-id="${esc(w.id)}">+ Execução</button><button class="btn secondary" data-action="edit-work" data-id="${esc(w.id)}">Editar</button><button class="btn secondary cc-danger" data-action="delete-work" data-id="${esc(w.id)}">Excluir</button>`:""}</div>
  </article>`;
 }).join("");
}
function openWorkEditor(work=null){checkAdmin();state.editingWorkId=work?.id||null;$("workDialogTitle").textContent=work?"Editar obra":"Nova obra";$("workName").value=work?.nome||"";showDialog("workDialog");$("workName").focus();}
function openPillars(workId){
 const work=state.works.find(w=>w.id===workId);if(!work)return;
 state.currentWorkId=workId;
 $("pillarsTitle").textContent=work.nome;
 $("pillarsSubtitle").textContent="Nomes repetidos representam pilares distintos.";
 $("pillarSearch").value="";$("pillarStatusFilter").value="all";
 $("pillarName").value="";renderPillars();showDialog("pillarsDialog");
}
function renderPillars(){
 const workId=state.currentWorkId;
 const filter=$("pillarStatusFilter").value;
 const q=$("pillarSearch").value.trim().toLocaleLowerCase("pt-BR");
 const labels=displayPillarNames(workPillars(workId));
 const pillars=workPillars(workId).filter(p=>{
  const done=Boolean(executionFor(p.id));
  return (filter==="all"||(filter==="done"&&done)||(filter==="pending"&&!done))&&p.nome.toLocaleLowerCase("pt-BR").includes(q);
 }).sort((a,b)=>collator.compare(a.nome,b.nome)||Number(a.ordem)-Number(b.ordem));
 $("pillarsEmpty").classList.toggle("hidden",pillars.length!==0);
 $("pillarsBody").innerHTML=pillars.map(p=>{
  const record=executionFor(p.id);
  return `<tr><td><strong>${esc(labels.get(p.id)||p.nome)}</strong></td>
   <td><span class="${record?"cc-tag-done":"cc-tag-pending"}">${record?"Pronto":"Pendente"}</span></td>
   <td>${record?Number(record.quantidade):"—"}</td><td>${record?br(record.data_execucao):"—"}</td>
   <td>${admin()?`${record?`<button class="btn secondary" data-action="edit-execution" data-id="${esc(p.id)}">Editar execução</button><button class="btn secondary danger" data-action="remove-execution" data-id="${esc(p.id)}">Desfazer</button>`:`<button class="btn primary" data-action="new-execution" data-id="${esc(p.id)}">Registrar</button>`}<button class="btn secondary" data-action="edit-pillar" data-id="${esc(p.id)}">Nome</button><button class="btn secondary danger" data-action="remove-pillar" data-id="${esc(p.id)}">Excluir</button>`:"—"}</td></tr>`;
 }).join("");
}
function option(value,label){const el=document.createElement("option");el.value=value;el.textContent=label;return el;}
function fillRecordPillars(workId,selectedPillarId=null){
 const sel=$("recordPillar");sel.replaceChildren();
 const pillars=workPillars(workId).sort((a,b)=>collator.compare(a.nome,b.nome)||a.ordem-b.ordem);
 const labels=displayPillarNames(pillars);
 // When editing an existing record, include the selected pilar.
 const available=pillars.filter(p=>!executionFor(p.id)||p.id===selectedPillarId);
 if(!available.length){sel.add(option("","Não há pilares pendentes"));return;}
 sel.add(option("","Selecione o pilar"));
 for(const p of available) sel.add(option(p.id,labels.get(p.id)||p.nome));
 if(selectedPillarId)sel.value=selectedPillarId;
}
function openRecord(workId=null,pillarId=null){
 checkAdmin();
 if(!state.works.length){msg("Cadastre uma obra antes de registrar a execução.",true);return;}
 const p=pillarId?state.pillars.find(x=>x.id===pillarId):null;
 const record=p?executionFor(p.id):null;
 const chosenWork=workId||p?.obra_id||state.works[0].id;
 $("recordWork").replaceChildren(...[option("","Selecione a obra"),...([...state.works].sort((a,b)=>collator.compare(a.nome,b.nome)).map(w=>option(w.id,w.nome)))]);
 $("recordWork").value=chosenWork;
 $("recordWork").disabled=!!record;
 fillRecordPillars(chosenWork,pillarId);
 $("recordPillar").disabled=!!record;
 $("recordTitle").textContent=record?"Editar execução":"Registrar execução";
 $("recordQty").value=record?.quantidade||"";
 $("recordDate").value=record?.data_execucao||today();
 state.editingPillarId=record?p.id:null;
 showDialog("recordDialog");
}
async function saveWork(e){
 e.preventDefault();checkAdmin();
 const nome=$("workName").value.trim();if(!nome)throw Error("Informe o nome da obra.");
 if(nome.length>160)throw Error("O nome da obra é muito longo.");
 const payload={nome};
 const req=state.editingWorkId?sb.from("cc_obras").update(payload).eq("id",state.editingWorkId):sb.from("cc_obras").insert(payload);
 const {error}=await req;if(error)throw error;
 closeDialog("workDialog");msg("Obra salva com sucesso.");await loadAll(true);
}
async function addPillar(e){
 e.preventDefault();checkAdmin();
 const nome=$("pillarName").value.trim();if(!nome||nome.length>120)throw Error("Nome do pilar inválido.");
 const {error}=await sb.from("cc_pilares").insert({obra_id:state.currentWorkId,nome});
 if(error)throw error;
 $("pillarName").value="";msg("Pilar cadastrado.");await loadAll(true);
}
async function saveExecution(e){
 e.preventDefault();checkAdmin();
 const workId=$("recordWork").value,pillarId=$("recordPillar").value;
 const pillar=state.pillars.find(p=>p.id===pillarId);
 if(!pillar||pillar.obra_id!==workId)throw Error("Selecione um pilar válido da obra.");
 const qtd=Number($("recordQty").value);
 if(!Number.isSafeInteger(qtd)||qtd<1||qtd>100000)throw Error("Informe uma quantidade inteira maior que zero.");
 const date=$("recordDate").value;if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(new Date(date+"T00:00:00").getTime()))throw Error("Informe uma data válida.");
 const payload={pilar_id:pillarId,quantidade:qtd,data_execucao:date};
 const existing=executionFor(pillarId);
 const req=existing?sb.from("cc_execucoes").update(payload).eq("pilar_id",pillarId):sb.from("cc_execucoes").insert(payload);
 const {error}=await req;
 if(error)throw error;
 closeDialog("recordDialog");msg(existing?"Execução atualizada.":"Execução registrada; pilar concluído.");await loadAll(true);
}
async function deleteWork(id){
 checkAdmin();const w=state.works.find(x=>x.id===id);if(!w)return;
 if(!confirm(`Excluir a obra "${w.nome}" e TODOS os seus pilares e execuções? Esta ação é definitiva.`))return;
 const {error}=await sb.from("cc_obras").delete().eq("id",id);if(error)throw error;
 msg("Obra excluída.");await loadAll(true);
}
async function deletePillar(id){
 checkAdmin();const p=state.pillars.find(x=>x.id===id);if(!p)return;
 if(!confirm(`Excluir o pilar "${p.nome}" e seu registro de execução, se houver?`))return;
 const {error}=await sb.from("cc_pilares").delete().eq("id",id);if(error)throw error;
 msg("Pilar excluído.");await loadAll(true);
}
async function editPillarName(id){
 checkAdmin();const p=state.pillars.find(x=>x.id===id);if(!p)return;
 const name=prompt("Novo nome do pilar:",p.nome);if(name===null)return;
 const nome=name.trim();if(!nome||nome.length>120)throw Error("Nome inválido.");
 const {error}=await sb.from("cc_pilares").update({nome}).eq("id",id);if(error)throw error;
 msg("Pilar atualizado.");await loadAll(true);
}
async function removeExecution(id){
 checkAdmin();const p=state.pillars.find(x=>x.id===id);if(!p||!executionFor(id))return;
 if(!confirm(`Desfazer a conclusão do pilar "${p.nome}"? O lançamento será excluído.`))return;
 const {error}=await sb.from("cc_execucoes").delete().eq("pilar_id",id);if(error)throw error;
 msg("Execução removida. Pilar pendente novamente.");await loadAll(true);
}
async function importExcel(){
 checkAdmin();const file=$("importFile").files?.[0];
 if(!file)throw Error("Selecione um arquivo Excel ou CSV.");
 if(file.size>8*1024*1024)throw Error("Arquivo muito grande. Limite de 8 MB.");
 if(!/\.(xlsx|xls|csv)$/i.test(file.name))throw Error("Formato inválido; use XLSX, XLS ou CSV.");
 if(typeof XLSX==="undefined")throw Error("Biblioteca Excel indisponível. Verifique a conexão e tente novamente.");
 const arrayBuffer=await file.arrayBuffer();
 const book=XLSX.read(arrayBuffer,{type:"array",cellDates:false,raw:false});
 const sheet=book.Sheets[book.SheetNames[0]];
 if(!sheet)throw Error("Planilha sem conteúdo.");
 const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",blankrows:false});
 if(!rows.length)throw Error("Planilha sem pilares.");
 const header=rows[0].map(v=>String(v??"").trim().toLocaleLowerCase("pt-BR"));
 let col=header.findIndex(h=>/^(pilar|pilares|nome|nome do pilar|identifica[cç][aã]o)$/.test(h));
 if(col<0)col=0;
 const hasHeader=/^(pilar|pilares|nome|nome do pilar|identifica[cç][aã]o)$/.test(header[col]||"");
 const values=rows.slice(hasHeader?1:0).map(r=>String(r[col]??"").trim()).filter(Boolean);
 if(values.some(v=>v.length>120))throw Error("Há nomes de pilares com mais de 120 caracteres.");
 if(!values.length)throw Error("Nenhum pilar válido encontrado na planilha.");
 if(values.length>3000)throw Error("Importe até 3.000 pilares por arquivo.");
 const duplicateInfo=new Set(values).size;
 if(!confirm(`Importar ${values.length} pilares para esta obra? Nomes repetidos serão preservados como registros independentes (${duplicateInfo} nomes distintos).`))return;
 busy(true,`Importando ${values.length} pilares...`);
 try{
  const batch=150;
  for(let i=0;i<values.length;i+=batch){
   const payload=values.slice(i,i+batch).map(nome=>({obra_id:state.currentWorkId,nome}));
   const {error}=await sb.from("cc_pilares").insert(payload);
   if(error)throw Error(`Importação interrompida após ${i} linhas. ${error.message}. Verifique a lista antes de tentar novamente para evitar duplicação.`);
  }
  $("importFile").value="";msg(`${values.length} pilares importados com sucesso.`);await loadAll(true);
 }finally{busy(false);}
}
function guarded(fn){return async (...args)=>{try{await fn(...args);}catch(e){console.error(e);msg(e.message||"Erro na operação.",true);alert(e.message||"Erro na operação.");}};}
async function boot(){if(await authGuard())await loadAll();}
$("loginForm").addEventListener("submit",guarded(async e=>{
 e.preventDefault();$("loginError").textContent="";
 try{await SiloSupabase.signIn($("loginEmail").value.trim(),$("loginPassword").value);await boot();}
 catch(err){$("loginError").textContent=err.message||"Não foi possível entrar.";throw err;}
}));
$("logoutBtn").addEventListener("click",guarded(async()=>{await SiloSupabase.signOut();location.replace("index.html");}));
$("newWorkBtn").addEventListener("click",()=>openWorkEditor());
$("newRecordBtn").addEventListener("click",()=>openRecord());
$("searchWork").addEventListener("input",render);
$("workForm").addEventListener("submit",guarded(saveWork));
$("pillarForm").addEventListener("submit",guarded(addPillar));
$("recordForm").addEventListener("submit",guarded(saveExecution));
$("recordWork").addEventListener("change",()=>fillRecordPillars($("recordWork").value));
$("importBtn").addEventListener("click",guarded(importExcel));
$("pillarStatusFilter").addEventListener("change",renderPillars);
$("pillarSearch").addEventListener("input",renderPillars);
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>closeDialog(b.dataset.close)));
$("worksGrid").addEventListener("click",guarded(async e=>{
 const b=e.target.closest("button[data-action]");if(!b)return;
 const id=b.dataset.id;
 switch(b.dataset.action){
  case "open":openPillars(id);break;
  case "register":openRecord(id);break;
  case "edit-work":openWorkEditor(state.works.find(w=>w.id===id));break;
  case "delete-work":await deleteWork(id);break;
 }
}));
$("pillarsBody").addEventListener("click",guarded(async e=>{
 const b=e.target.closest("button[data-action]");if(!b)return;
 const id=b.dataset.id;
 switch(b.dataset.action){
  case "new-execution":case "edit-execution":openRecord(state.currentWorkId,id);break;
  case "remove-execution":await removeExecution(id);break;
  case "edit-pillar":await editPillarName(id);break;
  case "remove-pillar":await deletePillar(id);break;
 }
}));
boot().catch(e=>{console.error(e);$("loginError").textContent=e.message||"Erro de autenticação.";});
})();
