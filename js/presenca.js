const APP_VERSION = "5.1.1";
(() => {
"use strict";
const $ = id => document.getElementById(id);
const sb = window.supabaseClient || window.supabase;
let user = null;
let modulePermission = "viewer";
let isGlobalAdmin = false;
let rows = [];
let selectedDate = "";
let reportStartDate = "";
let reportEndDate = "";
let lunchOrder = null;
let lunchDialogMode = "new";

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
    await loadLunchOrder();
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


async function loadLunchOrder(){
  const countEl=$("countLunch");
  const statusEl=$("lunchStatus");
  if(!countEl) return;

  try{
    const {data,error}=await sb.rpc("obter_pedido_almoco",{p_data:selectedDate});
    if(error) throw error;

    lunchOrder=Array.isArray(data) && data.length ? data[0] : null;
    countEl.textContent=String(Number(lunchOrder?.quantidade||0));

    if(lunchOrder){
      statusEl.textContent=`solicitado em ${new Date(lunchOrder.solicitado_em).toLocaleString("pt-BR")}`;
    }else{
      statusEl.textContent="nenhum pedido";
    }

    updateLunchButton();
  }catch(error){
    console.error(error);
    lunchOrder=null;
    countEl.textContent="—";
    statusEl.textContent="não disponível";
    updateLunchButton();
  }
}

function updateLunchButton(){
  const btn=$("lunchBtn");
  if(!btn) return;

  const isToday=selectedDate===isoToday();
  btn.classList.toggle("hidden",!isToday);
  btn.disabled=!isToday;
}

function openLunchDialog(){
  if(selectedDate!==isoToday()) return;

  const dialog=$("lunchDialog");
  const qty=$("lunchQuantity");
  const text=$("lunchDialogText");
  const title=$("lunchDialogTitle");
  const error=$("lunchDialogError");
  if(!dialog||!qty) return;

  error.textContent="";

  if(lunchOrder){
    lunchDialogMode="edit";
    title.textContent="Alterar pedido de almoço";
    text.textContent=`Você já solicitou ${Number(lunchOrder.quantidade)} almoço${Number(lunchOrder.quantidade)===1?"":"s"} hoje. Deseja alterar a quantidade?`;
    qty.value=String(Number(lunchOrder.quantidade));
  }else{
    lunchDialogMode="new";
    const morning=Number($("countMorning")?.textContent||0);
    title.textContent="Solicitar almoço";
    text.textContent=`Foi calculado ${morning} almoço${morning===1?"":"s"}, deseja acrescentar almoços extras?`;
    qty.value=String(morning);
  }

  if(typeof dialog.showModal==="function") dialog.showModal();
  else dialog.setAttribute("open","");
  setTimeout(()=>{qty.focus();qty.select();},50);
}

function buildLunchWhatsAppUrl(quantity){
  const phone="555193767114";
  const message=`*Pedido de Almoço*\n\nPara o dia de hoje favor solicitar ${quantity} almoço${quantity===1?"":"s"} para os colaboradores da Fábrica.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

async function confirmLunchOrder(){
  if(selectedDate!==isoToday()) return;

  const qtyEl=$("lunchQuantity");
  const errorEl=$("lunchDialogError");
  const btn=$("confirmLunchBtn");
  const dialog=$("lunchDialog");

  const quantity=Number(qtyEl?.value);
  errorEl.textContent="";

  if(!Number.isInteger(quantity)||quantity<0){
    errorEl.textContent="Informe uma quantidade inteira maior ou igual a zero.";
    return;
  }

  // Abre a janela dentro do gesto do usuário para evitar bloqueio de pop-up
  // depois da chamada assíncrona ao Supabase.
  const whatsappWindow=window.open("about:blank","_blank");

  if(btn) btn.disabled=true;
  setLoading(lunchDialogMode==="edit" ? "Alterando pedido de almoço..." : "Salvando pedido de almoço...");

  try{
    const {data,error}=await sb.rpc("salvar_pedido_almoco",{p_quantidade:quantity});
    if(error) throw error;

    lunchOrder=Array.isArray(data) && data.length ? data[0] : {
      data:isoToday(),
      quantidade:quantity,
      solicitado_em:new Date().toISOString()
    };

    await loadLunchOrder();

    const whatsappUrl=buildLunchWhatsAppUrl(quantity);

    if(whatsappWindow && !whatsappWindow.closed){
      whatsappWindow.location.href=whatsappUrl;
    }else{
      window.open(whatsappUrl,"_blank");
    }

    if(dialog?.open) dialog.close();
    setMessage(
      lunchDialogMode==="edit"
        ? `Pedido de almoço alterado para ${quantity} almoço${quantity===1?"":"s"}.`
        : `Pedido de ${quantity} almoço${quantity===1?"":"s"} registrado com sucesso.`,
      "success"
    );
  }catch(error){
    console.error(error);
    if(whatsappWindow && !whatsappWindow.closed) whatsappWindow.close();
    errorEl.textContent=error.message||"Não foi possível registrar o pedido de almoço.";
  }finally{
    if(btn) btn.disabled=false;
    clearLoading();
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
      </tr>`;
  }).join("");

  document.querySelectorAll("#presenceBody tr").forEach(tr=>{
    tr.querySelectorAll("input[data-shift]").forEach(input=>{
      input.addEventListener("change",()=>setDirty(tr,true));
    });
    tr.querySelector("[data-observation]")?.addEventListener("input",()=>setDirty(tr,true));
  });

  updateColumnToggles();
  updateSaveAllButton();
}

