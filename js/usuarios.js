
const APP_VERSION = "5.1.12";

(() => {
"use strict";

const $ = id => document.getElementById(id);
let allUsers = [];
let selectedUser = null;

function escapeHtml(value){
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[ch]));
}

function permissionText(value){
  return String(value).toLowerCase()==="admin" ? "Administrar" : "Visualizar";
}

function pill(value, type){
  return `<span class="access-pill ${type}">${escapeHtml(value)}</span>`;
}



function showGlobalLoading(text="Carregando..."){
  const overlay=$("globalLoading");
  if(!overlay) return;
  $("globalLoadingText").textContent=text;
  overlay.classList.remove("hidden");
}

function hideGlobalLoading(){
  const overlay=$("globalLoading");
  if(!overlay) return;
  overlay.classList.add("hidden");
}

function setMessage(text="", type=""){
  const el=$("usersMessage");
  el.textContent=text;
  el.className=`users-message ${type}`;
}

function normalizeUser(row){
  return {
    id: row.id,
    email: row.email || "",
    role: row.role || "viewer",
    active: row.active !== false,
    silo: row.silo_permission || "viewer",
    manutencao: row.manutencao_permission || "viewer",
    ferramentas: row.ferramentas_permission || "viewer",
    presenca: row.presenca_permission || "viewer"
  };
}

function renderUsers(){
  const query=$("userSearch").value.trim().toLowerCase();
  const includeInactive=$("showInactive").checked;

  const rows=allUsers.filter(u=>{
    const match=!query || u.email.toLowerCase().includes(query);
    const activeOk=includeInactive || u.active;
    return match && activeOk;
  });

  $("usersCount").textContent=`${rows.length} usuário(s)`;
  $("usersBody").innerHTML=rows.map(u=>`
    <tr>
      <td>
        <div class="user-cell">
          <strong>${escapeHtml(u.email || "Sem e-mail")}</strong>
          <small>${escapeHtml(u.id)}</small>
        </div>
      </td>
      <td>${pill(u.role==="admin"?"Administrador":"Usuário",u.role==="admin"?"access-admin":"access-viewer")}</td>
      <td>${pill(u.active?"Ativo":"Inativo",u.active?"status-active":"status-inactive")}</td>
      <td>${pill(permissionText(u.silo),u.silo==="admin"?"access-admin":"access-viewer")}</td>
      <td>${pill(permissionText(u.manutencao),u.manutencao==="admin"?"access-admin":"access-viewer")}</td>
      <td>${pill(permissionText(u.ferramentas),u.ferramentas==="admin"?"access-admin":"access-viewer")}</td>
      <td>${pill(permissionText(u.presenca),u.presenca==="admin"?"access-admin":"access-viewer")}</td>
      <td>
        <div class="row-actions">
          <button class="row-action edit-user" data-id="${u.id}" type="button">Editar</button>
          <button class="row-action password-user" data-id="${u.id}" type="button">Senha</button>
          <button class="row-action history-user" data-id="${u.id}" type="button">Histórico</button>
        </div>
      </td>
    </tr>
  `).join("");

  $("emptyUsers").classList.toggle("hidden",rows.length!==0);

  document.querySelectorAll(".edit-user").forEach(btn=>{
    btn.addEventListener("click",()=>openEditor(btn.dataset.id));
  });
  document.querySelectorAll(".password-user").forEach(btn=>{
    btn.addEventListener("click",()=>openPassword(btn.dataset.id));
  });
  document.querySelectorAll(".history-user").forEach(btn=>{
    btn.addEventListener("click",()=>openHistory(btn.dataset.id));
  });
}

async function loadUsers(){
  setMessage("Carregando usuários...");
  try{
    const result=await SiloSupabase.adminUserManagement("list_users");
    allUsers=(result.users||[]).map(normalizeUser);
    renderUsers();
    setMessage("");
    return true;
  }catch(error){
    console.error(error);
    setMessage(error.message || "Não foi possível carregar os usuários.","error");
    return false;
  }
}

async function boot(){
  try{
    const user=await SiloSupabase.getUser();
    if(!user){
      location.href="index.html";
      return;
    }

    $("userEmail").textContent=user.email || "";

    const {data:isAdmin,error:adminError}=await supabaseClient.rpc("is_global_admin");
    if(adminError) throw adminError;
    if(isAdmin!==true){
      location.href="index.html";
      return;
    }

    await loadUsers();
  }catch(error){
    console.error("Gerenciamento de usuários:",error);
    setMessage(error?.message || "Não foi possível abrir o gerenciamento de usuários.","error");
  }
}

