const APP_VERSION = "5.0.0";
(() => {
"use strict";
const $ = id => document.getElementById(id);
const sb = window.supabaseClient || window.supabase;
let user = null;
let modulePermission = "viewer";
let isGlobalAdmin = false;
let rows = [];
let selectedDate = "";

const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const dateLabel = iso => iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"2-digit",year:"numeric"}) : "—";
const isAdmin = () => isGlobalAdmin || modulePermission === "admin";
const canEdit = () => isAdmin();

function setMessage(text="", type=""){
  const el=$("presenceMessage");
  if(!el)return;
  el.textContent=text;
  el.className=`presence-message ${type}`;
}
function setLoading(text="Carregando..."){
  window.AppLoading?.show(text);
}
function clearLoading(){
  window.AppLoading?.hide();
}

async function checkAccess(){
  user = await window.SiloSupabase.getUser();
  if(!user){ location.href="index.html"; return false; }

  $("userEmail").textContent=user.email||"";

  try{
    const {data, error}=await sb.rpc("is_global_admin");
    if(!error) isGlobalAdmin = data === true;
  }catch(_){ isGlobalAdmin=false; }

  try{
    modulePermission = await window.SiloSupabase.getModulePermission("presenca",user);
  }catch(_){
    modulePermission = isGlobalAdmin ? "admin" : "viewer";
  }

  $("roleLabel").textContent = isAdmin() ? "ADMIN" : "VISUALIZAÇÃO";
  if(!isAdmin()){
    document.querySelectorAll(".admin-only").forEach(el=>el.remove());
  }
  return true;
}

async function loadDay(){
  selectedDate=$("presenceDate").value || isoToday();
  $("dateHeading").textContent=dateLabel(selectedDate);
  setMessage("");
  setLoading("Carregando presença...");
  try{
    const {data: collaborators, error:cError}=await sb
      .from("presenca_colaboradores")
      .select("id,nome,ativo")
      .order("nome",{ascending:true});
    if(cError) throw cError;

    const {data: records, error:rError}=await sb
      .from("presenca_registros")
      .select("colaborador_id,data,manha,tarde,extra,observacao")
      .eq("data",selectedDate);
    if(rError) throw rError;

    const byId=new Map((records||[]).map(r=>[String(r.colaborador_id),r]));
    const showingToday = selectedDate === isoToday();
    rows=(collaborators||[])
      .filter(c=>showingToday ? c.ativo !== false : (c.ativo !== false || byId.has(String(c.id))))
      .map(c=>{
        const r=byId.get(String(c.id));
        return {
          id:c.id,nome:c.nome,ativo:c.ativo!==false,
          manha:r?.manha===true,tarde:r?.tarde===true,extra:r?.extra===true,
          observacao:r?.observacao||"",hasRecord:Boolean(r)
        };
      });

    render();
    await loadCounters();
  }catch(error){
    console.error(error);
    setMessage(error.message||"Não foi possível carregar a ficha de presença.","error");
    rows=[];
    render();
  }finally{
    clearLoading();
  }
}

async function loadCounters(){
  try{
    const {data,error}=await sb.rpc("obter_contadores_presenca",{p_data:selectedDate});
    if(error) throw error;
    const c=data?.[0]||{total_manha:0,total_tarde:0,total_extra:0,total_dia:0};
    $("countMorning").textContent=Number(c.total_manha||0);
    $("countAfternoon").textContent=Number(c.total_tarde||0);
    $("countExtra").textContent=Number(c.total_extra||0);
    $("countDay").textContent=Number(c.total_dia||0);
  }catch(error){
    console.error(error);
    $("countMorning").textContent="—";
    $("countAfternoon").textContent="—";
    $("countExtra").textContent="—";
    $("countDay").textContent="—";
  }
}

function render(){
  $("rowsCount").textContent=`${rows.length} colaborador${rows.length===1?"":"es"}`;
  $("emptyPresence").classList.toggle("hidden",rows.length!==0);
  $("presenceBody").innerHTML=rows.map(r=>{
    const disabled=!canEdit() ? "disabled" : "";
    const inactive=r.ativo===false ? `<span class="presence-inactive">Inativo</span>` : "";
    return `
      <tr class="${r.ativo===false?"inactive-row":""}" data-id="${esc(r.id)}">
        <td>
          <div class="presence-person">
            <strong>${esc(r.nome)}</strong>
            ${inactive}
          </div>
        </td>
        <td><label class="presence-switch"><input type="checkbox" data-shift="manha" ${r.manha?"checked":""} ${disabled}><span>✓</span></label></td>
        <td><label class="presence-switch"><input type="checkbox" data-shift="tarde" ${r.tarde?"checked":""} ${disabled}><span>✓</span></label></td>
        <td><label class="presence-switch"><input type="checkbox" data-shift="extra" ${r.extra?"checked":""} ${disabled}><span>✓</span></label></td>
        <td><input class="presence-observation" data-observation type="text" maxlength="500" value="${esc(r.observacao)}" placeholder="Observação..." ${disabled}></td>
        <td><button class="tiny presence-save" data-save type="button" ${disabled}>Salvar</button></td>
      </tr>`;
  }).join("");

  document.querySelectorAll("#presenceBody tr").forEach(tr=>{
    const id=tr.dataset.id;
    tr.querySelectorAll("input[data-shift]").forEach(input=>{
      input.addEventListener("change",()=>setDirty(tr,true));
    });
    tr.querySelector("[data-observation]")?.addEventListener("input",()=>setDirty(tr,true));
    tr.querySelector("[data-save]")?.addEventListener("click",()=>saveRow(id,tr));
  });
}

