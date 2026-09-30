const APP_VERSION = "4.1.3";
(() => {
"use strict";
const $=id=>document.getElementById(id);

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
    const user=await SiloSupabase.getUser();

    // Login automático desativado: sem credenciais padrão e sem
    // preenchimento automático de usuário de teste.
    if(!user){
      $("loginScreen").classList.remove("hidden");
      $("appScreen").classList.add("hidden");
      return;
    }

    const profile=await SiloSupabase.getProfile(user);
    if(!profile) throw new Error("Perfil do usuário não foi encontrado para a sessão autenticada.");

    $("loginScreen").classList.add("hidden");
    $("appScreen").classList.remove("hidden");
    $("userRole").textContent=profile.role==="admin"?"ADMIN":"VISUALIZAÇÃO";
    $("userEmail").textContent=user.email||"";
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
  finally{ location.reload(); }
});

boot().catch(err=>{
  console.error(err);
  $("loginError").textContent=translateAuthError(err?.message||"Erro ao iniciar.");
});
})();
