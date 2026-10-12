(() => {
"use strict";
const $=id=>document.getElementById(id);
const state={user:null,profile:null,permission:"none",moldagens:[],corpos:[],rompimentos:[],tipos:[],selectedMoldagem:null,selectedCp:null};
const isAdmin=()=>state.permission==="admin";
const escapeHtml=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
const brDate=v=>v?new Date(`${v}T00:00:00`).toLocaleDateString("pt-BR"):"—";
const mpav=v=>Number(v).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+" MPa";
function message(text,type=""){const el=$("cpMessage");el.textContent=text;el.className="cp-message "+type}
function loading(text){$("globalLoadingText").textContent=text;$("globalLoading").classList.remove("hidden")}
function hideLoading(){$("globalLoading").classList.add("hidden")}
function canAccess(){return ["admin","viewer"].includes(state.permission)}
async function guard(){
 state.user=await SiloSupabase.getUser();
 if(!state.user){$("loginScreen").classList.remove("hidden");$("appScreen").classList.add("hidden");return false}
 state.profile=await SiloSupabase.getProfile(state.user);
 if(!state.profile||state.profile.active===false){await SiloSupabase.signOut();$("loginScreen").classList.remove("hidden");return false}
 // Para este módulo novo, ausência de configuração significa Sem acesso.
 const {data:isGlobalAdmin,error:adminCheckError}=await supabaseClient.rpc("is_global_admin");
 if(!adminCheckError && isGlobalAdmin===true) state.permission="admin";
 else {
   const permissions=await SiloSupabase.getModulePermissions(state.user);
   state.permission=String(permissions.corpo_prova||"none").toLowerCase();
 }
 if(!canAccess()){location.replace("index.html");return false}
 $("userRole").textContent=state.permission==="admin"?"ADMINISTRAR":"VISUALIZAÇÃO";
 $("userEmail").textContent=state.user.email||"";
 $("loginScreen").classList.add("hidden");$("appScreen").classList.remove("hidden");
 $("newMoldagemBtn").classList.toggle("hidden",!isAdmin());
 $("manageTypesBtn").classList.toggle("hidden",!isAdmin());
 return true
}
async function loadData(){
 loading("Carregando corpos de prova...");
 try{
  const [m,c,r,t]=await Promise.all([
   supabaseClient.from("cp_moldagens").select("*").order("data_moldagem",{ascending:false}).order("created_at",{ascending:false}),
   supabaseClient.from("cp_corpos_prova").select("*").order("created_at",{ascending:true}),
   supabaseClient.from("cp_rompimentos").select("*").order("data_rompimento",{ascending:true}),
   supabaseClient.from("cp_tipos_peca").select("*").order("nome",{ascending:true})
  ]);
  if(m.error)throw m.error;if(c.error)throw c.error;if(r.error)throw r.error;if(t.error)throw t.error;
  state.moldagens=m.data||[];state.corpos=c.data||[];state.rompimentos=r.data||[];state.tipos=t.data||[];
  refreshTypeOptions();
  render();
 }catch(e){console.error(e);message(e.message||"Não foi possível carregar os registros.","error")}
 finally{hideLoading()}
}
function render(){
 $("kpiMoldagens").textContent=state.moldagens.length;
 $("kpiCps").textContent=state.corpos.length;
 $("kpiRompimentos").textContent=state.rompimentos.length;
 const latest=[...state.rompimentos].sort((a,b)=>String(b.data_rompimento).localeCompare(String(a.data_rompimento)))[0];
 $("kpiUltima").textContent=latest?mpav(latest.resistencia_mpa):"—";
 const q=$("searchInput").value.trim().toLowerCase(),tipo=$("tipoFilter").value;
 const typeName=m=>state.tipos.find(t=>t.id===m.tipo_peca_id)?.nome || m.tipo_peca || "Tipo removido";
 const rows=state.moldagens.filter(m=>(!tipo||m.tipo_peca_id===tipo)&&(!q||`${typeName(m)} ${m.tipo_outro||""} ${m.identificacao||""}`.toLowerCase().includes(q)));
 $("moldagensBody").innerHTML=rows.map(m=>{
  const cps=state.corpos.filter(c=>c.moldagem_id===m.id);
  const results=state.rompimentos.filter(r=>cps.some(c=>c.id===r.corpo_prova_id)).sort((a,b)=>String(b.data_rompimento).localeCompare(String(a.data_rompimento)));
  const last=results[0];
  return `<tr><td>${brDate(m.data_moldagem)}</td><td>${escapeHtml(typeName(m))}</td><td>${escapeHtml(m.identificacao||"—")}</td><td>${cps.length}</td><td>${last?`${mpav(last.resistencia_mpa)} <small>(${brDate(last.data_rompimento)})</small>`:"—"}</td><td><button class="btn secondary cp-open" data-id="${m.id}">Abrir</button></td></tr>`
 }).join("");
 $("emptyState").classList.toggle("hidden",rows.length>0);
 document.querySelectorAll(".cp-open").forEach(b=>b.addEventListener("click",()=>openDetail(b.dataset.id)));
}
function refreshTypeOptions(){
 const active=state.tipos.filter(t=>t.ativo);
 const current=$("tipoPeca").value,filter=$("tipoFilter").value;
 $("tipoPeca").innerHTML='<option value="">Selecione</option>'+active.map(t=>`<option value="${t.id}">${escapeHtml(t.nome)}</option>`).join("");
 $("tipoFilter").innerHTML='<option value="">Todos os tipos</option>'+state.tipos.map(t=>`<option value="${t.id}">${escapeHtml(t.nome)}${t.ativo?"":" (inativo)"}</option>`).join("");
 if(active.some(t=>t.id===current))$("tipoPeca").value=current;
 if(state.tipos.some(t=>t.id===filter))$("tipoFilter").value=filter;
}
function openMoldagem(){
 refreshTypeOptions();
 $("moldagemForm").reset();$("dataMoldagem").value=today();$("moldagemError").textContent="";
 $("moldagemDialog").showModal();
 if(!state.tipos.some(t=>t.ativo)){$("moldagemError").textContent="Cadastre ou ative pelo menos um tipo de peça antes de criar uma moldagem.";return}
}
async function createMoldagem(e){
 e.preventDefault();if(!isAdmin())return;
 const selected=state.tipos.find(t=>t.id===$("tipoPeca").value&&t.ativo);
 if(!selected){$("moldagemError").textContent="Selecione um tipo de peça ativo.";return}
 const payload={tipo_peca:selected.nome,tipo_peca_id:selected.id,tipo_outro:null,data_moldagem:$("dataMoldagem").value,identificacao:$("identificacao").value.trim()||null,observacoes:$("observacoes").value.trim()||null,created_by:state.user.id};
 try{loading("Salvando moldagem...");const {error}=await supabaseClient.from("cp_moldagens").insert(payload);if(error)throw error;$("moldagemDialog").close();message("Moldagem cadastrada.","success");await loadData()}
 catch(e){$("moldagemError").textContent=e.message||"Não foi possível salvar a moldagem."}finally{hideLoading()}
}
async function openDetail(id){
 state.selectedMoldagem=state.moldagens.find(m=>m.id===id);if(!state.selectedMoldagem)return;
 renderDetail();$("detailDialog").showModal();
}
function renderDetail(){
 const m=state.selectedMoldagem,cps=state.corpos.filter(c=>c.moldagem_id===m.id);
 const currentType=state.tipos.find(t=>t.id===m.tipo_peca_id)?.nome || m.tipo_peca || "Tipo removido";
 $("detailTitle").textContent=`${currentType} · ${brDate(m.data_moldagem)}`;
 $("detailSubtitle").textContent=[m.identificacao,m.observacoes].filter(Boolean).join(" — ");
 let out=`<div class="cp-detail-toolbar">${isAdmin()?'<button id="addTestDirectBtn" class="btn primary">+ Registrar rompimento</button>':""}</div>`;
 if(!cps.length)out+='<div class="cp-empty">Nenhum rompimento registrado nesta moldagem.</div>';
 const allTests=state.rompimentos.filter(r=>cps.some(c=>c.id===r.corpo_prova_id)).sort((a,b)=>String(a.data_rompimento).localeCompare(String(b.data_rompimento)));
 if(allTests.length){
   out+='<div class="cp-table-wrap"><table class="cp-table"><thead><tr><th>Corpo de prova</th><th>Data</th><th>Idade (dias)</th><th>Resistência</th><th>Tipo de ruptura</th><th>Observações</th></tr></thead><tbody>';
   for(const r of allTests){
     const cp=cps.find(c=>c.id===r.corpo_prova_id);
     const age=Math.floor((new Date(`${r.data_rompimento}T00:00:00`)-new Date(`${m.data_moldagem}T00:00:00`))/86400000);
     const labels={A:"Cônica e cônica afastada do capeamento",B:"Cônica e bipartida / múltiplas partições",C:"Colunar com formação de cones",D:"Cônica e cisalhada",E:"Cisalhada",F:"Fraturas no topo e/ou na base abaixo do capeamento",G:"Fraturas próximas ao topo"};
     const ruptureLabel=r.tipo_ruptura?`${r.tipo_ruptura} — ${labels[r.tipo_ruptura]||""}`:"Não informado";
     out+=`<tr><td>${escapeHtml(cp?.codigo||"CP")}</td><td>${brDate(r.data_rompimento)}</td><td>${age}</td><td><strong>${mpav(r.resistencia_mpa)}</strong></td><td>${escapeHtml(ruptureLabel)}</td><td>${escapeHtml(r.observacoes||"—")}</td></tr>`;
   }
   out+='</tbody></table></div>';
   if(allTests.length>=2)out+=`<div class="cp-chart"><div class="cp-chart-title">Evolução da resistência</div>${renderChart(allTests,m.data_moldagem)}</div>`;
 }
 $("detailContent").innerHTML=out;
 $("addTestDirectBtn")?.addEventListener("click",()=>{
   state.selectedCp=null;
   $("rompimentoCpLabel").textContent="O sistema identificará o corpo de prova automaticamente";
   $("rompimentoForm").reset();$("dataRompimento").value=today();$("rompimentoError").textContent="";
   $("rompimentoDialog").showModal()
 });
}
function renderChart(tests,moldDate){
 const vals=tests.map(t=>({age:Math.max(0,Math.floor((new Date(`${t.data_rompimento}T00:00:00`)-new Date(`${moldDate}T00:00:00`))/86400000)),mpa:Number(t.resistencia_mpa)})).sort((a,b)=>a.age-b.age);
 const max=Math.max(...vals.map(v=>v.mpa),1),w=560,h=180,p=28;
 const pts=vals.map(v=>`${p+v.age/(Math.max(...vals.map(x=>x.age),1))*(w-p*2)},${h-p-v.mpa/max*(h-p*2)}`).join(" ");
 return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Curva de resistência por idade"><line x1="${p}" y1="${h-p}" x2="${w-p}" y2="${h-p}" stroke="#cbd5e1"/><line x1="${p}" y1="${p}" x2="${p}" y2="${h-p}" stroke="#cbd5e1"/><polyline points="${pts}" fill="none" stroke="#0e8a91" stroke-width="3" stroke-linejoin="round"/>${vals.map(v=>{const x=p+v.age/(Math.max(...vals.map(x=>x.age),1))*(w-p*2),y=h-p-v.mpa/max*(h-p*2);return `<circle cx="${x}" cy="${y}" r="4" fill="#0e8a91"><title>${v.age} dias: ${v.mpa} MPa</title></circle>`}).join("")}<text x="${w/2}" y="${h-4}" font-size="11" text-anchor="middle" fill="#64748b">Idade do concreto (dias)</text><text x="12" y="${h/2}" font-size="11" text-anchor="middle" fill="#64748b" transform="rotate(-90 12 ${h/2})">MPa</text></svg>`;
}
async function createRompimento(e){
 e.preventDefault();if(!isAdmin()||!state.selectedMoldagem)return;
 const data=$("dataRompimento").value,res=Number(String($("resistencia").value).replace(",",".")),mold=state.selectedMoldagem;
 if(data<mold.data_moldagem){$("rompimentoError").textContent="A data do rompimento não pode ser anterior à moldagem.";return}
 if(!Number.isFinite(res)||res<=0){$("rompimentoError").textContent="Informe uma resistência válida em MPa.";return}
 let cpId=state.selectedCp,createdCpId=null;
 try{
  loading("Salvando rompimento...");
  if(cpId){
    if(state.rompimentos.some(r=>r.corpo_prova_id===cpId)){
      $("rompimentoError").textContent="Este corpo de prova já possui um rompimento. Cada corpo de prova é rompido uma única vez.";
      return;
    }
  } else {
    const existing=state.corpos.filter(c=>c.moldagem_id===mold.id);
    const nextNum=existing.reduce((max,c)=>{
      const match=String(c.codigo||"").match(/^(?:CP-?)?(\d+)$/i);
      return match?Math.max(max,Number(match[1])):max;
    },0)+1;
    const code=`CP-${String(nextNum).padStart(3,"0")}`;
    const {data:created,error:cpError}=await supabaseClient.from("cp_corpos_prova").insert({
      moldagem_id:mold.id,codigo:code,observacoes:null,created_by:state.user.id
    }).select("id").single();
    if(cpError)throw cpError;
    cpId=created.id;createdCpId=created.id;
  }
  const payload={
    corpo_prova_id:cpId,
    data_rompimento:data,
    resistencia_mpa:res,
    tipo_ruptura:$("tipoRuptura").value||null,
    observacoes:$("rompimentoObs").value.trim()||null,
    created_by:state.user.id
  };
  const {error}=await supabaseClient.from("cp_rompimentos").insert(payload);
  if(error){
    if(createdCpId) await supabaseClient.from("cp_corpos_prova").delete().eq("id",createdCpId);
    throw error;
  }
  $("rompimentoDialog").close();message("Rompimento registrado. A identificação do corpo de prova foi gerada automaticamente.","success");
  await loadData();renderDetail();
 }catch(e){$("rompimentoError").textContent=e.message||"Não foi possível registrar o rompimento."}
 finally{hideLoading()}
}
function openTypes(){
 if(!isAdmin())return;
 resetTypeForm();renderTypes();$("typesDialog").showModal();
}
function resetTypeForm(){
 $("typeForm").reset();$("typeId").value="";$("typeError").textContent="";$("saveTypeBtn").textContent="Adicionar tipo";
}
function renderTypes(){
 $("typesBody").innerHTML=state.tipos.map(t=>`<tr><td>${escapeHtml(t.nome)}</td><td>${t.ativo?'<span class="cp-type-status active">Ativo</span>':'<span class="cp-type-status inactive">Inativo</span>'}</td><td><div class="cp-type-actions"><button type="button" class="btn secondary edit-type" data-id="${t.id}">Editar</button><button type="button" class="btn secondary toggle-type" data-id="${t.id}" data-active="${t.ativo?"true":"false"}">${t.ativo?"Desativar":"Ativar"}</button></div></td></tr>`).join("");
 $("typesEmpty").classList.toggle("hidden",state.tipos.length>0);
 document.querySelectorAll(".edit-type").forEach(b=>b.addEventListener("click",()=>{
  const t=state.tipos.find(x=>x.id===b.dataset.id);if(!t)return;
  $("typeId").value=t.id;$("typeName").value=t.nome;$("typeError").textContent="";$("saveTypeBtn").textContent="Salvar alterações";
 }));
 document.querySelectorAll(".toggle-type").forEach(b=>b.addEventListener("click",()=>toggleType(b.dataset.id,b.dataset.active==="true")));
}
async function saveType(e){
 e.preventDefault();if(!isAdmin())return;
 const id=$("typeId").value, nome=$("typeName").value.trim();
 if(!nome){$("typeError").textContent="Informe o nome do tipo de peça.";return}
 try{
  $("saveTypeBtn").disabled=true;loading(id?"Atualizando tipo de peça...":"Adicionando tipo de peça...");
  let result;
  if(id) result=await supabaseClient.from("cp_tipos_peca").update({nome,updated_at:new Date().toISOString()}).eq("id",id);
  else result=await supabaseClient.from("cp_tipos_peca").insert({nome,ativo:true,created_by:state.user.id});
  if(result.error)throw result.error;
  await loadData();resetTypeForm();renderTypes();message(id?"Tipo de peça atualizado.":"Tipo de peça adicionado.","success");
 }catch(e){$("typeError").textContent=/duplicate|unique/i.test(e.message||"")?"Já existe um tipo de peça com esse nome.":(e.message||"Não foi possível salvar o tipo.")}
 finally{$("saveTypeBtn").disabled=false;hideLoading()}
}
async function toggleType(id,wasActive){
 if(!isAdmin())return;
 const t=state.tipos.find(x=>x.id===id);if(!t)return;
 const action=wasActive?"desativar":"ativar";
 if(!confirm(`Deseja ${action} o tipo "${t.nome}"? Moldagens existentes serão preservadas.`))return;
 try{
  loading(wasActive?"Desativando tipo...":"Ativando tipo...");
  const {error}=await supabaseClient.from("cp_tipos_peca").update({ativo:!wasActive,updated_at:new Date().toISOString()}).eq("id",id);
  if(error)throw error;
  await loadData();renderTypes();message(`Tipo "${t.nome}" ${wasActive?"desativado":"ativado"}.`,"success");
 }catch(e){message(e.message||"Não foi possível alterar o tipo.","error")}finally{hideLoading()}
}
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();$("loginError").textContent="";try{const {error}=await supabaseClient.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});if(error)throw error;await boot()}catch(e){$("loginError").textContent=e.message||"Falha no login."}});
$("logoutBtn").addEventListener("click",async()=>{await SiloSupabase.signOut();location.replace("index.html")});
$("newMoldagemBtn").addEventListener("click",openMoldagem);
$("manageTypesBtn").addEventListener("click",openTypes);
$("typeForm").addEventListener("submit",saveType);
$("viewRuptureTypesBtn").addEventListener("click",()=>$("ruptureGuideDialog").showModal());
$("cancelTypeEdit").addEventListener("click",resetTypeForm);
$("moldagemForm").addEventListener("submit",createMoldagem);$("rompimentoForm").addEventListener("submit",createRompimento);
$("searchInput").addEventListener("input",render);$("tipoFilter").addEventListener("change",render);
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>$(b.dataset.close).close()));
$("tipoPeca").addEventListener("change",()=>$("tipoOutro").disabled=$("tipoPeca").value!=="Outro");
async function boot(){try{if(await guard())await loadData()}catch(e){console.error(e);$("loginScreen").classList.remove("hidden");$("loginError").textContent=e.message||"Não foi possível iniciar o módulo."}}
boot();
})();