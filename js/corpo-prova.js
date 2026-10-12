(() => {
"use strict";
const $=id=>document.getElementById(id);
const state={user:null,profile:null,permission:"none",moldagens:[],corpos:[],rompimentos:[],selectedMoldagem:null,selectedCp:null};
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
 return true
}
async function loadData(){
 loading("Carregando corpos de prova...");
 try{
  const [m,c,r]=await Promise.all([
   supabaseClient.from("cp_moldagens").select("*").order("data_moldagem",{ascending:false}).order("created_at",{ascending:false}),
   supabaseClient.from("cp_corpos_prova").select("*").order("created_at",{ascending:true}),
   supabaseClient.from("cp_rompimentos").select("*").order("data_rompimento",{ascending:true})
  ]);
  if(m.error)throw m.error;if(c.error)throw c.error;if(r.error)throw r.error;
  state.moldagens=m.data||[];state.corpos=c.data||[];state.rompimentos=r.data||[];
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
 const rows=state.moldagens.filter(m=>(!tipo||m.tipo_peca===tipo)&&(!q||`${m.tipo_peca} ${m.tipo_outro||""} ${m.identificacao||""}`.toLowerCase().includes(q)));
 $("moldagensBody").innerHTML=rows.map(m=>{
  const cps=state.corpos.filter(c=>c.moldagem_id===m.id);
  const results=state.rompimentos.filter(r=>cps.some(c=>c.id===r.corpo_prova_id)).sort((a,b)=>String(b.data_rompimento).localeCompare(String(a.data_rompimento)));
  const last=results[0];
  return `<tr><td>${brDate(m.data_moldagem)}</td><td>${escapeHtml(m.tipo_peca==="Outro"?(m.tipo_outro||"Outro"):m.tipo_peca)}</td><td>${escapeHtml(m.identificacao||"—")}</td><td>${cps.length}</td><td>${last?`${mpav(last.resistencia_mpa)} <small>(${brDate(last.data_rompimento)})</small>`:"—"}</td><td><button class="btn secondary cp-open" data-id="${m.id}">Abrir</button></td></tr>`
 }).join("");
 $("emptyState").classList.toggle("hidden",rows.length>0);
 document.querySelectorAll(".cp-open").forEach(b=>b.addEventListener("click",()=>openDetail(b.dataset.id)));
}
function openMoldagem(){ $("moldagemForm").reset();$("dataMoldagem").value=today();$("moldagemError").textContent="";$("moldagemDialog").showModal() }
async function createMoldagem(e){
 e.preventDefault();if(!isAdmin())return;
 const payload={tipo_peca:$("tipoPeca").value,tipo_outro:$("tipoPeca").value==="Outro"?$("tipoOutro").value.trim():null,data_moldagem:$("dataMoldagem").value,identificacao:$("identificacao").value.trim()||null,observacoes:$("observacoes").value.trim()||null,created_by:state.user.id};
 try{loading("Salvando moldagem...");const {error}=await supabaseClient.from("cp_moldagens").insert(payload);if(error)throw error;$("moldagemDialog").close();message("Moldagem cadastrada.","success");await loadData()}
 catch(e){$("moldagemError").textContent=e.message||"Não foi possível salvar a moldagem."}finally{hideLoading()}
}
async function openDetail(id){
 state.selectedMoldagem=state.moldagens.find(m=>m.id===id);if(!state.selectedMoldagem)return;
 renderDetail();$("detailDialog").showModal();
}
function renderDetail(){
 const m=state.selectedMoldagem,cps=state.corpos.filter(c=>c.moldagem_id===m.id);
 $("detailTitle").textContent=`${m.tipo_peca==="Outro"?(m.tipo_outro||"Outro"):m.tipo_peca} · ${brDate(m.data_moldagem)}`;
 $("detailSubtitle").textContent=[m.identificacao,m.observacoes].filter(Boolean).join(" — ");
 let out=`<div class="cp-detail-toolbar">${isAdmin()?'<button id="addCpBtn" class="btn primary">+ Adicionar corpo de prova</button>':""}</div>`;
 if(!cps.length)out+='<div class="cp-empty">Nenhum corpo de prova cadastrado nesta moldagem.</div>';
 for(const cp of cps){
  const tests=state.rompimentos.filter(r=>r.corpo_prova_id===cp.id).sort((a,b)=>String(a.data_rompimento).localeCompare(String(b.data_rompimento)));
  out+=`<article class="cp-body-card"><div class="cp-body-head"><div><strong>${escapeHtml(cp.codigo)}</strong><small>${escapeHtml(cp.observacoes||"Sem observações")}</small></div>${isAdmin()?`<button class="btn secondary add-test" data-id="${cp.id}" data-code="${escapeHtml(cp.codigo)}">+ Registrar rompimento</button>`:""}</div>`;
  if(!tests.length)out+='<p class="cp-no-test">Nenhum rompimento registrado.</p>';
  else{
   out+='<div class="cp-table-wrap"><table class="cp-table"><thead><tr><th>Data</th><th>Idade (dias)</th><th>Resistência</th><th>Observações</th></tr></thead><tbody>';
   for(const r of tests){const age=Math.floor((new Date(`${r.data_rompimento}T00:00:00`)-new Date(`${m.data_moldagem}T00:00:00`))/86400000);out+=`<tr><td>${brDate(r.data_rompimento)}</td><td>${age}</td><td><strong>${mpav(r.resistencia_mpa)}</strong></td><td>${escapeHtml(r.observacoes||"—")}</td></tr>`}
   out+='</tbody></table></div>';
   if(tests.length>=2)out+=`<div class="cp-chart"><div class="cp-chart-title">Evolução da resistência</div>${renderChart(tests,m.data_moldagem)}</div>`;
  }
  out+='</article>';
 }
 $("detailContent").innerHTML=out;
 $("addCpBtn")?.addEventListener("click",()=>{$("cpForm").reset();$("cpError").textContent="";$("cpDialog").showModal()});
 document.querySelectorAll(".add-test").forEach(b=>b.addEventListener("click",()=>{state.selectedCp=b.dataset.id;$("rompimentoCpLabel").textContent=`Corpo de prova ${b.dataset.code}`;$("rompimentoForm").reset();$("dataRompimento").value=today();$("rompimentoError").textContent="";$("rompimentoDialog").showModal()}));
}
function renderChart(tests,moldDate){
 const vals=tests.map(t=>({age:Math.max(0,Math.floor((new Date(`${t.data_rompimento}T00:00:00`)-new Date(`${moldDate}T00:00:00`))/86400000)),mpa:Number(t.resistencia_mpa)})).sort((a,b)=>a.age-b.age);
 const max=Math.max(...vals.map(v=>v.mpa),1),w=560,h=180,p=28;
 const pts=vals.map(v=>`${p+v.age/(Math.max(...vals.map(x=>x.age),1))*(w-p*2)},${h-p-v.mpa/max*(h-p*2)}`).join(" ");
 return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Curva de resistência por idade"><line x1="${p}" y1="${h-p}" x2="${w-p}" y2="${h-p}" stroke="#cbd5e1"/><line x1="${p}" y1="${p}" x2="${p}" y2="${h-p}" stroke="#cbd5e1"/><polyline points="${pts}" fill="none" stroke="#0e8a91" stroke-width="3" stroke-linejoin="round"/>${vals.map(v=>{const x=p+v.age/(Math.max(...vals.map(x=>x.age),1))*(w-p*2),y=h-p-v.mpa/max*(h-p*2);return `<circle cx="${x}" cy="${y}" r="4" fill="#0e8a91"><title>${v.age} dias: ${v.mpa} MPa</title></circle>`}).join("")}<text x="${w/2}" y="${h-4}" font-size="11" text-anchor="middle" fill="#64748b">Idade do concreto (dias)</text><text x="12" y="${h/2}" font-size="11" text-anchor="middle" fill="#64748b" transform="rotate(-90 12 ${h/2})">MPa</text></svg>`;
}
async function createCp(e){
 e.preventDefault();if(!isAdmin()||!state.selectedMoldagem)return;
 try{loading("Salvando corpo de prova...");const {error}=await supabaseClient.from("cp_corpos_prova").insert({moldagem_id:state.selectedMoldagem.id,codigo:$("cpCodigo").value.trim(),observacoes:$("cpObs").value.trim()||null,created_by:state.user.id});if(error)throw error;$("cpDialog").close();message("Corpo de prova adicionado.","success");await loadData();renderDetail()}
 catch(e){$("cpError").textContent=e.message||"Não foi possível salvar o corpo de prova."}finally{hideLoading()}
}
async function createRompimento(e){
 e.preventDefault();if(!isAdmin()||!state.selectedCp)return;
 const data=$("dataRompimento").value,res=Number(String($("resistencia").value).replace(",","."));const cp=state.corpos.find(c=>c.id===state.selectedCp);const mold=state.moldagens.find(m=>m.id===cp?.moldagem_id);
 if(!mold||data<mold.data_moldagem){$("rompimentoError").textContent="A data do rompimento não pode ser anterior à moldagem.";return}
 if(state.rompimentos.some(r=>r.corpo_prova_id===state.selectedCp)){$("rompimentoError").textContent="Este corpo de prova já possui um rompimento. Cadastre outro corpo de prova para um novo ensaio.";return}
 try{loading("Salvando rompimento...");const {error}=await supabaseClient.from("cp_rompimentos").insert({corpo_prova_id:state.selectedCp,data_rompimento:data,resistencia_mpa:res,observacoes:$("rompimentoObs").value.trim()||null,created_by:state.user.id});if(error)throw error;$("rompimentoDialog").close();message("Rompimento registrado.","success");await loadData();renderDetail()}
 catch(e){$("rompimentoError").textContent=e.message||"Não foi possível registrar o rompimento."}finally{hideLoading()}
}
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();$("loginError").textContent="";try{const {error}=await supabaseClient.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});if(error)throw error;await boot()}catch(e){$("loginError").textContent=e.message||"Falha no login."}});
$("logoutBtn").addEventListener("click",async()=>{await SiloSupabase.signOut();location.replace("index.html")});
$("newMoldagemBtn").addEventListener("click",openMoldagem);
$("moldagemForm").addEventListener("submit",createMoldagem);$("cpForm").addEventListener("submit",createCp);$("rompimentoForm").addEventListener("submit",createRompimento);
$("searchInput").addEventListener("input",render);$("tipoFilter").addEventListener("change",render);
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>$(b.dataset.close).close()));
$("tipoPeca").addEventListener("change",()=>$("tipoOutro").disabled=$("tipoPeca").value!=="Outro");
async function boot(){try{if(await guard())await loadData()}catch(e){console.error(e);$("loginScreen").classList.remove("hidden");$("loginError").textContent=e.message||"Não foi possível iniciar o módulo."}}
$("tipoOutro").disabled=true;boot();
})();