function setDirty(tr,dirty){
  tr.classList.toggle("row-dirty",dirty);
  updateSaveAllButton();
}

function getRowValues(tr){
  return {
    manha:tr.querySelector('[data-shift="manha"]')?.checked===true,
    tarde:tr.querySelector('[data-shift="tarde"]')?.checked===true,
    extra:tr.querySelector('[data-shift="extra"]')?.checked===true,
    observacao:tr.querySelector("[data-observation]")?.value.trim()||null
  };
}

function updateSaveAllButton(){
  const btn=$("saveAllBtn");
  if(!btn) return;
  const dirtyCount=document.querySelectorAll("#presenceBody tr.row-dirty").length;
  btn.disabled=!canEdit() || dirtyCount===0;
  btn.textContent=dirtyCount ? `Salvar alterações (${dirtyCount})` : "Salvar alterações";
}

function updateColumnToggles(){
  document.querySelectorAll("[data-toggle-column]").forEach(btn=>{
    const shift=btn.dataset.toggleColumn;
    const inputs=[...document.querySelectorAll(`#presenceBody input[data-shift="${shift}"]`)];
    const enabled=inputs.filter(input=>!input.disabled);
    const allChecked=enabled.length>0 && enabled.every(input=>input.checked);
    btn.textContent=allChecked ? "Desmarcar todos" : "Marcar todos";
    btn.disabled=!canEdit() || enabled.length===0;
  });
}

function toggleColumn(shift){
  if(!canEdit()) return;
  const inputs=[...document.querySelectorAll(`#presenceBody input[data-shift="${shift}"]`)]
    .filter(input=>!input.disabled);
  if(!inputs.length) return;

  const allChecked=inputs.every(input=>input.checked);
  const nextValue=!allChecked;

  inputs.forEach(input=>{
    if(input.checked!==nextValue){
      input.checked=nextValue;
      const tr=input.closest("tr");
      if(tr) setDirty(tr,true);
    }
  });

  updateColumnToggles();
  updateSaveAllButton();
}

