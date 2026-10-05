
const APP_VERSION = "5.1.26";

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
  const normalized=String(value||"none").toLowerCase();
  if(normalized==="admin") return "Administrar";
  if(normalized==="viewer") return "Visualizar";
  return "Sem acesso";
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
    silo: row.silo_permission || "none",
    manutencao: row.manutencao_permission || "none",
    ferramentas: row.ferramentas_permission || "none",
    presenca: row.presenca_permission || "none"
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
      <td>${pill(permissionText(u.silo),u.silo==="admin"?"access-admin":(u.silo==="viewer"?"access-viewer":"access-none"))}</td>
      <td>${pill(permissionText(u.manutencao),u.manutencao==="admin"?"access-admin":(u.manutencao==="viewer"?"access-viewer":"access-none"))}</td>
      <td>${pill(permissionText(u.ferramentas),u.ferramentas==="admin"?"access-admin":(u.ferramentas==="viewer"?"access-viewer":"access-none"))}</td>
      <td>${pill(permissionText(u.presenca),u.presenca==="admin"?"access-admin":(u.presenca==="viewer"?"access-viewer":"access-none"))}</td>
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

    // A lista de usuários pode trazer "viewer" como valor de compatibilidade.
    // Para exibição, a fonte autoritativa é module_permissions.
    const {data:moduleRows,error:moduleError}=await supabaseClient.rpc("admin_list_module_permissions");
    if(moduleError) throw moduleError;

    const permissionsByUser=new Map();
    for(const row of (moduleRows||[])){
      if(!permissionsByUser.has(row.user_id)) permissionsByUser.set(row.user_id,{});
      permissionsByUser.get(row.user_id)[String(row.module).toLowerCase()]=String(row.permission||"none").toLowerCase();
    }

    allUsers=allUsers.map(user=>{
      const modulePermissions=permissionsByUser.get(user.id)||{};
      return {
        ...user,
        silo: modulePermissions.silo ?? user.silo,
        manutencao: modulePermissions.manutencao ?? user.manutencao,
        ferramentas: modulePermissions.ferramentas ?? user.ferramentas,
        presenca: modulePermissions.presenca ?? user.presenca
      };
    });

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

async function applyModulePermissions(userId, permissions){
  const entries=[
    ["silo",permissions.silo_permission],
    ["manutencao",permissions.manutencao_permission],
    ["ferramentas",permissions.ferramentas_permission],
    ["presenca",permissions.presenca_permission]
  ];

  for(const [module,permission] of entries){
    const normalized=String(permission||"none").toLowerCase();
    if(!["admin","viewer","none"].includes(normalized)){
      throw new Error(`Permissão inválida para o módulo ${module}.`);
    }

    const {error}=await supabaseClient.rpc("set_module_permission",{
      p_user_id:userId,
      p_module:module,
      p_permission:normalized
    });
    if(error) throw error;
  }
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
    // A Edge Function existente continua recebendo apenas viewer/admin.
    // "none" é aplicado logo depois pelo RPC seguro, removendo a permissão.
    silo_permission:$("editSilo").value==="none"?"viewer":$("editSilo").value,
    manutencao_permission:$("editManutencao").value==="none"?"viewer":$("editManutencao").value,
    ferramentas_permission:$("editFerramentas").value==="none"?"viewer":$("editFerramentas").value,
    presenca_permission:$("editPresenca").value==="none"?"viewer":$("editPresenca").value
  };
  const requestedPermissions={
    silo_permission:$("editSilo").value,
    manutencao_permission:$("editManutencao").value,
    ferramentas_permission:$("editFerramentas").value,
    presenca_permission:$("editPresenca").value
  };

  try{
    await SiloSupabase.adminUserManagement("update_user",payload);
    await applyModulePermissions(selectedUser.id,requestedPermissions);
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
    const requestedPermissions={
      silo_permission:$("newSilo").value,
      manutencao_permission:$("newManutencao").value,
      ferramentas_permission:$("newFerramentas").value,
      presenca_permission:$("newPresenca").value
    };

    await SiloSupabase.adminUserManagement("create_user",{
      email,
      password,
      role:$("newRole").value,
      active:$("newActive").value==="true",
      silo_permission:$("newSilo").value==="none"?"viewer":$("newSilo").value,
      manutencao_permission:$("newManutencao").value==="none"?"viewer":$("newManutencao").value,
      ferramentas_permission:$("newFerramentas").value==="none"?"viewer":$("newFerramentas").value,
      presenca_permission:$("newPresenca").value==="none"?"viewer":$("newPresenca").value
    });

    // Localiza o usuário recém-criado pelo e-mail e remove as permissões
    // marcadas como "Sem acesso".
    const refreshed=await SiloSupabase.adminUserManagement("list_users");
    const created=(refreshed.users||[]).find(item=>String(item.email||"").toLowerCase()===email.toLowerCase());
    if(!created?.id) throw new Error("Usuário criado, mas não foi possível localizar o registro para aplicar as permissões.");
    await applyModulePermissions(created.id,requestedPermissions);

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
