const APP_VERSION = "5.1.5";
(() => {
"use strict";
const $=id=>document.getElementById(id);
const state={user:null,profile:null,settings:null,movements:[],deliveryHistory:[],month:""};
const isAdmin=()=>state.profile?.role==="admin";
const isMobile=()=>window.matchMedia("(max-width: 650px)").matches;
const canEdit=()=>isAdmin()&&!isMobile();
const escapeHtml=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const fmtKg=v=>`${Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})} kg`;
const fmtNum=v=>Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
const monthNow=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`};
const monthLabel=m=>{const [y,mo]=m.split("-");return new Date(Number(y),Number(mo)-1,1).toLocaleDateString("pt-BR",{month:"long",year:"numeric"})};
const monthMovements=()=>state.movements.filter(m=>String(m.date||"").slice(0,7)===state.month);
const stock=()=>state.movements.reduce((s,m)=>s+(m.type==="entrada"?Number(m.quantity||0):-Number(m.quantity||0)),0);
function dailyConsumption(movs){const map=new Map();movs.filter(m=>m.type==="consumo").forEach(m=>{const d=String(m.date).slice(0,10);map.set(d,(map.get(d)||0)+Number(m.quantity||0));});return map}
function totalConcrete(movs){return movs.filter(m=>m.type==="consumo").reduce((s,m)=>s+Number(m.concretagem_m3||0),0)}
function concreteRatio(movs){
 const kg=movs.filter(m=>m.type==="consumo").reduce((s,m)=>s+Number(m.quantity||0),0);
 const m3=totalConcrete(movs);
 return m3>0?kg/m3:null;
}
function monthlyAverage(movs){const vals=[...dailyConsumption(movs).values()];return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0}
function historicalAverage(){return monthlyAverage(state.movements)}
function recentTenDayAverage(movs){
 const days=[...dailyConsumption(movs).entries()]
   .sort((a,b)=>a[0].localeCompare(b[0]))
   .slice(-10)
   .map(([,value])=>value);
 return days.length?days.reduce((a,b)=>a+b,0)/days.length:0;
}
function monthlyConsumptionExtremes(movs){
 const entries=[...dailyConsumption(movs).entries()].filter(([,value])=>Number(value)>0);
 if(!entries.length)return {max:null,min:null};
 let max=entries[0],min=entries[0];
 for(const entry of entries){
   if(Number(entry[1])>Number(max[1]))max=entry;
   if(Number(entry[1])<Number(min[1]))min=entry;
 }
 return {max,min};
}
function formatDayBr(iso){
 if(!iso)return "Sem consumo registrado";
 const d=new Date(`${iso}T00:00:00`);
 return Number.isNaN(d.getTime())?"Sem consumo registrado":`em ${d.toLocaleDateString("pt-BR")}`;
}
function previousMonth(key){const [y,m]=key.split("-").map(Number);const d=new Date(y,m-2,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`}
function percent(a,b){return b?((a-b)/b)*100:null}
function renderRole(){document.querySelectorAll(".admin-only").forEach(e=>e.classList.toggle("hidden",!canEdit()));$("userRole").textContent=isAdmin()?"ADMIN":"VISUALIZAÇÃO"}
function renderStockAlert(allStock){
 const minimum=Number(state.settings?.minimum_stock||0);
 const critical=Number(state.settings?.critical_stock||0);
 const alert=$("stockAlert");
 if(!alert)return;
 if(minimum<=0 || allStock>minimum){
   alert.classList.add("hidden");
   alert.classList.remove("critical","warning");
   return;
 }
 alert.classList.remove("hidden");
 if(critical>0 && allStock<=critical){
   alert.classList.add("critical"); alert.classList.remove("warning");
   $("stockAlertTitle").textContent="Estoque crítico — solicitar carga de cimento";
   $("stockAlertText").textContent=`Estoque atual de ${fmtKg(allStock)} está abaixo do nível crítico de ${fmtKg(critical)}.`;
 }else{
   alert.classList.add("warning"); alert.classList.remove("critical");
   $("stockAlertTitle").textContent="Solicitar carga de cimento";
   $("stockAlertText").textContent=`Estoque atual de ${fmtKg(allStock)} atingiu o nível mínimo de ${fmtKg(minimum)}.`;
 }
}
function getDeliveryStatus(dateValue){
 const raw=String(dateValue||"").slice(0,10);
 if(!raw) return {key:"none",label:"Próxima entrega de cimento",date:"Sem data de próxima entrega",note:"Data prevista"};
 const today=new Date();
 const todayIso=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
 if(raw===todayIso) return {key:"today",label:"Entrega hoje",date:new Date(`${raw}T00:00:00`).toLocaleDateString("pt-BR"),note:"Programada para hoje"};
 if(raw<todayIso) return {key:"pending",label:"Entrega pendente",date:new Date(`${raw}T00:00:00`).toLocaleDateString("pt-BR"),note:"Data prevista já passou"};
 return {key:"upcoming",label:"Próxima entrega de cimento",date:new Date(`${raw}T00:00:00`).toLocaleDateString("pt-BR"),note:"Data prevista"};
}
function renderTop(){
 const allStock=stock(), cap=Number(state.settings?.capacity||0), occ=cap?allStock/cap*100:0, mm=monthMovements(), avg=monthlyAverage(mm), histAvg=historicalAverage(), recentAvg=recentTenDayAverage(state.movements), extremes=monthlyConsumptionExtremes(mm);
 renderStockAlert(allStock);
 const nextDelivery=state.settings?.next_delivery_date||"";
 const deliveryStatus=getDeliveryStatus(nextDelivery);
 const deliveryKpi=$("deliveryKpi");
 if(deliveryKpi){
   deliveryKpi.classList.remove("delivery-upcoming","delivery-today","delivery-pending","delivery-none");
   deliveryKpi.classList.add(`delivery-${deliveryStatus.key}`);
 }
 if($("nextDeliveryLabel"))$("nextDeliveryLabel").textContent=deliveryStatus.label;
 $("nextDeliveryDate").textContent=deliveryStatus.date;
 $("nextDeliveryStatus").textContent=deliveryStatus.note;
 const deliveryBtn=$("cementDeliveredBtn");
 if(deliveryBtn){
   deliveryBtn.disabled=!nextDelivery||!canEdit();
   deliveryBtn.title=nextDelivery?"Registrar a entrega e informar os kg recebidos":"Não há uma data de entrega cadastrada";
 }
 const cancelDeliveryBtn=$("cancelScheduledDeliveryBtn");
 if(cancelDeliveryBtn){
   cancelDeliveryBtn.disabled=!nextDelivery||!canEdit();
   cancelDeliveryBtn.title=nextDelivery?"Excluir somente a data prevista da entrega":"Não há uma entrega programada";
 }
 const autonomy=recentAvg>0?Math.max(0,allStock/recentAvg):null;
 $("autonomyDays").textContent=autonomy===null?"—":autonomy.toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1});
 $("autonomyStock").textContent=fmtKg(allStock);
 $("autonomyAverage").textContent=recentAvg>0?`${fmtNum(recentAvg)} kg/dia`:"—";
 const autonomyBar=autonomy===null?0:Math.min(autonomy/60*100,100);
 $("autonomyBar").style.width=`${autonomyBar}%`;
 $("autonomyMessage").textContent=autonomy===null?"Ainda não há consumo suficiente para estimar a autonomia":autonomy<7?"Estoque com autonomia inferior a 7 dias":autonomy<15?"Estoque com autonomia inferior a 15 dias":"Estoque com autonomia estimada acima de 15 dias";
 if(autonomy!==null){const eta=new Date();eta.setDate(eta.getDate()+Math.floor(autonomy));$("autonomyDate").textContent=`Estimativa: ${eta.toLocaleDateString("pt-BR")}`}else $("autonomyDate").textContent="—";
 const entries=mm.filter(m=>m.type==="entrada").reduce((s,m)=>s+Number(m.quantity||0),0);
 const cons=mm.filter(m=>m.type==="consumo").reduce((s,m)=>s+Number(m.quantity||0),0);
 const concrete=totalConcrete(mm), ratio=concreteRatio(mm);
 const days=dailyConsumption(mm).size;
 $("stockValue").textContent=fmtKg(allStock);$("capacityValue").textContent=fmtKg(cap);$("occupancyValue").textContent=`${fmtNum(occ)}% ocupado`;
 $("monthlyAverageValue").textContent=`${fmtNum(avg)} kg/dia`;if($("movementCount"))$("movementCount").textContent=mm.length;
 $("maxConsumptionValue").textContent=extremes.max?`${fmtNum(extremes.max[1])} kg`:"—";
 $("maxConsumptionDate").textContent=extremes.max?formatDayBr(extremes.max[0]):"Sem consumo registrado";
 $("minConsumptionValue").textContent=extremes.min?`${fmtNum(extremes.min[1])} kg`:"—";
 $("minConsumptionDate").textContent=extremes.min?formatDayBr(extremes.min[0]):"Sem consumo registrado";
 $("consumptionPerM3Value").textContent=ratio===null?"—":`${fmtNum(ratio)} kg/m³`;
 $("consumptionPerM3Note").textContent=ratio===null?"Sem produção registrada":"no período";
 $("monthEntries").textContent=fmtKg(entries);$("monthConsumption").textContent=fmtKg(cons);$("consumptionDays").textContent=days;$("monthAverage").textContent=`${fmtNum(avg)} kg/dia`;
 if($("monthConcrete"))$("monthConcrete").textContent=`${fmtNum(concrete)} m³`;
 if($("monthConcreteRatio"))$("monthConcreteRatio").textContent=ratio===null?"—":`${fmtNum(ratio)} kg/m³`;
 const ring=document.querySelector(".stock-ring");
 if(ring){
   const ringOcc=Math.min(Math.max(Number(occ)||0,0),100);
   ring.style.background=`conic-gradient(#2563eb 0deg ${ringOcc*3.6}deg, #e9eef5 ${ringOcc*3.6}deg 360deg)`;
 }
 $("siloTitle").textContent=state.settings?.name||"Controle de Silo";$("welcomeTitle").textContent=state.settings?.name||"Painel de controle";
 $("periodLabel").textContent=monthLabel(state.month);$("stockPercent").textContent=`${fmtNum(occ)}%`;
 $("stockBar").style.width=`${Math.min(Math.max(occ,0),100)}%`;
 const status=occ>=90?"Atenção: capacidade próxima do limite":occ>=70?"Estoque em nível elevado":"Capacidade disponível";
 $("stockStatus").textContent=status;
 const prev=state.movements.filter(m=>String(m.date||"").slice(0,7)===previousMonth(state.month));
 const pa=monthlyAverage(prev), diff=percent(avg,pa);
 $("trendValue").textContent=diff===null?"—":`${diff>=0?"↑":"↓"} ${Math.abs(diff).toLocaleString("pt-BR",{maximumFractionDigits:1})}%`;
 $("trendText").textContent=diff===null?"Sem comparação":`vs. ${monthLabel(previousMonth(state.month))}`;
}
function csvCell(value){
 const text=String(value??"");
 const safe=/^[=+\-@]/.test(text.trimStart()) ? "'"+text : text;
 return `"${safe.replaceAll('"','""')}"`;
}
function exportMovementsCsv(){
 const rows=state.movements.slice().sort((a,b)=>new Date(a.date)-new Date(b.date));
 if(!rows.length){
   alert("Não há movimentações para exportar.");
   return;
 }
 const header=["Data","Tipo","Quantidade (kg)","Concretagem (m³)","Observação"];
 const lines=[header.map(csvCell).join(";")];
 rows.forEach(m=>{
   const d=new Date(m.date);
   const date=Number.isNaN(d.getTime())?String(m.date||""):d.toLocaleString("pt-BR");
   const type=m.type==="entrada"?"Entrada":"Consumo";
   lines.push([
     date,
     type,
     Number(m.quantity||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}),
     m.type==="consumo" ? Number(m.concretagem_m3||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}) : "",
     m.observation||""
   ].map(csvCell).join(";"));
 });
 const csv="\uFEFF"+lines.join("\r\n");
 const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
 const url=URL.createObjectURL(blob);
 const a=document.createElement("a");
 const stamp=new Date().toISOString().slice(0,10);
 a.href=url;
 a.download=`controle-silo-movimentacoes-${stamp}.csv`;
 document.body.appendChild(a);
 a.click();
 a.remove();
 URL.revokeObjectURL(url);
}
function renderHistory(){
 const mm=monthMovements().slice().sort((a,b)=>new Date(b.date)-new Date(a.date));
 $("historyBody").innerHTML=mm.map(m=>`<tr><td>${new Date(m.date).toLocaleDateString("pt-BR")} ${new Date(m.date).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</td><td><span class="pill ${m.type}">${m.type==="entrada"?"Entrada":"Consumo"}</span></td><td>${fmtKg(m.quantity)}</td><td>${m.type==="consumo"?(m.concretagem_m3!=null?`${fmtNum(m.concretagem_m3)} m³`:"—"):"—"}</td><td>${escapeHtml(m.observation||"")}</td>${isAdmin()?`<td><button class="tiny" data-edit="${escapeHtml(m.id)}">Editar</button><button class="tiny danger" data-delete="${escapeHtml(m.id)}">Excluir</button></td>`:""}</tr>`).join("")||`<tr><td colspan="6" class="empty">Nenhuma movimentação neste mês.</td></tr>`;
}
function drawConsumptionChart(){
 const c=$("consumptionChart"),ctx=c.getContext("2d"),rect=c.getBoundingClientRect(),dpr=devicePixelRatio||1,w=Math.max(300,rect.width),h=300;
 c.width=w*dpr;c.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);

 const mm=monthMovements(),map=dailyConsumption(mm),[yy,mo]=state.month.split("-").map(Number),days=new Date(yy,mo,0).getDate(),vals=Array.from({length:days},(_,i)=>map.get(`${state.month}-${String(i+1).padStart(2,"0")}`)||0),max=Math.max(...vals,1),left=42,right=18,top=18,bottom=38,cw=w-left-right,ch=h-top-bottom;

 ctx.strokeStyle="#e6eaf0";ctx.lineWidth=1;ctx.font="11px Inter, sans-serif";ctx.fillStyle="#7b8794";
 for(let i=0;i<=4;i++){const y=top+ch-i*ch/4;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(left+cw,y);ctx.stroke();ctx.fillText(fmtNum(max*i/4),4,y+4)}

 ctx.beginPath();vals.forEach((v,i)=>{const x=left+(days===1?0:i/(days-1))*cw,y=top+ch-(v/max)*ch;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.lineTo(left+cw,top+ch);ctx.lineTo(left,top+ch);ctx.closePath();ctx.fillStyle="rgba(37,99,235,.10)";ctx.fill();

 ctx.beginPath();vals.forEach((v,i)=>{const x=left+(days===1?0:i/(days-1))*cw,y=top+ch-(v/max)*ch;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.strokeStyle="#2563eb";ctx.lineWidth=3;ctx.stroke();

 ctx.fillStyle="#7b8794";[0,Math.floor((days-1)/3),Math.floor((days-1)*2/3),days-1].forEach(i=>{const x=left+(days===1?0:i/(days-1))*cw;ctx.fillText(String(i+1).padStart(2,"0"),x-6,h-12)});

 /* Tooltip interativo */
 const panel=c.closest(".chart-panel") || c.parentElement;
 panel.classList.add("chart-tooltip-host");

 let tooltip=panel.querySelector(".chart-tooltip");
 if(!tooltip){
   tooltip=document.createElement("div");
   tooltip.className="chart-tooltip";
   tooltip.setAttribute("role","status");
   tooltip.setAttribute("aria-live","polite");
   panel.appendChild(tooltip);
 }

 const hideTooltip=()=>{
   tooltip.classList.remove("visible");
 };

 const showTooltip=(clientX,clientY)=>{
   const canvasRect=c.getBoundingClientRect();
   const px=clientX-canvasRect.left;
   const plotX=Math.max(left,Math.min(left+cw,px));
   const ratio=days>1?(plotX-left)/cw:0;
   const index=Math.max(0,Math.min(days-1,Math.round(ratio*(days-1))));
   const day=String(index+1).padStart(2,"0");
   const iso=`${state.month}-${day}`;
   const value=Number(vals[index]||0);

   tooltip.innerHTML =
     `<strong>${new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR")}</strong>` +
     `<span>Consumo: <b>${fmtNum(value)} kg</b></span>`;

   const hostRect=panel.getBoundingClientRect();
   let leftPos=clientX-hostRect.left+12;
   let topPos=clientY-hostRect.top-82;

   if(leftPos+180>hostRect.width) leftPos=clientX-hostRect.left-192;
   if(leftPos<8) leftPos=8;
   if(topPos<8) topPos=clientY-hostRect.top+14;

   tooltip.style.left=`${leftPos}px`;
   tooltip.style.top=`${topPos}px`;
   tooltip.classList.add("visible");
 };

 c.onpointermove=(event)=>{
   showTooltip(event.clientX,event.clientY);
 };

 c.onpointerleave=()=>{
   hideTooltip();
 };

 c.onpointerdown=(event)=>{
   showTooltip(event.clientX,event.clientY);
 };
}
function drawMixChart(){
 const c=$("mixChart"),ctx=c.getContext("2d"),r=c.getBoundingClientRect(),dpr=devicePixelRatio||1,w=Math.max(260,r.width),h=250;c.width=w*dpr;c.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const mm=monthMovements(),en=mm.filter(m=>m.type==="entrada").reduce((s,m)=>s+Number(m.quantity||0),0),co=mm.filter(m=>m.type==="consumo").reduce((s,m)=>s+Number(m.quantity||0),0),total=en+co||1;
 const cx=w/2,cy=112,rad=76,ang=-Math.PI/2,a1=ang+en/total*Math.PI*2;
 ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,rad,ang,a1);ctx.closePath();ctx.fillStyle="#2563eb";ctx.fill();
 ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,rad,a1,ang+Math.PI*2);ctx.closePath();ctx.fillStyle="#f59e0b";ctx.fill();
 ctx.fillStyle="#172033";ctx.textAlign="center";ctx.font="700 20px Inter";ctx.fillText(fmtNum(total),cx,cy+5);ctx.font="11px Inter";ctx.fillStyle="#7b8794";ctx.fillText("kg movimentados",cx,cy+23);
 ctx.textAlign="left";ctx.fillStyle="#2563eb";ctx.fillRect(20,210,10,10);ctx.fillStyle="#475467";ctx.fillText(`Entradas  ${fmtNum(en)} kg`,38,219);
 ctx.fillStyle="#f59e0b";ctx.fillRect(170,210,10,10);ctx.fillStyle="#475467";ctx.fillText(`Consumos  ${fmtNum(co)} kg`,188,219);
}
async function cancelScheduledDelivery(){
 if(!canEdit()||!state.settings?.next_delivery_date)return;
 if(!confirm("Excluir a data prevista desta entrega? Nenhuma entrada de cimento será criada."))return;
 try{
   await SiloSupabase.clearNextDelivery();
   await refresh();
 }catch(x){
   const el=$("settingsError");
   if(el)el.textContent=x.message||"Erro ao excluir a entrega programada.";
   else alert(x.message||"Erro ao excluir a entrega programada.");
 }
}
function renderDeliveryHistory(){
 const body=$("deliveryHistoryBody");
 if(!body)return;
 const rows=(state.deliveryHistory||[]).slice(0,5);
 body.innerHTML=rows.map((d,i)=>{
   const raw=String(d.delivered_at||"").slice(0,10);
   const date=raw?new Date(`${raw}T00:00:00`).toLocaleDateString("pt-BR"):"—";
   return `<div class="delivery-history-row"><span class="delivery-history-index">${i+1}</span><span class="delivery-history-label">Entrega de cimento</span><strong class="delivery-history-date">${date}</strong>${canEdit()?`<button type="button" class="btn-delete-delivery" data-delivery-id="${d.id}" title="Apagar registro">Excluir</button>`:""}</div>`;
 }).join("") || `<div class="delivery-history-empty">Nenhuma entrega registrada.</div>`;
}
async function deleteDeliveryRecord(id){
 if(!canEdit()||!id)return;
 if(!confirm("Tem certeza que deseja apagar esta entrega? A entrada de cimento criada por ela também será excluída."))return;
 try{
   await SiloSupabase.deleteCementDelivery(id);
   await refresh();
 }catch(x){
   const el=$("settingsError");
   if(el)el.textContent=x.message||"Erro ao apagar o registro da entrega.";
   else alert(x.message||"Erro ao apagar o registro da entrega.");
 }
}
function render(){renderRole(); $("userRole").textContent=isMobile()?"VISUALIZAÇÃO • CELULAR":(isAdmin()?"ADMIN":"VISUALIZAÇÃO"); renderTop();renderHistory();renderDeliveryHistory();drawConsumptionChart();$("monthPicker").value=state.month;$("siloName").value=state.settings?.name||"";$("siloCapacity").value=state.settings?.capacity||"";
 $("siloMinimum").value=state.settings?.minimum_stock??"";
 $("siloCritical").value=state.settings?.critical_stock??"";
 $("siloNextDelivery").value=state.settings?.next_delivery_date||""}
function setDateTime(){const d=new Date();$("movementDate").value=d.toISOString().slice(0,10);$("movementTime").value=d.toTimeString().slice(0,5)}
function toggleConcreteField(){
 const field=$("movementConcreteField"), input=$("movementConcrete");
 const isConsumption=$("movementType").value==="consumo";
 if(field)field.classList.toggle("hidden",!isConsumption);
 if(input){
   input.required=isConsumption;
   input.disabled=!isConsumption;
   if(!isConsumption)input.value="";
 }
}
function resetForm(){$("movementId").value="";$("movementType").value="entrada";$("movementQuantity").value="";$("movementConcrete").value="";$("movementObservation").value="";setDateTime();$("cancelEdit").classList.add("hidden");toggleConcreteField()}
async function refresh(){state.settings=await SiloSupabase.getSettings();state.movements=await SiloSupabase.getMovements();state.deliveryHistory=await SiloSupabase.getDeliveryHistory();render()}
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
    state.user=await SiloSupabase.getUser();

    // Depois de clicar em "Sair", não fazemos o login automático novamente.
    const manualLogout=sessionStorage.getItem(AUTO_LOGIN_BLOCKED_KEY)==="1";

    if(!state.user && !manualLogout){
      $("loginEmail").value=DEFAULT_VIEWER_EMAIL;
      $("loginPassword").value=DEFAULT_VIEWER_PASSWORD;

      const result=await SiloSupabase.signIn(DEFAULT_VIEWER_EMAIL,DEFAULT_VIEWER_PASSWORD);
      if(result?.error) throw result.error;

      // Usa o usuário retornado pelo próprio login. Não depende de uma
      // segunda leitura imediata da sessão para continuar o boot.
      state.user=result?.data?.user||null;
      if(!state.user) throw new Error("O login automático não retornou um usuário.");
    }

    if(!state.user){
      $("loginEmail").value=DEFAULT_VIEWER_EMAIL;
      $("loginPassword").value=DEFAULT_VIEWER_PASSWORD;
      $("loginScreen").classList.remove("hidden");
      $("appScreen").classList.add("hidden");
      return;
    }

    // Uma autenticação manual/automática bem-sucedida libera o fluxo normal.
    sessionStorage.removeItem(AUTO_LOGIN_BLOCKED_KEY);

    // O getProfile recebe o usuário já autenticado, evitando uma segunda
    // chamada auth.getUser() durante o primeiro carregamento.
    state.profile=await SiloSupabase.getProfile(state.user);
    if(!state.profile){
      // Se a sessão persistida estava velha, tenta uma vez limpar e
      // refazer o login padrão do Viewer.
      if(state.user.email===DEFAULT_VIEWER_EMAIL){
        await SiloSupabase.signOut();
        const retry=await SiloSupabase.signIn(DEFAULT_VIEWER_EMAIL,DEFAULT_VIEWER_PASSWORD);
        if(retry?.error) throw retry.error;
        state.user=retry?.data?.user||null;
        state.profile=state.user?await SiloSupabase.getProfile(state.user):null;
      }
    }
    if(!state.profile) throw new Error("Perfil do usuário não foi encontrado para a sessão autenticada.");

    $("loginScreen").classList.add("hidden");
    $("appScreen").classList.remove("hidden");
    await refresh();
  }catch(x){
    $("loginScreen").classList.remove("hidden");
    $("appScreen").classList.add("hidden");
    $("loginError").textContent=translateAuthError(x?.message||"Não foi possível iniciar a sessão.");
    console.error("Inicialização do Controle de Silo:",x);
  }
}
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();$("loginError").textContent="";try{await SiloSupabase.signIn($("loginEmail").value.trim(),$("loginPassword").value);await boot()}catch(x){$("loginError").textContent=translateAuthError(x?.message||"Falha no login.")}});
$("logoutBtn").addEventListener("click",async()=>{
  try{
    await SiloSupabase.signOut();
  }finally{
    // Impede que o login automático do Viewer aconteça novamente
    // imediatamente após o logout.
    sessionStorage.setItem(AUTO_LOGIN_BLOCKED_KEY,"1");
    location.reload();
  }
});
$("monthPicker").addEventListener("change",e=>{state.month=e.target.value;render()});
$("exportCsvBtn").addEventListener("click",exportMovementsCsv);
$("prevMonth").addEventListener("click",()=>{state.month=previousMonth(state.month);render()});
$("nextMonth").addEventListener("click",()=>{const [y,m]=state.month.split("-").map(Number);const d=new Date(y,m,1);state.month=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;render()});
$("movementForm").addEventListener("submit",async e=>{e.preventDefault();if(!canEdit())return;try{
 const type=$("movementType").value;
 const concrete=Number($("movementConcrete").value);
 const m={type,quantity:Number($("movementQuantity").value),concretagem_m3:type==="consumo"?concrete:null,date:`${$("movementDate").value}T${$("movementTime").value}:00`,observation:$("movementObservation").value.trim()},id=$("movementId").value;
 if(!m.quantity||m.quantity<=0)throw Error("Informe uma quantidade válida.");
 if(type==="consumo"&&(!Number.isFinite(concrete)||concrete<=0))throw Error("Informe a quantidade de concretagem em m³.");
 id?await SiloSupabase.updateMovement(id,m):await SiloSupabase.insertMovement(m);
 resetForm();await refresh();
}catch(x){$("movementError").textContent=x.message||"Erro ao salvar."}});
$("cancelEdit").addEventListener("click",resetForm);
$("movementType").addEventListener("change",toggleConcreteField);
if(isMobile())return; $("historyBody").addEventListener("click",async e=>{const edit=e.target.closest("[data-edit]"),del=e.target.closest("[data-delete]");if(edit){const m=state.movements.find(x=>String(x.id)===edit.dataset.edit);if(!m)return;const d=new Date(m.date);$("movementId").value=m.id;$("movementType").value=m.type;$("movementQuantity").value=m.quantity;$("movementDate").value=String(m.date).slice(0,10);$("movementTime").value=d.toTimeString().slice(0,5);$("movementObservation").value=m.observation||"";$("movementConcrete").value=m.concretagem_m3??"";$("cancelEdit").classList.remove("hidden");toggleConcreteField();window.scrollTo({top:0,behavior:"smooth"})}if(del&&confirm("Excluir esta movimentação?")){try{await SiloSupabase.deleteMovement(del.dataset.delete);await refresh()}catch(x){alert(x.message)}}});
document.addEventListener("click",e=>{
 const btn=e.target.closest(".btn-delete-delivery");
 if(btn) deleteDeliveryRecord(btn.dataset.deliveryId);
});
$("cementDeliveredBtn").addEventListener("click",async()=>{
 if(!canEdit()||!state.settings?.next_delivery_date)return;
 const raw=prompt("Quantos kg de cimento foram entregues?");
 if(raw===null)return;
 const normalized=String(raw).trim().replace(/\\./g,"").replace(",",".");
 const quantity=Number(normalized);
 if(!Number.isFinite(quantity)||quantity<=0){
   alert("Informe uma quantidade válida em kg, maior que zero.");
   return;
 }
 if(!confirm(`Confirmar entrega de ${fmtKg(quantity)}? Será criada uma entrada no estoque com a data de hoje.`))return;
 try{
   await SiloSupabase.registerCementDelivery(quantity);
   await refresh();
 }catch(x){
   const el=$("settingsError");
   if(el)el.textContent=x.message||"Erro ao registrar a entrega do cimento.";
   else alert(x.message||"Erro ao registrar a entrega do cimento.");
 }
});
$("cancelScheduledDeliveryBtn").addEventListener("click",async()=>{await cancelScheduledDelivery()});
$("settingsForm").addEventListener("submit",async e=>{e.preventDefault();if(!canEdit())return;try{const minimum=Number($("siloMinimum").value), critical=Number($("siloCritical").value);
 if(critical>minimum)throw Error("O estoque crítico não pode ser maior que o estoque mínimo.");
 if(minimum>Number($("siloCapacity").value))throw Error("O estoque mínimo não pode ser maior que a capacidade do silo.");
 if(critical>Number($("siloCapacity").value))throw Error("O estoque crítico não pode ser maior que a capacidade do silo.");
 await SiloSupabase.saveSettings($("siloName").value.trim(),Number($("siloCapacity").value),minimum,critical,$("siloNextDelivery").value);await refresh()}catch(x){$("settingsError").textContent=x.message||"Erro ao salvar."}});
window.addEventListener("resize",()=>{
  if(!document.getElementById("appScreen").classList.contains("hidden")){
    render();
    drawConsumptionChart();
  }
});
state.month=monthNow();setDateTime();toggleConcreteField();boot().catch(x=>{$("loginError").textContent=x.message||"Erro ao iniciar.";console.error(x)});
})();