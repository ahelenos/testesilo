const APP_VERSION = "5.1.8";
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
const isMobileView = () => window.matchMedia("(max-width: 650px)").matches;
const canEdit = () => isAdmin() && !isMobileView();

// Pedido de almoço é permitido somente para ADMIN e somente para o dia atual.
function canRequestLunch(){
  return isAdmin() && !isMobileView() && selectedDate === isoToday();
}

function updateLunchButton(){
  const btn = $("lunchBtn");
  if(!btn) return;

  // O botão já é removido para VISUALIZAÇÃO em checkAccess().
  // Para ADMIN, mantém a ação disponível somente na data de hoje.
  const allowed = canRequestLunch();
  btn.disabled = !allowed;
  btn.title = allowed
    ? ""
    : "A solicitação de almoço está disponível somente para o dia de hoje.";
}

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

  const mobileReadOnly = isMobileView();
  $("roleLabel").textContent = (!mobileReadOnly && isAdmin()) ? "ADMIN" : "VISUALIZAÇÃO";
  if(!isAdmin() || mobileReadOnly){
    document.querySelectorAll(".admin-only").forEach(el=>el.remove());
  }
  if(mobileReadOnly){
    document.body.classList.add("mobile-readonly");
  }
  return true;
}

async function loadDay(){
  selectedDate=$("presenceDate").value || isoToday();
  $("dateHeading").textContent=dateLabel(selectedDate);
  updateLunchButton();
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

    const total=Number(lunchOrder?.quantidade||0);
    const fabrica=Number(lunchOrder?.quantidade_fabrica||0);
    const obra=Number(lunchOrder?.quantidade_obra||0);
    const motoristas=Number(lunchOrder?.quantidade_motoristas||0);
    const outros=Number(lunchOrder?.quantidade_outros||0);

    countEl.textContent=String(total);
    $("countLunchFabrica")?.replaceChildren(document.createTextNode(String(fabrica)));
    $("countLunchObra")?.replaceChildren(document.createTextNode(String(obra)));
    $("countLunchMotoristas")?.replaceChildren(document.createTextNode(String(motoristas)));
    $("countLunchOutros")?.replaceChildren(document.createTextNode(String(outros)));

    if(lunchOrder){
      const outrosDescricao=String(lunchOrder.outros_descricao||"").trim();
      statusEl.textContent=`solicitado em ${new Date(lunchOrder.solicitado_em).toLocaleString("pt-BR")}${outrosDescricao ? ` · Outros: ${outrosDescricao}` : ""}`;
    }else{
      statusEl.textContent="nenhum pedido";
    }

    updateLunchButton();
  }catch(error){
    console.error(error);
    lunchOrder=null;
    countEl.textContent="—";
    ["countLunchFabrica","countLunchObra","countLunchMotoristas","countLunchOutros"].forEach(id=>{
      const el=$(id);
      if(el) el.textContent="—";
    });
    statusEl.textContent="não disponível";
    updateLunchButton();
  }
}

function updateLunchDialogTotal(){
  const values=["lunchFabrica","lunchObra","lunchMotoristas","lunchOutros"].map(id=>{
    const n=Number($(id)?.value);
    return Number.isInteger(n)&&n>=0 ? n : 0;
  });
  const total=values.reduce((sum,n)=>sum+n,0);
  const totalEl=$("lunchDialogTotal");
  if(totalEl) totalEl.textContent=String(total);

  const outros=values[3];
  const wrap=$("lunchOutrosDescricaoWrap");
  const desc=$("lunchOutrosDescricao");
  if(wrap){
    wrap.classList.toggle("hidden",outros===0);
  }
  if(desc){
    desc.required=outros>0;
    if(outros===0) desc.value="";
  }

  return {fabrica:values[0],obra:values[1],motoristas:values[2],outros:values[3],total};
}