function setDirty(tr,dirty){
  tr.classList.toggle("row-dirty",dirty);
  const btn=tr.querySelector("[data-save]");
  if(btn) btn.textContent=dirty?"Salvar":"Salvo";
}

function getRowValues(tr){
  return {
    manha:tr.querySelector('[data-shift="manha"]')?.checked===true,
    tarde:tr.querySelector('[data-shift="tarde"]')?.checked===true,
    extra:tr.querySelector('[data-shift="extra"]')?.checked===true,
    observacao:tr.querySelector("[data-observation]")?.value.trim()||null
  };
}

async function saveRow(id,tr){
  if(!canEdit()) return;
  const values=getRowValues(tr);
  const btn=tr.querySelector("[data-save]");
  if(btn)btn.disabled=true;
  setLoading("Salvando presença...");
  try{
    const {error}=await sb.rpc("salvar_presenca",{
      p_colaborador_id:id,
      p_data:selectedDate,
      p_manha:values.manha,
      p_tarde:values.tarde,
      p_extra:values.extra,
      p_observacao:values.observacao
    });
    if(error) throw error;
    setDirty(tr,false);
    setMessage("Presença salva com sucesso.","success");
    await loadCounters();
  }catch(error){
    console.error(error);
    setMessage(error.message||"Não foi possível salvar a presença.","error");
  }finally{
    if(btn)btn.disabled=false;
    clearLoading();
  }
}

function printPdf(){
  const printable=rows.map(r=>`
    <tr>
      <td>${esc(r.nome)}</td>
      <td>${r.manha?"P":"A"}</td>
      <td>${r.tarde?"P":"A"}</td>
      <td>${r.extra?"P":"A"}</td>
      <td>${esc(r.observacao||"")}</td>
    </tr>`).join("");

  const win=window.open("","_blank","width=1000,height=800");
  if(!win){
    setMessage("O navegador bloqueou a janela de impressão. Permita pop-ups para exportar o PDF.","error");
    return;
  }
  win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Controle de Presença - ${esc(selectedDate)}</title>
  <style>
    @page{size:A4 landscape;margin:12mm}body{font-family:Arial,sans-serif;color:#172033;font-size:11px}
    h1{font-size:20px;margin:0 0 4px}p{margin:0 0 14px;color:#667085}.summary{display:flex;gap:25px;margin-bottom:15px}
    .summary div{padding:8px 12px;border:1px solid #ddd;border-radius:8px}.summary b{display:block;font-size:15px}
    table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #dfe3e8;text-align:left}th{background:#f5f7fa;font-size:9px;text-transform:uppercase}
    td:nth-child(2),td:nth-child(3),td:nth-child(4){text-align:center;font-weight:bold;width:60px}.foot{margin-top:12px;color:#667085;font-size:9px}
  </style></head><body>
  <h1>Controle de Presença</h1>
  <p>Data: ${esc(dateLabel(selectedDate))}</p>
  <div class="summary">
    <div>Manhã <b>${esc($("countMorning").textContent)}</b></div>
    <div>Tarde <b>${esc($("countAfternoon").textContent)}</b></div>
    <div>Extra <b>${esc($("countExtra").textContent)}</b></div>
    <div>Presença do dia <b>${esc($("countDay").textContent)}</b></div>
  </div>
  <table><thead><tr><th>Colaborador</th><th>Manhã</th><th>Tarde</th><th>Extra</th><th>Observação</th></tr></thead><tbody>${printable}</tbody></table>
  <div class="foot">P = Presente · A = Ausente · Presença do dia = manhã e tarde.</div>
  <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),500)}<\/script>
  </body></html>`);
  win.document.close();
}

async function boot(){
  try{
    if(!await checkAccess())return;
    $("presenceDate").value=isoToday();
    $("presenceDate").addEventListener("change",loadDay);
    $("todayBtn").addEventListener("click",()=>{$("presenceDate").value=isoToday();loadDay();});
    $("pdfBtn").addEventListener("click",printPdf);
    $("logoutBtn").addEventListener("click",async()=>{await window.SiloSupabase.signOut();location.href="index.html";});
    await loadDay();
  }catch(error){
    console.error(error);
    location.href="index.html";
  }
}
boot();
})();