async function saveAll(){
  if(!canEdit()) return;

  const dirtyRows=[...document.querySelectorAll("#presenceBody tr.row-dirty")];
  if(!dirtyRows.length){
    setMessage("Nenhuma alteração para salvar.","");
    return;
  }

  const btn=$("saveAllBtn");
  if(btn) btn.disabled=true;
  setLoading(`Salvando ${dirtyRows.length} ${dirtyRows.length===1?"alteração":"alterações"}...`);

  try{
    const results=await Promise.allSettled(
      dirtyRows.map(async tr=>{
        const id=tr.dataset.id;
        const values=getRowValues(tr);
        const {error}=await sb.rpc("salvar_presenca",{
          p_colaborador_id:id,
          p_data:selectedDate,
          p_manha:values.manha,
          p_tarde:values.tarde,
          p_extra:values.extra,
          p_observacao:values.observacao
        });
        if(error) throw error;
        return tr;
      })
    );

    const failed=results.filter(r=>r.status==="rejected");
    const succeeded=results.length-failed.length;

    results.forEach(result=>{
      if(result.status==="fulfilled") setDirty(result.value,false);
    });

    await loadCounters();

    if(failed.length){
      setMessage(`${succeeded} salvo(s). ${failed.length} não foi(ram) salvo(s). Verifique as alterações e tente novamente.`,"error");
    }else{
      setMessage(`${succeeded} ${succeeded===1?"alteração salva":"alterações salvas"} com sucesso.`,"success");
    }
  }catch(error){
    console.error(error);
    setMessage(error.message||"Não foi possível salvar as alterações.","error");
  }finally{
    updateSaveAllButton();
    updateColumnToggles();
    clearLoading();
  }
}

function printPdf(){
  const printable=rows.filter(r=>r.manha||r.tarde||r.extra).map(r=>`
    <tr>
      <td>${esc(r.nome)}</td>
      <td>${r.manha?"P":"—"}</td>
      <td>${r.tarde?"P":"—"}</td>
      <td>${r.extra?"P":"—"}</td>
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
  <table><thead><tr><th>Colaborador</th><th>Manhã</th><th>Tarde</th><th>Extra</th><th>Observação</th></tr></thead><tbody>${printable || '<tr><td colspan="5">Nenhum colaborador presente nesta data.</td></tr>'}</tbody></table>
  <div class="foot">P = Presente · — = Ausente/não marcado · Presença do dia = manhã e tarde.</div>
  <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),500)}<\/script>
  </body></html>`);
  win.document.close();
}

function formatDateShort(iso){
  if(!iso) return "—";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"});
}

