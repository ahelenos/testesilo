/* Gestão de Fábrica V7.0.0 · Apresentação Comercial · somente leitura */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const sb = window.supabaseClient;
  const TARGET_M3 = 550;
  const SERIES = {
    producao_total_m3: {label:"Produção total", color:"#72a7ff"},
    expedicao_m3: {label:"Expedição", color:"#4ad2bb"},
    montagem_m3: {label:"Montagem", color:"#f5c56f"},
    projetado_m3: {label:"Projetado", color:"#b7a2ff"},
    maquiagem_m3: {label:"Maquiagem", color:"#8cdf9b"},
    recusas_total_m3: {label:"Recusas totais", color:"#ff8a93"},
    recusas_fabrica_m3: {label:"Recusas da fábrica", color:"#ff8a93"},
    outras_recusas_m3: {label:"Outras recusas", color:"#f5c56f"},
    media_funcionarios_dia: {label:"Funcionários/dia", color:"#ae9dfb"},
    eficiencia: {label:"Eficiência", color:"#4ad2bb"}
  };
  const KPINAMES = [
    ["producao_total_m3","Produção total","▥","m³",true],
    ["producao_efetiva_m3","Produção efetiva","↗","m³",true],
    ["expedicao_m3","Expedição","➤","m³",true],
    ["montagem_m3","Montagem","◫","m³",true],
    ["projetado_m3","Projetado","◇","m³",true],
    ["maquiagem_m3","Maquiagem","✦","m³",true],
    ["recusas_total_m3","Recusas totais","!","m³",false],
    ["recusas_fabrica_m3","Recusas da fábrica","⊘","m³",false],
    ["outras_recusas_m3","Outras recusas","≋","m³",false],
    ["media_funcionarios_dia","Funcionários/dia","♟","func./dia",true],
    ["eficiencia","m³ por funcionário","↗","m³/func./dia",true],
    ["consoles_consoles_qtd","Consoles no fechamento","▣","un.",true]
  ];
  let data={months:[],works:[],work_months:[]};
  let authorized=false;
  const nf=(n,d=0)=>Number(n||0).toLocaleString("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:d});
  const vol=n=>nf(n,3)+" m³";
  const val=n=>Number.isFinite(Number(n)) ? Number(n) : 0;
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const monthKey=s=>String(s||"").slice(0,7);
  const fmtMonth=s=>{
    const m=monthKey(s);if(!/^\d{4}-\d{2}$/.test(m))return "—";
    const [y,mo]=m.split("-").map(Number);
    return new Date(Date.UTC(y,mo-1,1)).toLocaleDateString("pt-BR",{month:"short",year:"numeric",timeZone:"UTC"}).replace(/\./g,"");
  };
  const monthOffset=(key,offset)=>{
    const m=monthKey(key);const [y,mo]=m.split("-").map(Number);
    const d=new Date(Date.UTC(y,mo-1+offset,1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`;
  };
  const currentMonth=()=>{
    const d=new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  };
  const shortDate=d=>d?String(d).slice(0,10).split("-").reverse().join("/"):"—";
  function emptyChart(target,message="Não há registros nesse período para este indicador."){
    $(target).innerHTML=`<div class="bi-empty">${esc(message)}</div>`;
  }
  function notify(message,type=""){
    $("biStatus").textContent=message;
    $("biStatus").className="bi-status "+type;
  }
  function params(){
    const end=$("biEndMonth").value||currentMonth();
    const n=Number($("biPeriod").value)||12;
    const start=monthOffset(end,-n+1);
    return {end,n,start,workId:$("biWorkFilter").value};
  }
  function inRange(key,range){return key>=range.start && key<=range.end;}
  function filteredMonths(range=params()){
    return data.months.filter(r=>inRange(monthKey(r.mes),range)).sort((a,b)=>monthKey(a.mes).localeCompare(monthKey(b.mes)));
  }
  function worksInScope(range=params()){
    return data.works.filter(w=>range.workId==="all" || w.id===range.workId);
  }
  function filteredWorkMonths(range=params()){
    return data.work_months.filter(r=>inRange(monthKey(r.mes),range)&&(range.workId==="all"||r.obra_id===range.workId));
  }
  function monthWorkTotals(range=params()){
    const map=new Map();
    filteredWorkMonths(range).forEach(row=>{
      const key=monthKey(row.mes);
      const prev=map.get(key)||{mes:key,pilares:0,consoles:0};
      prev.pilares+=val(row.pilares);prev.consoles+=val(row.consoles);
      map.set(key,prev);
    });
    return Array.from(map.values()).sort((a,b)=>a.mes.localeCompare(b.mes));
  }
  function efficiency(m){
    const v=val(m.producao_total_m3),dias=val(m.dias_trabalhados),workers=val(m.media_funcionarios_dia);
    return dias>0&&workers>0&&v>0?v/dias/workers:0;
  }
  function metric(row,key){
    if(!row)return 0;
    return key==="eficiencia"?efficiency(row):val(row[key]);
  }
  function lastMonthly(rows){return rows.length?rows[rows.length-1]:null;}
  function pctChange(latest,prev){
    if(!prev || prev===0)return null;
    return (latest-prev)/Math.abs(prev)*100;
  }
  function labelPct(pct){
    if(pct===null||!Number.isFinite(pct))return "Sem base anterior";
    return `${pct>=0?"+":""}${nf(pct,1)}% vs. mês anterior`;
  }
  function latestAndPrevious(rows){
    const latest=lastMonthly(rows);
    const previous=latest?rows.find(r=>monthKey(r.mes)===monthOffset(monthKey(latest.mes),-1)):null;
    return {latest,previous};
  }
  function renderKpis(rows){
    const {latest,previous}=latestAndPrevious(rows);
    $("biMonthBadge").textContent=latest?fmtMonth(latest.mes):"Sem fechamento";
    $("biSummaryContext").textContent=latest
      ? `Fechamento de ${fmtMonth(latest.mes)} · dados reais do Supabase.`
      : "Nenhum fechamento cadastrado na janela selecionada.";
    const palette=["#69a6ff","#56d6bf","#f3ca7c","#b59aff","#81bdfb","#8bdbac","#ff9298","#ff9298","#f4c471","#bcaafd","#4bd3be","#f7c96a"];
    $("biKpis").innerHTML=KPINAMES.map(([key,title,icon,unit,higher],i)=>{
      const n=latest?metric(latest,key):null;
      const previousNumber=previous?metric(previous,key):null;
      const pct=previousNumber===null?null:pctChange(n,previousNumber);
      const nice= pct===null?"neutral":Math.abs(pct)<.05?"neutral":(pct>0)===higher?"good":"bad";
      const formatted=n===null?"—":
        key==="media_funcionarios_dia"?nf(n,2):
        key==="eficiencia"?nf(n,2):
        key==="consoles_consoles_qtd"?nf(n,0):nf(n,3);
      const subt=unit==="m³"?"m³":unit;
      return `<article class="bi-kpi" style="--kpi-accent:${palette[i]}">
         <div class="bi-kpi-name"><span>${esc(title)}</span><span class="bi-kpi-mark">${esc(icon)}</span></div>
         <strong>${formatted}</strong><small>${esc(subt)}</small>
         <div><span class="bi-kpi-delta ${nice}">${esc(n===null?"Sem dados":labelPct(pct))}</span></div>
       </article>`;
    }).join("");
  }
  function axisNice(max){
    if(max<=0 || !Number.isFinite(max))return 1;
    const base=Math.pow(10,Math.floor(Math.log10(max)));
    return [1,1.5,2,2.5,4,5,8,10].map(x=>x*base).find(x=>x>=max)||Math.ceil(max/base)*base;
  }
  function pointLabel(x){return esc(fmtMonth(x));}
  function chartLegend(items){
    return `<div class="bi-chart-legend">${items.map(([name,color])=>
      `<span class="bi-legend-item"><i style="--legend-color:${esc(color)}"></i>${esc(name)}</span>`
    ).join("")}</div>`;
  }
  function chartEventBinding(chartId,detailId,initial){
    const el=$(chartId);
    if($(detailId))$(detailId).textContent=initial||"Clique ou toque em uma barra ou ponto para detalhes.";
    const show = target=>{
      const mark=target.closest("[data-chart-point]");
      if(mark&&el.contains(mark)&&$(detailId))$(detailId).textContent=mark.getAttribute("data-chart-detail")||"—";
    };
    el.onclick=e=>show(e.target);
    el.onkeydown=e=>{
      if((e.key==="Enter"||e.key===" ")&&e.target.closest("[data-chart-point]")){
        e.preventDefault();show(e.target);
      }
    };
  }
  function makeSvgFrame({items,maxValue,width=790,height=284,gridCount=4}){
    const pad={left:58,right:25,top:35,bottom:52};
    const innerW=width-pad.left-pad.right,innerH=height-pad.top-pad.bottom;
    const max=axisNice(maxValue*1.12);
    const X=i=>pad.left+innerW*(i+.5)/Math.max(items.length,1);
    const Y=n=>pad.top+innerH*(1-n/max);
    const grid=Array.from({length:gridCount+1},(_,i)=>{
      const amount=max*i/gridCount,y=Y(amount);
      const digits=amount<10&&amount>0?2:0;
      return `<line x1="${pad.left}" x2="${width-pad.right}" y1="${y}" y2="${y}" class="bi-grid"/>
       <text class="bi-axis" x="${pad.left-9}" y="${y+4}" text-anchor="end">${esc(nf(amount,digits))}</text>`;
    }).join("");
    const ticks=items.map((it,i)=>{
      const label=fmtMonth(it.mes);
      const short=label.replace(" de ","/").replace(" ","/");
      return `<text class="bi-axis" x="${X(i)}" y="${height-15}" text-anchor="middle">${esc(short)}</text>`;
    }).join("");
    return {pad,innerW,innerH,max,X,Y,grid,ticks,width,height};
  }
  function graphSvg(chartId,detailId,svgBody,legend=[],message="Clique em um elemento para ver os valores."){
    $(chartId).innerHTML=svgBody+chartLegend(legend);
    chartEventBinding(chartId,detailId,message);
  }
  function barChart(chartId,detailId,rows,{key,label,color="#72a7ff",suffix="",decimals=0,target=null,mean=true,zeroHidden=true,percent=false}){
    const points=rows.filter(r=>!zeroHidden || metric(r,key)>0);
    if(!points.length){emptyChart(chartId);chartEventBinding(chartId,detailId,"Sem dados para este gráfico.");return;}
    const values=points.map(r=>metric(r,key));
    const average=values.reduce((a,b)=>a+b,0)/values.length;
    const maxRaw=Math.max(1e-9,...values,target||0);
    const width=Math.max(690,points.length*48+90);
    const f=makeSvgFrame({items:points,maxValue:maxRaw,width,height:280});
    const group= f.innerW/points.length;
    const bars=points.map((r,i)=>{
      const v=values[i], x=f.X(i)-Math.min(28,group*.32),y=f.Y(v),h=f.Y(0)-y;
      const detail=`${fmtMonth(r.mes)} · ${label}: ${nf(v,decimals)}${suffix}`;
      return `<rect x="${x}" y="${y}" width="${Math.min(56,group*.64)}" height="${Math.max(h,.5)}" rx="5"
          fill="${color}" opacity=".91" role="button" tabindex="0" data-chart-point="1"
          data-chart-detail="${esc(detail)}" aria-label="${esc(detail)}"><title>${esc(detail)}</title></rect>`;
    }).join("");
    const averageY=f.Y(average);
    const averageLine=mean?`<line x1="${f.pad.left}" x2="${f.width-f.pad.right}" y1="${averageY}" y2="${averageY}" class="bi-mean"/>
      <text x="${f.width-f.pad.right-3}" y="${Math.max(15,averageY-7)}" text-anchor="end" font-size="11" fill="#f5c66d">MÉDIA</text>`:"";
    const targetY=target===null?null:f.Y(target);
    const targetLine=targetY===null?"":`<line x1="${f.pad.left}" x2="${f.width-f.pad.right}" y1="${targetY}" y2="${targetY}" class="bi-target"/>
      <text x="${f.pad.left+4}" y="${Math.max(15,targetY-7)}" text-anchor="start" font-size="11" fill="#ff9299">META</text>`;
    const svg=`<svg viewBox="0 0 ${f.width} ${f.height}" style="min-width:${points.length>14?Math.min(width,1250):0}px" role="group"
        aria-label="${esc(label)} — barras mensais">${f.grid}${bars}${averageLine}${targetLine}${f.ticks}</svg>`;
    const leg=[[label,color],...(mean?[["Média","#f6c96b"]]:[]),...(target!==null?[["Meta","#ff6878"]]:[])];
    graphSvg(chartId,detailId,svg,leg,`Média dos meses com dados: ${nf(average,decimals)}${suffix} · ${points.length} meses.`);
  }
  function lineChart(chartId,detailId,rows,keys){
    const present=rows.filter(row=>keys.some(k=>metric(row,k)>0));
    if(!present.length){emptyChart(chartId);chartEventBinding(chartId,detailId,"Sem dados para este gráfico.");return;}
    const vals=present.flatMap(row=>keys.map(k=>metric(row,k)));
    const maxRaw=Math.max(1,...vals,...(keys.some(k=>["producao_total_m3","expedicao_m3","montagem_m3","projetado_m3"].includes(k))?[TARGET_M3]:[]));
    const width=Math.max(750,present.length*50+95);
    const f=makeSvgFrame({items:present,maxValue:maxRaw,width,height:315});
    const lines=keys.map(key=>{
      const c=SERIES[key]?.color||"#aaa";
      const path=present.map((row,i)=>`${i?"L":"M"} ${f.X(i)} ${f.Y(metric(row,key))}`).join(" ");
      const circles=present.map((row,i)=>{
        const amount=metric(row,key),detail=`${fmtMonth(row.mes)} · ${SERIES[key].label}: ${nf(amount,3)} m³`;
        return `<circle cx="${f.X(i)}" cy="${f.Y(amount)}" r="5" fill="${c}" stroke="#152438" stroke-width="2"
           role="button" tabindex="0" data-chart-point="1" data-chart-detail="${esc(detail)}" aria-label="${esc(detail)}">
           <title>${esc(detail)}</title></circle>`;
      }).join("");
      return `<path d="${path}" stroke="${c}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" fill="none"/>${circles}`;
    }).join("");
    const showTarget=keys.some(k=>["producao_total_m3","expedicao_m3","montagem_m3","projetado_m3"].includes(k));
    const targetY=f.Y(TARGET_M3);
    const targetLine=showTarget?`<line x1="${f.pad.left}" x2="${f.width-f.pad.right}" y1="${targetY}" y2="${targetY}" class="bi-target"/>
      <text x="${f.width-f.pad.right}" y="${Math.max(15,targetY-6)}" text-anchor="end" font-size="11" fill="#ff9299">META</text>`:"";
    const legend=keys.map(k=>[SERIES[k].label,SERIES[k].color]).concat(showTarget?[["Meta 550 m³","#ff6878"]]:[]);
    graphSvg(chartId,detailId,`<svg viewBox="0 0 ${f.width} ${f.height}" style="min-width:${present.length>14?Math.min(width,1250):0}px"
       role="group" aria-label="Evolução de volumes em m³">${f.grid}${lines}${targetLine}${f.ticks}</svg>`,
       legend,`${present.length} meses com dados · clique ou toque em um ponto para consultar o valor.`);
  }
  function stackedChart(chartId,detailId,rows){
    const points=rows.filter(r=>metric(r,"recusas_total_m3")>0);
    if(!points.length){emptyChart(chartId);chartEventBinding(chartId,detailId,"Nenhuma recusa registrada nesta janela.");return;}
    const maxRaw=Math.max(...points.map(r=>metric(r,"recusas_total_m3")),1);
    const width=Math.max(700,points.length*48+90);
    const f=makeSvgFrame({items:points,maxValue:maxRaw,width,height:280});
    const bw=Math.min(55,f.innerW/points.length*.65);
    const bars=points.map((r,i)=>{
      const factory=metric(r,"recusas_fabrica_m3");
      const total=metric(r,"recusas_total_m3");
      const other=Math.max(0,metric(r,"outras_recusas_m3"));
      const reported=factory+other;
      const heightA=f.Y(0)-f.Y(factory);
      const heightB=f.Y(0)-f.Y(other);
      const x=f.X(i)-bw/2;
      const partA=`<rect x="${x}" y="${f.Y(factory)}" width="${bw}" height="${heightA}" fill="#ff8b91" rx="2"/>`;
      const partB=`<rect x="${x}" y="${f.Y(reported)}" width="${bw}" height="${heightB}" fill="#f5c96b" rx="2"/>`;
      const detail=`${fmtMonth(r.mes)} · Fábrica: ${nf(factory,3)} m³ · Outras: ${nf(other,3)} m³ · Total: ${nf(total,3)} m³`;
      return `<g role="button" tabindex="0" data-chart-point="1" data-chart-detail="${esc(detail)}" aria-label="${esc(detail)}"><title>${esc(detail)}</title>${partA}${partB}</g>`;
    }).join("");
    graphSvg(chartId,detailId,`<svg viewBox="0 0 ${f.width} ${f.height}" style="min-width:${points.length>14?Math.min(width,1250):0}px" role="group" aria-label="Recusas por origem">${f.grid}${bars}${f.ticks}</svg>`,
      [["Recusas da fábrica","#ff8b91"],["Outras recusas","#f5c96b"]],"Barras empilhadas em m³ · selecione um mês.");
  }
  function renderDonut(rows){
    const latest=lastMonthly(rows),node=$("biDonutChart");
    if(!latest || metric(latest,"producao_total_m3")<=0){node.innerHTML='<div class="bi-empty">Sem fechamento com produção neste período.</div>';$("biDonutDetail").textContent="—";return;}
    const total=metric(latest,"producao_total_m3"),reject=Math.max(0,metric(latest,"recusas_fabrica_m3"));
    const effective=Math.max(0,total-reject),ratio=Math.max(0,Math.min(100,effective/total*100));
    node.innerHTML=`<div class="bi-donut" role="img" aria-label="${esc(nf(ratio,1))}% de produção efetiva" style="background:conic-gradient(#4ad2bb 0% ${ratio}%,#ff8b91 ${ratio}% 100%)">
      <div class="bi-donut-center"><strong>${nf(ratio,1)}%</strong><span>Aproveitamento</span></div>
      </div><div class="bi-donut-side">
      <div><span>Produção efetiva</span><strong>${nf(effective,3)} m³</strong></div>
      <div><span>Recusas da fábrica</span><strong>${nf(reject,3)} m³</strong></div></div>`;
    $("biDonutDetail").textContent=`Fechamento de ${fmtMonth(latest.mes)}. Índice = (produção total − recusas da fábrica) ÷ produção total.`;
  }
  function targetChart(rows){
    const mapped=rows.map(r=>({...r,atingimento:metric(r,"producao_total_m3")/TARGET_M3*100}));
    barChart("biTargetChart","biTargetDetail",mapped,{
      key:"atingimento",label:"Atingimento da meta",color:"#f5c56f",suffix:"%",decimals:1,target:100,mean:false
    });
  }
  function renderCharts(rows,range){
    const chosen=$("biIndicator").value;
    const keys=chosen==="all"
      ? ["producao_total_m3","expedicao_m3","montagem_m3","projetado_m3"]
      : [chosen];
    lineChart("biHeroChart","biHeroDetail",rows,keys);
    barChart("biProductionChart","biProductionDetail",rows,{
      key:"producao_total_m3",label:"Produção total",color:"#72a7ff",suffix:" m³",decimals:3,target:TARGET_M3
    });
    lineChart("biFlowChart","biFlowDetail",rows,["expedicao_m3","montagem_m3"]);
    lineChart("biMakeupChart","biMakeupDetail",rows,["maquiagem_m3","projetado_m3"]);
    targetChart(rows);
    stackedChart("biRefusalChart","biRefusalDetail",rows);
    renderDonut(rows);
    barChart("biEfficiencyChart","biEfficiencyDetail",
      rows.map(r=>({...r,eficiencia:efficiency(r)})),{
        key:"eficiencia",label:"Eficiência",color:"#4ad2bb",suffix:" m³/func./dia",decimals:2
      });
    barChart("biPeopleChart","biPeopleDetail",rows,{
      key:"media_funcionarios_dia",label:"Funcionários/dia",color:"#ad99fd",suffix:" funcionários",decimals:2
    });
    barChart("biConsolesChart","biConsolesDetail",monthWorkTotals(range),{
      key:"consoles",label:"Consoles executados",color:"#f5c56f",suffix:" un.",decimals:0
    });
  }
  function renderWorks(range){
    const works=worksInScope(range),periodRows=filteredWorkMonths(range);
    const totalAll=works.reduce((s,w)=>s+val(w.pilares_total),0);
    const doneAll=works.reduce((s,w)=>s+val(w.pilares_concluidos),0);
    const pilaresPeriod=periodRows.reduce((s,r)=>s+val(r.pilares),0);
    const consolesPeriod=periodRows.reduce((s,r)=>s+val(r.consoles),0);
    $("biWorksBadge").textContent=range.workId==="all"?"Todas as obras":(works[0]?.nome||"Obra");
    $("biWorksStats").innerHTML=[
      ["Obras analisadas",works.length],
      ["Pilares cadastrados",totalAll],
      ["Pilares concluídos (acumulado)",doneAll],
      ["Consoles no período",consolesPeriod]
    ].map(([label,n])=>`<div class="bi-work-stat"><small>${esc(label)}</small><strong>${nf(n)}</strong></div>`).join("");
    const ranked=[...works].filter(w=>val(w.pilares_total)>0).sort((a,b)=>{
      const ap=val(a.pilares_concluidos)/val(a.pilares_total),bp=val(b.pilares_concluidos)/val(b.pilares_total);
      return bp-ap || a.nome.localeCompare(b.nome,"pt-BR");
    }).slice(0,8);
    $("biWorksRanking").innerHTML=ranked.length?ranked.map((w,i)=>{
      const progress=Math.min(100,val(w.pilares_concluidos)/val(w.pilares_total)*100);
      return `<div class="bi-rank-row">
       <span class="bi-rank-index">${String(i+1).padStart(2,"0")}</span>
       <span class="bi-rank-name" title="${esc(w.nome)}">${esc(w.nome)}</span>
       <div class="bi-rank-track"><div class="bi-rank-fill" style="width:${progress}%"></div></div>
       <strong>${nf(progress,0)}%</strong></div>`;
    }).join(""):'<div class="bi-empty">Ainda não há obras com pilares cadastrados.</div>';
    $("biWorksCards").innerHTML=works.length?works.sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR")).map(w=>{
      const total=val(w.pilares_total),done=val(w.pilares_concluidos),pct=total?Math.min(100,done/total*100):0;
      return `<article class="bi-work-item"><header><span>${esc(w.nome)}</span><span class="bi-work-badge">${nf(pct,0)}%</span></header>
       <p>${nf(total)} pilares · ${nf(done)} concluídos · ${nf(Math.max(0,total-done))} pendentes</p>
       <div class="bi-progress-track"><i style="width:${pct}%"></i></div>
       <footer><span>${nf(val(w.consoles_total))} consoles (acumulado)</span>
       <span>Última execução: ${esc(shortDate(w.ultima_execucao))}</span></footer></article>`;
    }).join(""):'<div class="bi-empty">Nenhuma obra encontrada.</div>';
    return {totalAll,doneAll,pilaresPeriod,consolesPeriod,works};
  }
  function renderInsights(rows,workInfo){
    const {latest,previous}=latestAndPrevious(rows);
    const items=[];
    if(latest){
      const prod=metric(latest,"producao_total_m3");
      const attainment=prod/TARGET_M3*100;
      items.push(["Meta industrial",`${nf(attainment,1)}% da meta`,
        `A produção de ${fmtMonth(latest.mes)} foi de ${nf(prod,3)} m³. A referência de 550 m³ ${prod>=TARGET_M3?"foi atingida":"ainda não foi atingida"} nesse fechamento.`]);
      if(previous){
        const prev=metric(previous,"producao_total_m3");
        const change=pctChange(prod,prev);
        items.push(["Tendência mensal",change===null?"Base indisponível":`${change>=0?"+":""}${nf(change,1)}% na produção`,
        `Comparação com ${fmtMonth(previous.mes)}: ${nf(prev,3)} m³ no mês anterior e ${nf(prod,3)} m³ no último fechamento disponível.`]);
      }
      const loss=prod>0?metric(latest,"recusas_fabrica_m3")/prod*100:0;
      if(prod>0)items.push(["Qualidade",`${nf(loss,2)}% de recusas da fábrica`,
        `Proporção de recusas atribuídas à fábrica em ${fmtMonth(latest.mes)}, calculada sobre a produção total.`]);
      const efficiencyValue=efficiency(latest);
      if(efficiencyValue>0)items.push(["Eficiência",`${nf(efficiencyValue,2)} m³/func./dia`,
        `Calculado a partir da produção total, dos ${nf(metric(latest,"dias_trabalhados"),0)} dias trabalhados e da equipe média real.`]);
    }
    const nonzero=rows.filter(r=>metric(r,"producao_total_m3")>0);
    if(nonzero.length){
      const best=[...nonzero].sort((a,b)=>metric(b,"producao_total_m3")-metric(a,"producao_total_m3"))[0];
      items.push(["Destaque do período",`${nf(metric(best,"producao_total_m3"),3)} m³`,
        `${fmtMonth(best.mes)} foi o mês de maior produção entre os ${nonzero.length} fechamentos com produção na janela selecionada.`]);
    }
    if(workInfo.works.length){
      items.push(["Execução por obra",`${nf(workInfo.pilaresPeriod)} pilares no período`,
        `${nf(workInfo.consolesPeriod)} consoles executados no intervalo filtrado. O avanço acumulado é de ${nf(workInfo.doneAll)} de ${nf(workInfo.totalAll)} pilares cadastrados.`]);
    }
    $("biInsights").innerHTML=items.length?items.slice(0,6).map(([kind,title,description])=>
      `<article class="bi-insight"><span class="bi-insight-tag">${esc(kind)}</span><strong>${esc(title)}</strong><p>${esc(description)}</p></article>`
    ).join(""):'<div class="bi-empty">Os destaques aparecerão quando houver fechamentos e execuções cadastradas.</div>';
  }
  function focusSections(){
    const choice=$("biFocus").value;
    const panels={performance:$("biPerformance"),quality:$("biQuality"),works:$("biWorks")};
    for(const [name,element] of Object.entries(panels)){
      element.hidden=choice!=="all"&&choice!==name;
    }
    $("biOverview").hidden=choice==="works";
    $("biInsightsSection").hidden=false;
  }
  function render(){
    const range=params();
    const months=filteredMonths(range);
    $("biSnapshotLabel").textContent=`${fmtMonth(range.start)} — ${fmtMonth(range.end)}`;
    renderKpis(months);
    renderCharts(months,range);
    const worksInfo=renderWorks(range);
    renderInsights(months,worksInfo);
    focusSections();
    if(!data.months.length && !data.works.length)notify("Sem dados cadastrados ainda. Os gráficos serão preenchidos à medida que os módulos forem utilizados.","ok");
    else notify(`Dados carregados: ${months.length} fechamento(s) e ${worksInfo.works.length} obra(s) na seleção.`, "ok");
  }
  function populateWorkSelect(){
    const select=$("biWorkFilter");
    const current=select.value;
    const sorted=[...data.works].sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR"));
    select.innerHTML='<option value="all">Todas as obras</option>'+
      sorted.map(w=>`<option value="${esc(w.id)}">${esc(w.nome)}</option>`).join("");
    if(current==="all"||sorted.some(w=>w.id===current))select.value=current;
  }
  async function refreshData(){
    if(!authorized)return;
    $("biRefresh").disabled=true;
    notify("Atualizando indicadores do Supabase…");
    try{
      const {data:result,error}=await sb.rpc("bi_apresentacao_dados");
      if(error)throw error;
      if(!result||typeof result!=="object")throw new Error("A consulta retornou um formato inesperado.");
      data={
        months:Array.isArray(result.months)?result.months:[],
        works:Array.isArray(result.works)?result.works:[],
        work_months:Array.isArray(result.work_months)?result.work_months:[]
      };
      // Não modifica os registros. Apenas inicializa o filtro com o último fechamento,
      // se o usuário ainda não tiver selecionado um período.
      if(!$("biEndMonth").value){
        $("biEndMonth").value=monthKey(
          data.months[data.months.length-1]?.mes||currentMonth()
        );
      }
      $("biUpdated").textContent=result.generated_at
        ?`Atualizado em ${new Date(result.generated_at).toLocaleString("pt-BR")}`
        :"Dados atualizados";
      populateWorkSelect();render();
    }catch(err){
      console.error("Apresentação Comercial:",err);
      const msg=String(err.message||err);
      notify(msg.includes("bi_apresentacao_dados")
        ?"A consulta BI ainda não está disponível. Execute a migração SQL da V7.0.0 no Supabase."
        :`Não foi possível atualizar o painel: ${msg}`,"error");
    }finally{
      $("biRefresh").disabled=false;
    }
  }
  async function setPresentation(enabled){
    document.body.classList.toggle("bi-presenting",enabled);
    $("biPresentation").hidden=enabled;
    $("biExitPresentation").hidden=!enabled;
    if(enabled){
      if($("biApp").requestFullscreen){
        try{await $("biApp").requestFullscreen();}catch(_){}
      }
      window.scrollTo({top:0,behavior:"smooth"});
    }else if(document.fullscreenElement){
      try{await document.exitFullscreen();}catch(_){}
    }
  }
  function bindEvents(){
    for(const id of ["biPeriod","biEndMonth","biWorkFilter","biFocus","biIndicator"]){
      $(id).addEventListener("change",()=>render());
    }
    $("biRefresh").addEventListener("click",refreshData);
    $("biPrint").addEventListener("click",()=>window.print());
    $("biPresentation").addEventListener("click",()=>setPresentation(true));
    $("biExitPresentation").addEventListener("click",()=>setPresentation(false));
    $("biLogout").addEventListener("click",async()=>{await SiloSupabase.signOut();location.replace("index.html");});
    document.addEventListener("keydown",event=>{
      if(event.key==="Escape"&&document.body.classList.contains("bi-presenting"))setPresentation(false);
    });
    document.addEventListener("fullscreenchange",()=>{
      if(!document.fullscreenElement&&document.body.classList.contains("bi-presenting"))setPresentation(false);
    });
  }
  async function boot(){
    try{
      if(!sb||!window.SiloSupabase)throw new Error("Biblioteca de autenticação não disponível.");
      const user=await SiloSupabase.getUser();
      if(!user){location.replace("index.html");return;}
      const profile=await SiloSupabase.getProfile(user);
      if(!profile||profile.active===false){location.replace("index.html");return;}
      const {data:isGlobalAdmin,error:adminError}=await sb.rpc("is_global_admin");
      if(adminError)throw adminError;
      let perm="none";
      if(isGlobalAdmin===true)perm="admin";
      else{
        const permissions=await SiloSupabase.getModulePermissions(user);
        perm=String(permissions.apresentacao_comercial||"none").toLowerCase();
      }
      if(!["viewer","admin"].includes(perm)){location.replace("index.html?access=denied");return;}
      authorized=true;
      $("biApp").hidden=false;
      $("biSplash").hidden=true;
      bindEvents();
      await refreshData();
    }catch(err){
      console.error("Inicialização BI:",err);
      $("biSplashText").textContent=`Não foi possível iniciar: ${String(err.message||err)}.`;
    }
  }
  boot();
})();