function setLunchDialogValues(order){
  const morning=Number($("countMorning")?.textContent||0);
  $("lunchFabrica").value=String(Number(order?.quantidade_fabrica ?? morning));
  $("lunchObra").value=String(Number(order?.quantidade_obra ?? 0));
  $("lunchMotoristas").value=String(Number(order?.quantidade_motoristas ?? 0));
  $("lunchOutros").value=String(Number(order?.quantidade_outros ?? 0));
  $("lunchOutrosDescricao").value=String(order?.outros_descricao||"");
  updateLunchDialogTotal();
}

function openLunchDialog(){
  if(!canRequestLunch()) return;

  const dialog=$("lunchDialog");
  const text=$("lunchDialogText");
  const title=$("lunchDialogTitle");
  const error=$("lunchDialogError");
  if(!dialog) return;

  error.textContent="";

  if(lunchOrder){
    lunchDialogMode="edit";
    title.textContent="Alterar pedido de almoço";
    text.textContent="Altere as quantidades por equipe. O total do dia é calculado automaticamente.";
    setLunchDialogValues(lunchOrder);
  }else{
    lunchDialogMode="new";
    const morning=Number($("countMorning")?.textContent||0);
    title.textContent="Solicitar almoço";
    text.textContent=`Foram identificados ${morning} presente${morning===1?"":"s"} pela manhã. Você pode distribuir a quantidade entre as equipes.`;
    setLunchDialogValues({
      quantidade_fabrica:morning,
      quantidade_obra:0,
      quantidade_motoristas:0,
      quantidade_outros:0,
      outros_descricao:""
    });
  }

  if(typeof dialog.showModal==="function") dialog.showModal();
  else dialog.setAttribute("open","");
  setTimeout(()=>{$("lunchFabrica")?.focus();$("lunchFabrica")?.select();},50);
}