function dateRange(start,end){
  const result=[];
  const d=new Date(`${start}T12:00:00`);
  const last=new Date(`${end}T12:00:00`);
  while(d<=last){
    result.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`);
    d.setDate(d.getDate()+1);
  }
  return result;
}

function openPeriodReport(){
  const dialog=$("periodReportDialog");
  if(!dialog) return;
  $("reportStartDate").value=selectedDate || isoToday();
  $("reportEndDate").value=selectedDate || isoToday();
  $("periodReportError").textContent="";
  if(typeof dialog.showModal==="function") dialog.showModal();
  else dialog.setAttribute("open","");
}

async function generatePeriodReport(){
  const start=$("reportStartDate").value;
  const end=$("reportEndDate").value;
  const errorEl=$("periodReportError");
  const btn=$("generatePeriodReportBtn");

  errorEl.textContent="";

  if(!start || !end){
    errorEl.textContent="Informe a data inicial e a data final.";
    return;
  }
  if(start>end){
    errorEl.textContent="A data inicial não pode ser maior que a data final.";
    return;
  }

  const days=dateRange(start,end);
  if(days.length>366){
    errorEl.textContent="Selecione um período de até 366 dias.";
    return;
  }

  if(btn) btn.disabled=true;
  setLoading("Gerando relatório de presença...");

  try{
    const {data,error}=await sb.rpc("obter_historico_presenca",{
      p_data_inicio:start,
      p_data_fim:end
    });
    if(error) throw error;

    const records=(data||[]).map(r=>({
      ...r,
      data:String(r.data).slice(0,10)
    }));

    const byDate=new Map();
    records.forEach(r=>{
      const present=r.manha===true || r.tarde===true || r.extra===true;
      if(!present) return;
      if(!byDate.has(r.data)) byDate.set(r.data,[]);
      byDate.get(r.data).push(r);
    });

    days.forEach(day=>{
      const dayRows=byDate.get(day)||[];
      dayRows.sort((a,b)=>String(a.nome||"").localeCompare(String(b.nome||""),"pt-BR"));
    });

    const allPresent=records.filter(r=>r.manha===true||r.tarde===true||r.extra===true);
    const uniquePeople=new Set(allPresent.map(r=>String(r.colaborador_id)));
    const totalMorning=allPresent.filter(r=>r.manha===true).length;
    const totalAfternoon=allPresent.filter(r=>r.tarde===true).length;
    const totalExtra=allPresent.filter(r=>r.extra===true).length;
    const totalDay=allPresent.filter(r=>r.manha===true&&r.tarde===true).length;
    const daysWithPresence=days.filter(d=>(byDate.get(d)||[]).length>0).length;

    const sections=days.map(day=>{
      const dayRows=byDate.get(day)||[];
      const morning=dayRows.filter(r=>r.manha===true).length;
      const afternoon=dayRows.filter(r=>r.tarde===true).length;
      const extra=dayRows.filter(r=>r.extra===true).length;
      const dayTotal=dayRows.filter(r=>r.manha===true&&r.tarde===true).length;

      const tableRows=dayRows.length
        ? dayRows.map(r=>`
            <tr>
              <td>${esc(r.nome)}</td>
              <td>${r.manha?"P":"—"}</td>
              <td>${r.tarde?"P":"—"}</td>
              <td>${r.extra?"P":"—"}</td>
              <td>${esc(r.observacao||"")}</td>
            </tr>`).join("")
        : `<tr><td colspan="5" class="no-presence">Nenhum colaborador presente neste dia.</td></tr>`;

      return `
        <section class="day-section">
          <div class="day-head">
            <div>
              <h2>${esc(dateLabel(day))}</h2>
              <p>${dayRows.length} presente${dayRows.length===1?"":"s"}</p>
            </div>
            <div class="day-summary">
              <span>Manhã <b>${morning}</b></span>
              <span>Tarde <b>${afternoon}</b></span>
              <span>Extra <b>${extra}</b></span>
              <span>Dia <b>${dayTotal}</b></span>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Manhã</th>
                <th>Tarde</th>
                <th>Extra</th>
                <th>Observação</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </section>`;
    }).join("");

    const win=window.open("","_blank","width=1100,height=850");
    if(!win){
      errorEl.textContent="O navegador bloqueou a janela de impressão. Permita pop-ups para exportar o PDF.";
      return;
    }

    win.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Relatório de Presença - ${formatDateShort(start)} a ${formatDateShort(end)}</title>
<style>
  @page{size:A4 portrait;margin:12mm}
  *{box-sizing:border-box}
  body{font-family:Arial,sans-serif;color:#172033;font-size:10px;margin:0}
  .header{border-bottom:2px solid #172033;padding-bottom:10px;margin-bottom:14px}
  .eyebrow{font-size:9px;font-weight:800;letter-spacing:.12em;color:#667085;text-transform:uppercase}
  h1{font-size:21px;margin:5px 0 4px}
  .period{font-size:11px;color:#667085}
  .summary{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin:0 0 16px}
  .summary-card{border:1px solid #dfe3e8;border-radius:7px;padding:7px 8px}
  .summary-card span{display:block;font-size:8px;color:#667085;text-transform:uppercase}
  .summary-card b{display:block;font-size:14px;margin-top:3px}
  .day-section{margin-bottom:17px;break-inside:avoid}
  .day-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:6px;border-bottom:1px solid #dfe3e8;padding-bottom:5px}
  .day-head h2{font-size:13px;margin:0;text-transform:capitalize}
  .day-head p{margin:2px 0 0;color:#667085;font-size:9px}
  .day-summary{display:flex;gap:10px;color:#667085;font-size:8px}
  .day-summary b{color:#172033;font-size:10px}
  table{width:100%;border-collapse:collapse}
  th,td{border:1px solid #dfe3e8;padding:6px 7px;text-align:left}
  th{background:#f5f7fa;font-size:8px;text-transform:uppercase;letter-spacing:.05em}
  td:nth-child(2),td:nth-child(3),td:nth-child(4){text-align:center;width:45px;font-weight:700}
  .no-presence{text-align:center;color:#98a2b3;padding:10px}
  .footer{margin-top:18px;border-top:1px solid #dfe3e8;padding-top:7px;color:#667085;font-size:8px}
  @media print{.day-section{break-inside:avoid}.day-section table{break-inside:auto}}
</style>
</head>
<body>
  <div class="header">
    <div class="eyebrow">V5 · CONTROLE DE PRESENÇA</div>
    <h1>Relatório de Presença</h1>
    <div class="period">Período: ${formatDateShort(start)} a ${formatDateShort(end)}</div>
  </div>

  <div class="summary">
    <div class="summary-card"><span>Dias com presença</span><b>${daysWithPresence}</b></div>
    <div class="summary-card"><span>Pessoas únicas</span><b>${uniquePeople.size}</b></div>
    <div class="summary-card"><span>Presenças manhã</span><b>${totalMorning}</b></div>
    <div class="summary-card"><span>Presenças tarde</span><b>${totalAfternoon}</b></div>
    <div class="summary-card"><span>Presenças extra</span><b>${totalExtra}</b></div>
  </div>

  ${sections}

  <div class="footer">
    P = Presente · — = Não marcado · Presença do dia = manhã e tarde.
    Relatório gerado em ${new Date().toLocaleString("pt-BR")}.
  </div>

<script>
window.onload=()=>{window.print();setTimeout(()=>window.close(),700)}
<\/script>
</body>
</html>`);
    win.document.close();

    const dialog=$("periodReportDialog");
    if(dialog?.open) dialog.close();
    setMessage(`Relatório de ${formatDateShort(start)} a ${formatDateShort(end)} preparado para impressão/PDF.`,"success");
  }catch(error){
    console.error(error);
    errorEl.textContent=error.message||"Não foi possível gerar o relatório.";
  }finally{
    if(btn) btn.disabled=false;
    clearLoading();
  }
}

