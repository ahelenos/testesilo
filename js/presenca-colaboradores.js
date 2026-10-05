const APP_VERSION = "5.1.12";
(() => {
"use strict";
const $=id=>document.getElementById(id);
const sb=window.supabaseClient || window.supabase;
let user=null;
let isGlobalAdmin=false;
let modulePermission="viewer";
let collaborators=[];
let editingId=null;

const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const isMobileView=()=>window.matchMedia("(max-width: 650px)").matches;
const isAdmin=()=>isGlobalAdmin || modulePermission==="admin";
const canEdit=()=>isAdmin() && !isMobileView();

function setMessage(text="",type=""){
  const el=$("collaboratorMessage");
  el.textContent=text;
  el.className=`presence-message standalone ${type}`;
}
function setLoading(text="Carregando..."){window.AppLoading?.show(text)}
function clearLoading(){window.AppLoading?.hide()}
function formatDate(v){
  if(!v)return "—";
  const d=new Date(v);
  return Number.isNaN(d.getTime())?"—":d.toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});
}

async function checkAccess(){
  user=await window.SiloSupabase.getUser();
  if(!user){location.href="index.html";return false}
  $("userEmail").textContent=user.email||"";
  try{
    const {data,error}=await sb.rpc("is_global_admin");
    if(!error)isGlobalAdmin=data===true;
  }catch(_){}
  try{modulePermission=await window.SiloSupabase.getModulePermission("presenca",user)}
  catch(_){modulePermission=isGlobalAdmin?"admin":"viewer"}
  const mobileReadOnly=isMobileView();
  $("roleLabel").textContent=(!mobileReadOnly && isAdmin())?"ADMIN":"VISUALIZAÇÃO";
  if(!isAdmin()){
    location.href="presenca.html";
    return false;
  }
  if(mobileReadOnly){
    document.body.classList.add("mobile-readonly");
    document.querySelectorAll(".admin-only").forEach(el=>el.remove());
  }

  return true;
}

async function loadCollaborators(){
  setLoading("Carregando colaboradores...");
  try{
    const {data,error}=await sb.from("presenca_colaboradores")
      .select("id,nome,ativo,created_at,updated_at")
      .order("nome",{ascending:true});
    if(error)throw error;
    collaborators=data||[];
    render();
  }catch(error){
    console.error(error);
    setMessage(error.message||"Não foi possível carregar os colaboradores.","error");
  }finally{clearLoading()}
}

function render(){
  const q=$("collaboratorSearch").value.trim().toLowerCase();
  const includeInactive=$("showInactive").checked;
  const visible=collaborators.filter(c=>{
    const match=!q||String(c.nome||"").toLowerCase().includes(q);
    return match&&(includeInactive||c.ativo!==false);
  });
  $("collaboratorsCount").textContent=`${visible.length} colaborador${visible.length===1?"":"es"}`;
  $("emptyCollaborators").classList.toggle("hidden",visible.length!==0);
  $("collaboratorsBody").innerHTML=visible.map(c=>`
    <tr class="${c.ativo===false?"inactive-row":""}">
      <td><strong>${esc(c.nome)}</strong></td>
      <td><span class="presence-status ${c.ativo?"active":"inactive"}">${c.ativo?"Ativo":"Inativo"}</span></td>
      <td>${esc(formatDate(c.created_at))}</td>
      <td>${esc(formatDate(c.updated_at))}</td>
      <td>${canEdit()?`<button class="tiny" data-edit="${esc(c.id)}" type="button">Editar</button>`:""}</td>
    </tr>
  `).join("");
  document.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>openEditor(b.dataset.edit)));
}

function openNew(){
  editingId=null;
  $("dialogTitle").textContent="Novo colaborador";
  $("collaboratorName").value="";
  $("collaboratorActive").value="true";
  $("collaboratorError").textContent="";
  $("collaboratorDialog").showModal();
  $("collaboratorName").focus();
}
function openEditor(id){
  const c=collaborators.find(x=>String(x.id)===String(id));
  if(!c)return;
  editingId=c.id;
  $("dialogTitle").textContent="Editar colaborador";
  $("collaboratorName").value=c.nome||"";
  $("collaboratorActive").value=String(c.ativo!==false);
  $("collaboratorError").textContent="";
  $("collaboratorDialog").showModal();
  $("collaboratorName").focus();
}

async function saveCollaborator(event){
  event.preventDefault();
  if(!canEdit())return;
  const nome=$("collaboratorName").value.trim();
  if(!nome){
    $("collaboratorError").textContent="Informe o nome do colaborador.";
    return;
  }
  const ativo=$("collaboratorActive").value==="true";
  $("saveCollaborator").disabled=true;
  $("collaboratorError").textContent="";
  setLoading(editingId?"Salvando alterações...":"Cadastrando colaborador...");
  try{
    if(editingId){
      const {error}=await sb.from("presenca_colaboradores").update({nome,ativo}).eq("id",editingId);
      if(error)throw error;
      setMessage("Colaborador atualizado com sucesso.","success");
    }else{
      const {error}=await sb.from("presenca_colaboradores").insert({nome,ativo});
      if(error){
        if(error.code==="23505")throw new Error("COLABORADOR JÁ CADASTRADO.");
        throw error;
      }
      setMessage("Colaborador cadastrado com sucesso.","success");
    }
    $("collaboratorDialog").close();
    await loadCollaborators();
  }catch(error){
    console.error(error);
    $("collaboratorError").textContent=error.message||"Não foi possível salvar o colaborador.";
  }finally{
    $("saveCollaborator").disabled=false;
    clearLoading();
  }
}

async function boot(){
  try{
    if(!await checkAccess())return;
    $("newCollaboratorBtn")?.addEventListener("click",openNew);
    $("refreshCollaborators").addEventListener("click",loadCollaborators);
    $("collaboratorSearch").addEventListener("input",render);
    $("showInactive").addEventListener("change",render);
    $("collaboratorForm").addEventListener("submit",saveCollaborator);
    $("closeDialog").addEventListener("click",()=>$("collaboratorDialog").close());
    $("cancelDialog").addEventListener("click",()=>$("collaboratorDialog").close());
    $("collaboratorDialog").addEventListener("click",e=>{if(e.target.id==="collaboratorDialog")$("collaboratorDialog").close()});
    $("logoutBtn").addEventListener("click",async()=>{await window.SiloSupabase.signOut();location.href="index.html"});
    await loadCollaborators();
  }catch(error){
    console.error(error);
    location.href="index.html";
  }
}
window.addEventListener("resize",()=>{
  const mobile=isMobileView();
  document.body.classList.toggle("mobile-readonly",mobile);
  if(mobile){
    document.querySelectorAll(".admin-only").forEach(el=>el.style.display="none");
  }else if(canEdit()){
    document.querySelectorAll(".admin-only").forEach(el=>el.style.display="");
  }
});
boot();
})();
