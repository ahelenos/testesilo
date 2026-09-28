const APP_VERSION = "2.6.4";
(() => {
"use strict";
const $=id=>document.getElementById(id);
const state={user:null,profile:null,settings:null,movements:[],month:""};
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
function monthlyAverage(movs){const vals=[...dailyConsumption(movs).values()];return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0}
function previousMonth(key){const [y,m]=key.split("-").map(Number);const d=new Date(y,m-2,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`}
function percent(a,b){return b?((a-b)/b)*100:null}
function renderRole(){document.querySelectorAll(".admin-only").forEach(e=>e.classList.toggle("hidden",!canEdit()));$("userRole").textContent=isAdmin()?"ADMIN":"VISUALIZAÇÃO"}
function renderTop(){
 const allStock=stock(), cap=Number(state.settings?.capacity||0), occ=cap?allStock/cap*100:0, mm=monthMovements(), avg=monthlyAverage(mm);
 const autonomy=avg>0?Math.max(0,allStock/avg):null;
 $("autonomyDays").textContent=autonomy===null?"—":autonomy.toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1});
 $("autonomyStock").textContent=fmtKg(allStock);
 $("autonomyAverage").textContent=avg>0?`${fmtNum(avg)} kg/dia`:"—";
 const autonomyBar=autonomy===null?0:Math.min(autonomy/60*100,100);
 $("autonomyBar").style.width=`${autonomyBar}%`;
 $("autonomyMessage").textContent=autonomy===null?"Ainda não há consumo suficiente para estimar a autonomia":autonomy<7?"Estoque com autonomia inferior a 7 dias":autonomy<15?"Estoque com autonomia inferior a 15 dias":"Estoque com autonomia estimada acima de 15 dias";
 if(autonomy!==null){const eta=new Date();eta.setDate(eta.getDate()+Math.floor(autonomy));$("autonomyDate").textContent=`Estimativa: ${eta.toLocaleDateString("pt-BR")}`}else $("autonomyDate").textContent="—";
 const entries=mm.filter(m=>m.type==="entrada").reduce((s,m)=>s+Number(m.quantity||0),0);
 const cons=mm.filter(m=>m.type==="consumo").reduce((s,m)=>s+Number(m.quantity||0),0);
 const days=dailyConsumption(mm).size;
 $("stockValue").textContent=fmtKg(allStock);$("capacityValue").textContent=fmtKg(cap);$("occupancyValue").textContent=`${fmtNum(occ)}% ocupado`;
 $("monthlyAverageValue").textContent=`${fmtNum(avg)} kg/dia`;$("movementCount").textContent=mm.length;
 $("monthEntries").textContent=fmtKg(entries);$("monthConsumption").textContent=fmtKg(cons);$("consumptionDays").textContent=days;$("monthAverage").textContent=`${fmtNum(avg)} kg/dia`;
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
function renderHistory(){
 const mm=monthMovements().slice().sort((a,b)=>new Date(b.date)-new Date(a.date));
 $("historyBody").innerHTML=mm.map(m=>`<tr><td>${new Date(m.date).toLocaleDateString("pt-BR")} ${new Date(m.date).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</td><td><span class="pill ${m.type}">${m.type==="entrada"?"Entrada":"Consumo"}</span></td><td>${fmtKg(m.quantity)}</td><td>${escapeHtml(m.observation||"")}</td>${isAdmin()?`<td><button class="tiny" data-edit="${escapeHtml(m.id)}">Editar</button><button class="tiny danger" data-delete="${escapeHtml(m.id)}">Excluir</button></td>`:""}</tr>`).join("")||`<tr><td colspan="5" class="empty">Nenhuma movimentação neste mês.</td></tr>`;
}
function drawConsumptionChart(){
 const c=$("consumptionChart"),ctx=c.getContext("2d"),rect=c.getBoundingClientRect(),dpr=devicePixelRatio||1,w=Math.max(300,rect.width),h=300;
 c.width=w*dpr;c.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const mm=monthMovements(),map=dailyConsumption(mm),[yy,mo]=state.month.split("-").map(Number),days=new Date(yy,mo,0).getDate(), vals=Array.from({length:days},(_,i)=>map.get(`${state.month}-${String(i+1).padStart(2,"0")}`)||0), max=Math.max(...vals,1), left=42,right=18,top=18,bottom=38,cw=w-left-right,ch=h-top-bottom;
 ctx.strokeStyle="#e6eaf0";ctx.lineWidth=1;ctx.font="11px Inter, sans-serif";ctx.fillStyle="#7b8794";
 for(let i=0;i<=4;i++){const y=top+ch-i*ch/4;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(left+cw,y);ctx.stroke();ctx.fillText(fmtNum(max*i/4),4,y+4)}
 ctx.beginPath();vals.forEach((v,i)=>{const x=left+(days===1?0:i/(days-1))*cw,y=top+ch-(v/max)*ch;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.lineTo(left+cw,top+ch);ctx.lineTo(left,top+ch);ctx.closePath();ctx.fillStyle="rgba(37,99,235,.10)";ctx.fill();
 ctx.beginPath();vals.forEach((v,i)=>{const x=left+(days===1?0:i/(days-1))*cw,y=top+ch-(v/max)*ch;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.strokeStyle="#2563eb";ctx.lineWidth=3;ctx.stroke();
 ctx.fillStyle="#7b8794";[0,Math.floor((days-1)/3),Math.floor((days-1)*2/3),days-1].forEach(i=>{const x=left+(days===1?0:i/(days-1))*cw;ctx.fillText(String(i+1).padStart(2,"0"),x-6,h-12)});
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
function render(){renderRole(); $("userRole").textContent=isMobile()?"VISUALIZAÇÃO • CELULAR":(isAdmin()?"ADMIN":"VISUALIZAÇÃO"); renderTop();renderHistory();drawConsumptionChart();$("monthPicker").value=state.month;$("siloName").value=state.settings?.name||"";$("siloCapacity").value=state.settings?.capacity||""}
function setDateTime(){const d=new Date();$("movementDate").value=d.toISOString().slice(0,10);$("movementTime").value=d.toTimeString().slice(0,5)}
function resetForm(){$("movementId").value="";$("movementType").value="entrada";$("movementQuantity").value="";$("movementObservation").value="";setDateTime();$("cancelEdit").classList.add("hidden")}
async function refresh(){state.settings=await SiloSupabase.getSettings();state.movements=await SiloSupabase.getMovements();render()}
const DEFAULT_VIEWER_EMAIL="viewer@teste.com";
const DEFAULT_VIEWER_PASSWORD="123456";
const AUTO_LOGIN_BLOCKED_KEY="controleSiloManualLogout";

async function boot(){
  try{
    state.user=await SiloSupabase.getUser();

    // Depois de clicar em "Sair", não fazemos o login automático novamente.
    // Isso permite que o usuário escolha outra conta, como o Admin.
    const manualLogout=sessionStorage.getItem(AUTO_LOGIN_BLOCKED_KEY)==="1";

    if(!state.user && !manualLogout){
      $("loginEmail").value=DEFAULT_VIEWER_EMAIL;
      $("loginPassword").value=DEFAULT_VIEWER_PASSWORD;

      const result=await SiloSupabase.signIn(DEFAULT_VIEWER_EMAIL,DEFAULT_VIEWER_PASSWORD);
      if(result?.error) throw result.error;

      // Use o usuário autenticado retornado pelo Supabase imediatamente.
      state.user=result?.data?.user||await SiloSupabase.getUser();
      if(!state.user) throw new Error("O login automático não retornou uma sessão.");
    }

    if(!state.user){
      $("loginEmail").value=DEFAULT_VIEWER_EMAIL;
      $("loginPassword").value=DEFAULT_VIEWER_PASSWORD;
      $("loginScreen").classList.remove("hidden");
      $("appScreen").classList.add("hidden");
      return;
    }

    // Uma autenticação manual bem-sucedida libera novamente o fluxo normal.
    sessionStorage.removeItem(AUTO_LOGIN_BLOCKED_KEY);

    state.profile=await SiloSupabase.getProfile();
    if(!state.profile) throw new Error("Perfil do usuário Viewer não encontrado.");

    $("loginScreen").classList.add("hidden");
    $("appScreen").classList.remove("hidden");
    await refresh();
  }catch(x){
    $("loginScreen").classList.remove("hidden");
    $("appScreen").classList.add("hidden");
    $("loginError").textContent=x?.message||"Não foi possível iniciar o login automático.";
    console.error("Login automático do Viewer:",x);
  }
}
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();$("loginError").textContent="";try{await SiloSupabase.signIn($("loginEmail").value.trim(),$("loginPassword").value);await boot()}catch(x){$("loginError").textContent=x.message||"Falha no login."}});
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
$("prevMonth").addEventListener("click",()=>{state.month=previousMonth(state.month);render()});
$("nextMonth").addEventListener("click",()=>{const [y,m]=state.month.split("-").map(Number);const d=new Date(y,m,1);state.month=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;render()});
$("movementForm").addEventListener("submit",async e=>{e.preventDefault();if(!canEdit())return;try{const m={type:$("movementType").value,quantity:Number($("movementQuantity").value),date:`${$("movementDate").value}T${$("movementTime").value}:00`,observation:$("movementObservation").value.trim()},id=$("movementId").value;if(!m.quantity||m.quantity<=0)throw Error("Informe uma quantidade válida.");id?await SiloSupabase.updateMovement(id,m):await SiloSupabase.insertMovement(m);resetForm();await refresh()}catch(x){$("movementError").textContent=x.message||"Erro ao salvar."}});
$("cancelEdit").addEventListener("click",resetForm);
if(isMobile())return; $("historyBody").addEventListener("click",async e=>{const edit=e.target.closest("[data-edit]"),del=e.target.closest("[data-delete]");if(edit){const m=state.movements.find(x=>String(x.id)===edit.dataset.edit);if(!m)return;const d=new Date(m.date);$("movementId").value=m.id;$("movementType").value=m.type;$("movementQuantity").value=m.quantity;$("movementDate").value=String(m.date).slice(0,10);$("movementTime").value=d.toTimeString().slice(0,5);$("movementObservation").value=m.observation||"";$("cancelEdit").classList.remove("hidden");window.scrollTo({top:0,behavior:"smooth"})}if(del&&confirm("Excluir esta movimentação?")){try{await SiloSupabase.deleteMovement(del.dataset.delete);await refresh()}catch(x){alert(x.message)}}});
$("settingsForm").addEventListener("submit",async e=>{e.preventDefault();if(!canEdit())return;try{await SiloSupabase.saveSettings($("siloName").value.trim(),Number($("siloCapacity").value));await refresh()}catch(x){$("settingsError").textContent=x.message||"Erro ao salvar."}});
window.addEventListener("resize",()=>{
  if(!document.getElementById("appScreen").classList.contains("hidden")){
    render();
    drawConsumptionChart();
  }
});
state.month=monthNow();setDateTime();boot().catch(x=>{$("loginError").textContent=x.message||"Erro ao iniciar.";console.error(x)});
})();