async function boot(){
  try{
    if(!await checkAccess())return;
    $("presenceDate").value=isoToday();
    $("presenceDate").addEventListener("change",loadDay);
    $("todayBtn").addEventListener("click",()=>{$("presenceDate").value=isoToday();loadDay();});
    $("pdfBtn").addEventListener("click",printPdf);
    $("lunchBtn")?.addEventListener("click",openLunchDialog);
    $("saveAllBtn")?.addEventListener("click",saveAll);
    document.querySelectorAll("[data-toggle-column]").forEach(btn=>{
      btn.addEventListener("click",()=>toggleColumn(btn.dataset.toggleColumn));
    });
    $("lunchForm")?.addEventListener("submit",(event)=>{
      if(event.submitter?.value==="cancel") return;
      event.preventDefault();
      confirmLunchOrder();
    });
    $("lunchDialog")?.addEventListener("click",(event)=>{
      if(event.target === $("lunchDialog")) $("lunchDialog").close();
    });
    $("periodReportBtn")?.addEventListener("click",openPeriodReport);
    $("periodReportForm")?.addEventListener("submit",(event)=>{
      if(event.submitter?.value==="cancel") return;
      event.preventDefault();
      generatePeriodReport();
    });
    $("periodReportDialog")?.addEventListener("click",(event)=>{
      if(event.target === $("periodReportDialog")) $("periodReportDialog").close();
    });
    $("logoutBtn").addEventListener("click",async()=>{await window.SiloSupabase.signOut();location.href="index.html";});
    await loadDay();
  }catch(error){
    console.error(error);
    location.href="index.html";
  }
}
boot();
})();