function openEditor(id){
  selectedUser=allUsers.find(u=>u.id===id);
  if(!selectedUser) return;

  $("editUserId").value=selectedUser.id;
  $("editEmail").textContent=selectedUser.email;
  $("editRole").value=selectedUser.role;
  $("editActive").value=String(selectedUser.active);
  $("editSilo").value=selectedUser.silo;
  $("editManutencao").value=selectedUser.manutencao;
  $("editFerramentas").value=selectedUser.ferramentas;
  $("editPresenca").value=selectedUser.presenca;
  $("editError").textContent="";
  $("editUserDialog").showModal();
}

async function saveEditor(){
  if(!selectedUser) return;

  $("saveEdit").disabled=true;
  $("editError").textContent="";
  showGlobalLoading("Salvando alterações...");

  const payload={
    target_user_id:selectedUser.id,
    role:$("editRole").value,
    active:$("editActive").value==="true",
    silo_permission:$("editSilo").value,
    manutencao_permission:$("editManutencao").value,
    ferramentas_permission:$("editFerramentas").value,
    presenca_permission:$("editPresenca").value
  };

  try{
    await SiloSupabase.adminUserManagement("update_user",payload);
    $("editUserDialog").close();
    setMessage("Permissões, perfil e status atualizados com sucesso.","success");
    showGlobalLoading("Atualizando usuários...");
    await loadUsers();
  }catch(error){
    console.error(error);
    $("editError").textContent=error.message || "Não foi possível salvar as alterações.";
  }finally{
    $("saveEdit").disabled=false;
    hideGlobalLoading();
  }
}

function openNewUser(){
  $("newUserForm").reset();
  $("newRole").value="viewer";
  $("newActive").value="true";
  $("newSilo").value="viewer";
  $("newManutencao").value="viewer";
  $("newFerramentas").value="viewer";
  $("newPresenca").value="viewer";
  $("newUserError").textContent="";
  $("newUserDialog").showModal();
}

async function createUser(){
  const email=$("newEmail").value.trim();
  const password=$("newPassword").value;

  if(!email){
    $("newUserError").textContent="Informe o e-mail.";
    return;
  }
  if(password.length<6){
    $("newUserError").textContent="A senha deve ter pelo menos 6 caracteres.";
    return;
  }

  $("createUser").disabled=true;
  $("newUserError").textContent="";
  showGlobalLoading("Criando usuário...");

  try{
    await SiloSupabase.adminUserManagement("create_user",{
      email,
      password,
      role:$("newRole").value,
      active:$("newActive").value==="true",
      silo_permission:$("newSilo").value,
      manutencao_permission:$("newManutencao").value,
      ferramentas_permission:$("newFerramentas").value,
      presenca_permission:$("newPresenca").value
    });

    $("newUserDialog").close();
    setMessage("Usuário criado com sucesso.","success");
    showGlobalLoading("Atualizando usuários...");
    await loadUsers();
  }catch(error){
    console.error(error);
    $("newUserError").textContent=error.message || "Não foi possível criar o usuário.";
  }finally{
    $("createUser").disabled=false;
    hideGlobalLoading();
  }
}

function openPassword(id){
  selectedUser=allUsers.find(u=>u.id===id);
  if(!selectedUser) return;

  $("passwordUserId").value=selectedUser.id;
  $("passwordEmail").textContent=selectedUser.email;
  $("newUserPassword").value="";
  $("confirmUserPassword").value="";
  $("passwordError").textContent="";
  $("passwordDialog").showModal();
}

async function changePassword(){
  if(!selectedUser) return;

  const password=$("newUserPassword").value;
  const confirmation=$("confirmUserPassword").value;

  if(password.length<6){
    $("passwordError").textContent="A senha deve ter pelo menos 6 caracteres.";
    return;
  }
  if(password!==confirmation){
    $("passwordError").textContent="As senhas não conferem.";
    return;
  }

  $("savePassword").disabled=true;
  $("passwordError").textContent="";
  showGlobalLoading("Alterando senha...");

  try{
    await SiloSupabase.adminUserManagement("change_password",{
      target_user_id:selectedUser.id,
      password
    });

    $("passwordDialog").close();
    setMessage("Senha alterada com sucesso.","success");
  }catch(error){
    console.error(error);
    $("passwordError").textContent=error.message || "Não foi possível alterar a senha.";
  }finally{
    $("savePassword").disabled=false;
    hideGlobalLoading();
  }
}

