const APP_VERSION = "4.1.0";
(() => {
"use strict";
const $=id=>document.getElementById(id);
const DEFAULT_VIEWER_EMAIL="viewer@teste.com";
const DEFAULT_VIEWER_PASSWORD="123456";
const AUTO_LOGIN_BLOCKED_KEY="controleSiloManualLogout";

function translateAuthError(message){
  const m=String(message||"");
  const l=m.toLowerCase();
  if(l.includes("invalid login credentials")) return "E-mail ou senha inválidos.";
  if(l.includes("email not confirmed")) return "O e-mail do usuário ainda não foi confirmado.";
  if(l.includes("auth session missing")) return "A sessão expirou. Faça login novamente.";
  if(l.includes("network")) return "Não foi possível conectar ao servidor.";
  return m;
}

async function boot(){
  try{
    let user=await SiloSupabase.getUser();
    const manualLogout=sessionStorage.getItem(AUTO_LOGIN_BLOCKED_KEY)==="1";

    if(!user && !manualLogout){
      $("loginEmail").value=DEFAULT_VIEWER_EMAIL;
      $("loginPassword").value=DEFAULT_VIEWER_PASSWORD;
      const result=await SiloSupabase.signIn(DEFAULT_VIEWER_EMAIL,DEFAULT_VIEWER_PASSWORD);
      if(result?.error) throw result.error;
      user=result?.data?.user||null;
      if(!user) throw new Error("O login automático não retornou um usuário.");
    }

    if(!user){
      $("loginScreen").classList.remove("hidden");
      $("appScreen").classList.add("hidden");
      return;
    }

    sessionStorage.removeItem(AUTO_LOGIN_BLOCKED_KEY);
    const profile=await SiloSupabase.getProfile(user);
    if(!profile) throw new Error("Perfil do usuário não foi encontrado para a sessão autenticada.");

    $("loginScreen").classList.add("hidden");
    $("appScreen").classList.remove("hidden");
    $("userRole").textContent=profile.role==="admin"?"ADMIN":"VISUALIZAÇÃO";
  }catch(err){
    console.error("Inicialização da Gestão de Fábrica:",err);
    $("loginScreen").classList.remove("hidden");
    $("appScreen").classList.add("hidden");
    $("loginError").textContent=translateAuthError(err?.message||"Não foi possível iniciar a sessão.");
  }
}

$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  $("loginError").textContent="";
  try{
    const result=await SiloSupabase.signIn($("loginEmail").value.trim(),$("loginPassword").value);
    if(result?.error) throw result.error;
    await boot();
  }catch(err){
    $("loginError").textContent=translateAuthError(err?.message||"Falha no login.");
  }
});

$("logoutBtn").addEventListener("click",async()=>{
  try{ await SiloSupabase.signOut(); }
  finally{
    sessionStorage.setItem(AUTO_LOGIN_BLOCKED_KEY,"1");
    location.reload();
  }
});

boot().catch(err=>{
  console.error(err);
  $("loginError").textContent=translateAuthError(err?.message||"Erro ao iniciar.");
});
})();