function buildLunchWhatsAppUrl(order){
  const phone="555193767114";
  const outrosDescricao=String(order.outros_descricao||"").trim();
  const lines=[
    "*Pedido de Almoço*",
    "",
    "Para o dia de hoje favor solicitar:",
    `*ALMOÇO TOTAL DO DIA: ${order.total}*`,
    "",
    `Almoço Equipe Fábrica: ${order.fabrica}`,
    `Almoço Equipe Obra: ${order.obra}`,
    `Almoço Equipe Motoristas: ${order.motoristas}`,
    `Almoço Outros: ${order.outros}`
  ];
  if(outrosDescricao){
    lines.push(`Quem são os outros: ${outrosDescricao}`);
  }
  return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join("\n"))}`;
}

async function confirmLunchOrder(){
  if(!canRequestLunch()) return;

  const errorEl=$("lunchDialogError");
  const btn=$("confirmLunchBtn");
  const dialog=$("lunchDialog");
  const values=updateLunchDialogTotal();

  errorEl.textContent="";

  if(![values.fabrica,values.obra,values.motoristas,values.outros].every(Number.isInteger)){
    errorEl.textContent="Informe quantidades inteiras para todas as equipes.";
    return;
  }

  if(values.total<0){
    errorEl.textContent="O total não pode ser negativo.";
    return;
  }

  const outrosDescricao=String($("lunchOutrosDescricao")?.value||"").trim();

  if(values.outros>0 && !outrosDescricao){
    errorEl.textContent="Informe quem são os outros quando a quantidade de Outros for maior que zero.";
    $("lunchOutrosDescricao")?.focus();
    return;
  }

  const order={
    fabrica:values.fabrica,
    obra:values.obra,
    motoristas:values.motoristas,
    outros:values.outros,
    total:values.total,
    outros_descricao:outrosDescricao
  };

  // Abre a janela dentro do gesto do usuário para evitar bloqueio de pop-up
  // depois da chamada assíncrona ao Supabase.
  const whatsappWindow=window.open("about:blank","_blank");

  if(btn) btn.disabled=true;
  setLoading(lunchDialogMode==="edit" ? "Alterando pedido de almoço..." : "Salvando pedido de almoço...");

  try{
    const {data,error}=await sb.rpc("salvar_pedido_almoco",{
      p_quantidade_fabrica:order.fabrica,
      p_quantidade_obra:order.obra,
      p_quantidade_motoristas:order.motoristas,
      p_quantidade_outros:order.outros,
      p_outros_descricao:order.outros_descricao || null
    });
    if(error) throw error;

    lunchOrder=Array.isArray(data) && data.length ? data[0] : {
      data:isoToday(),
      quantidade:order.total,
      quantidade_fabrica:order.fabrica,
      quantidade_obra:order.obra,
      quantidade_motoristas:order.motoristas,
      quantidade_outros:order.outros,
      outros_descricao:order.outros_descricao,
      solicitado_em:new Date().toISOString()
    };

    await loadLunchOrder();

    const whatsappOrder={
      total:order.total,
      fabrica:order.fabrica,
      obra:order.obra,
      motoristas:order.motoristas,
      outros:order.outros,
      outros_descricao:order.outros_descricao
    };
    const whatsappUrl=buildLunchWhatsAppUrl(whatsappOrder);

    if(whatsappWindow && !whatsappWindow.closed){
      whatsappWindow.location.href=whatsappUrl;
    }else{
      window.open(whatsappUrl,"_blank");
    }

    if(dialog?.open) dialog.close();
    setMessage(
      lunchDialogMode==="edit"
        ? `Pedido de almoço alterado para ${order.total} almoço${order.total===1?"":"s"}.`
        : `Pedido de ${order.total} almoço${order.total===1?"":"s"} registrado com sucesso.`,
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
  const printable=rows.map(r=>`
    <tr>
      <td>${esc(r.nome)}</td>
      <td>${r.manha?"P":"—"}</td>
      <td>${r.tarde?"P":"—"}</td>
      <td>${r.extra?"P":"—"}</td>
      <td>${esc(r.observacao||"")}</td>
    </tr>`).join("");

  const lunchTotal=esc($("countLunch")?.textContent||"0");
  const lunchFabrica=esc($("countLunchFabrica")?.textContent||"0");
  const lunchObra=esc($("countLunchObra")?.textContent||"0");
  const lunchMotoristas=esc($("countLunchMotoristas")?.textContent||"0");
  const lunchOutros=esc($("countLunchOutros")?.textContent||"0");
  const lunchStatus=esc($("lunchStatus")?.textContent||"nenhum pedido");

  const win=window.open("","_blank","width=900,height=1000");
  if(!win){
    setMessage("O navegador bloqueou a janela de impressão. Permita pop-ups para exportar o PDF.","error");
    return;
  }

  win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Controle de Presença - ${esc(selectedDate)}</title>
  <style>
    @page{size:A4 portrait;margin:8mm}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0}
    body{
      font-family:Arial,sans-serif;
      color:#172033;
      font-size:8.5px;
      line-height:1.15;
      width:100%;
      max-width:194mm;
      margin:0 auto;
    }
    .header{
      border-bottom:1.5px solid #172033;
      padding-bottom:6px;
      margin-bottom:6px;
    }
    .eyebrow{
      font-size:7px;
      font-weight:800;
      letter-spacing:.12em;
      color:#667085;
      text-transform:uppercase;
    }
    h1{font-size:15px;margin:2px 0 2px}
    .date{font-size:8.5px;color:#667085}

    .top-grid{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:5px;
      margin-bottom:6px;
    }
    .summary{
      display:grid;
      grid-template-columns:repeat(4,1fr);
      gap:4px;
    }
    .summary div{
      padding:4px 5px;
      border:1px solid #dfe3e8;
      border-radius:4px;
      text-align:center;
    }
    .summary span{
      display:block;
      color:#667085;
      font-size:6.8px;
      text-transform:uppercase;
    }
    .summary b{display:block;font-size:11px;margin-top:2px}

    .lunch{
      border:1.5px solid #008b7a;
      border-radius:4px;
      padding:4px 6px;
    }
    .lunch-title{
      font-size:7px;
      font-weight:800;
      color:#007b6d;
      text-transform:uppercase;
      letter-spacing:.05em;
    }
    .lunch-total{
      display:flex;
      align-items:baseline;
      justify-content:space-between;
      border-bottom:1px solid #dfe3e8;
      padding:2px 0 3px;
      margin-bottom:3px;
    }
    .lunch-total span{font-size:7px;font-weight:800}
    .lunch-total b{font-size:15px}
    .lunch-breakdown{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:2px 8px;
      font-size:7px;
    }
    .lunch-breakdown div{
      display:flex;
      justify-content:space-between;
      gap:4px;
    }
    .lunch-status{
      margin-top:3px;
      color:#667085;
      font-size:6.5px;
    }

    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th,td{
      padding:3px 4px;
      border:1px solid #dfe3e8;
      text-align:left;
      vertical-align:middle;
    }
    th{
      background:#f5f7fa;
      font-size:7px;
      text-transform:uppercase;
    }
    td{font-size:8px;height:5.4mm}
    th:first-child,td:first-child{width:39%}
    th:nth-child(2),th:nth-child(3),th:nth-child(4),
    td:nth-child(2),td:nth-child(3),td:nth-child(4){
      text-align:center;
      width:10%;
      font-weight:bold;
    }
    th:last-child,td:last-child{width:31%}
    .foot{
      margin-top:5px;
      color:#667085;
      font-size:6.5px;
      border-top:1px solid #dfe3e8;
      padding-top:4px;
    }
    @media print{
      body{zoom:.92}
      .header,.top-grid,table,.foot{break-inside:avoid}
      tr{break-inside:avoid;page-break-inside:avoid}
    }
  </style></head><body>
  <div class="header">
    <div class="eyebrow">V5 · CONTROLE DE PRESENÇA</div>
    <h1>Controle de Presença</h1>
    <div class="date">Data: ${esc(dateLabel(selectedDate))}</div>
  </div>

  <div class="top-grid">
    <div class="summary">
      <div>Manhã <b>${esc($("countMorning").textContent)}</b></div>
      <div>Tarde <b>${esc($("countAfternoon").textContent)}</b></div>
      <div>Extra <b>${esc($("countExtra").textContent)}</b></div>
      <div>Presença do dia <b>${esc($("countDay").textContent)}</b></div>
    </div>

    <div class="lunch">
      <div class="lunch-title">Almoços solicitados</div>
      <div class="lunch-total">
        <span>ALMOÇO TOTAL DO DIA</span>
        <b>${lunchTotal}</b>
      </div>
      <div class="lunch-breakdown">
        <div><span>Equipe Fábrica</span><b>${lunchFabrica}</b></div>
        <div><span>Equipe Obra</span><b>${lunchObra}</b></div>
        <div><span>Equipe Motoristas</span><b>${lunchMotoristas}</b></div>
        <div><span>Outros</span><b>${lunchOutros}</b></div>
      </div>
      <div class="lunch-status">${lunchStatus}</div>
    </div>
  </div>

  <table>
    <thead><tr><th>Colaborador</th><th>Manhã</th><th>Tarde</th><th>Extra</th><th>Observação</th></tr></thead>
    <tbody>${printable || '<tr><td colspan="5">Nenhum colaborador presente nesta data.</td></tr>'}</tbody>
  </table>

  <div class="foot">P = Presente · — = Ausente/não marcado · Presença do dia = manhã e tarde.</div>
  <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),700)}<\/script>
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
    ["lunchFabrica","lunchObra","lunchMotoristas","lunchOutros"].forEach(id=>{
      $(id)?.addEventListener("input",updateLunchDialogTotal);
    });
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
window.addEventListener("resize",()=>{
  const mobile=isMobileView();
  document.body.classList.toggle("mobile-readonly",mobile);
  if(mobile){
    document.querySelectorAll("#presenceBody input[data-shift], #presenceBody input[data-observation]").forEach(el=>{el.disabled=true;});
  }else{
    document.querySelectorAll("#presenceBody input[data-shift], #presenceBody input[data-observation]").forEach(el=>{el.disabled=false;});
  }
  updateLunchButton();
  updateColumnToggles();
  updateSaveAllButton();
});
boot();
})();