async function openHistory(id){
  const user=allUsers.find(u=>u.id===id);
  if(!user) return;

  $("historyEmail").textContent=user.email;
  $("historyContent").innerHTML='<div class="history-empty">Carregando auditoria...</div>';
  $("historyDialog").showModal();

  try{
    const result=await SiloSupabase.adminUserManagement("list_history",{
      target_user_id:id
    });

    const data=result.history||[];

    if(!data.length){
      $("historyContent").innerHTML='<div class="history-empty">Nenhuma alteração registrada.</div>';
      return;
    }

    const moduleNames={
      silo:"Controle de Silo",
      manutencao:"Manutenção",
      ferramentas:"Ferramentas",
      presenca:"Controle de Presença"
    };

    const actionNames={
      user_created:"Usuário criado",
      password_changed:"Senha redefinida",
      status_changed:"Status alterado",
      role_changed:"Perfil global alterado",
      permission_changed:"Permissão de módulo alterada"
    };

    $("historyContent").innerHTML=data.map(item=>{
      const date=item.changed_at
        ? new Date(item.changed_at).toLocaleString("pt-BR")
        : "Data não informada";

      const action=actionNames[item.action] || "Alteração";
      const module=item.module ? (moduleNames[item.module] || item.module) : "";
      const actor=item.changed_by_email || "Administrador";
      const previous=item.previous_value;
      const next=item.new_value;

      let changeHtml="";

      if(item.action==="permission_changed"){
        changeHtml=`
          <div class="history-change">
            <span class="history-old">${escapeHtml(permissionText(previous || "sem permissão"))}</span>
            <span class="history-arrow">→</span>
            <span class="history-new">${escapeHtml(permissionText(next || "sem permissão"))}</span>
          </div>
        `;
      }else if(item.action==="status_changed"){
        const oldText=previous==="active" ? "Ativo" : "Inativo";
        const newText=next==="active" ? "Ativo" : "Inativo";
        changeHtml=`
          <div class="history-change">
            <span class="history-old">${escapeHtml(oldText)}</span>
            <span class="history-arrow">→</span>
            <span class="history-new">${escapeHtml(newText)}</span>
          </div>
        `;
      }else if(item.action==="role_changed"){
        const oldText=previous==="admin" ? "Administrador" : "Usuário";
        const newText=next==="admin" ? "Administrador" : "Usuário";
        changeHtml=`
          <div class="history-change">
            <span class="history-old">${escapeHtml(oldText)}</span>
            <span class="history-arrow">→</span>
            <span class="history-new">${escapeHtml(newText)}</span>
          </div>
        `;
      }else if(item.details){
        changeHtml=`<div class="history-details">${escapeHtml(item.details)}</div>`;
      }

      return `
        <div class="history-item">
          <div class="history-item-head">
            <strong>${escapeHtml(action)}${module ? ` · ${escapeHtml(module)}` : ""}</strong>
            <span>${escapeHtml(date)}</span>
          </div>
          ${changeHtml}
          <div class="history-actor">Realizado por: ${escapeHtml(actor)}</div>
        </div>
      `;
    }).join("");
  }catch(error){
    console.error(error);
    $("historyContent").innerHTML=`<div class="history-empty">${escapeHtml(error.message || "Não foi possível carregar a auditoria.")}</div>`;
  }
}

$("newUserForm").addEventListener("submit",event=>{
  event.preventDefault();
  createUser();
});

$("editUserForm").addEventListener("submit",event=>{
  event.preventDefault();
  saveEditor();
});

$("passwordForm").addEventListener("submit",event=>{
  event.preventDefault();
  changePassword();
});

$("newUserBtn").addEventListener("click",openNewUser);
$("closeNewUser").addEventListener("click",()=>$("newUserDialog").close());
$("cancelNewUser").addEventListener("click",()=>$("newUserDialog").close());

$("closeEdit").addEventListener("click",()=>$("editUserDialog").close());
$("cancelEdit").addEventListener("click",()=>$("editUserDialog").close());

$("closePassword").addEventListener("click",()=>$("passwordDialog").close());
$("cancelPassword").addEventListener("click",()=>$("passwordDialog").close());

$("closeHistory").addEventListener("click",()=>$("historyDialog").close());

$("refreshUsers").addEventListener("click",async()=>{
  showGlobalLoading("Atualizando usuários...");
  try{
    await loadUsers();
  }finally{
    hideGlobalLoading();
  }
});
$("userSearch").addEventListener("input",renderUsers);
$("showInactive").addEventListener("change",renderUsers);

$("logoutBtn").addEventListener("click",async()=>{
  try{await SiloSupabase.signOut();}
  finally{location.href="index.html";}
});

boot();
})();
