/* Gestão de Fábrica V7.0.2 · Inteligência Administrativa · somente leitura */
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
  let insightsCache=[];
  let revealedObserver=null;
  let tipLeaveTimer=null;
  const motionAllowed=()=>!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const KPI_ADDITIVE=new Set([
    "producao_total_m3","producao_efetiva_m3","expedicao_m3","montagem_m3",
    "projetado_m3","maquiagem_m3","recusas_total_m3","recusas_fabrica_m3",
    "outras_recusas_m3","consoles_consoles_qtd"
  ]);
  const MONTH_NAMES=["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

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
    const year=Number($("biYear").value)||Number(currentMonth().slice(0,4));
    const selection=$("biMonthFilter").value;
    const chosenMonth=selection!=="all";
    const mode=chosenMonth?"month":$("biPeriod").value;
    const monthEnd=chosenMonth?`${year}-${selection}`:
      data.months.map(m=>monthKey(m.mes)).filter(m=>m.startsWith(`${year}-`)).at(-1)||
      `${year}-12`;
    const n=Number(mode)||12;
    const start=mode==="year"?`${year}-01`:mode==="month"?monthEnd:monthOffset(monthEnd,-n+1);
    const end=mode==="year"?`${year}-12`:monthEnd;
    return {start,end,n,mode,year,workId:$("biWorkFilter").value};
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
  // Consoles: fechos historicos sao imutaveis. Para meses sem fechamento,
  // usa-se o Controle Consoles atual. Ao filtrar uma obra, somente os
  // registros daquela obra sao pertinentes (fechamentos nao tem obra).
  function consolesTimeline(range=params()){
    const byMonth=new Map();
    monthWorkTotals(range).forEach(r=>{
      byMonth.set(monthKey(r.mes),{
        mes:monthKey(r.mes),consoles:val(r.consoles),pilares:val(r.pilares),
        source:"controle"
      });
    });
    if(range.workId==="all"){
      filteredMonths(range).forEach(r=>{
        byMonth.set(monthKey(r.mes),{
          mes:monthKey(r.mes),
          consoles:val(r.consoles_consoles_qtd),
          pilares:val(r.consoles_pecas_qtd),
          source:"fechamento"
        });
      });
    }
    return [...byMonth.values()].sort((a,b)=>a.mes.localeCompare(b.mes));
  }
  function consolesBreakdown(range=params()){
    const series=consolesTimeline(range);
    const historico=series.filter(r=>r.source==="fechamento");
    const controle=series.filter(r=>r.source==="controle");
    const sum=list=>list.reduce((acc,r)=>acc+val(r.consoles),0);
    return {series,historico,controle,total:sum(series),
      totalHistorico:sum(historico),totalControle:sum(controle)};
  }
  function consolesOrigin(row){
    return row.source==="fechamento"
      ?"Fechamento mensal preservado":"Controle Consoles · execução por obra";
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
    const previous=latest?data.months.find(r=>monthKey(r.mes)===monthOffset(monthKey(latest.mes),-1)):null;
    return {latest,previous};
  }
  function aggregateMonths(rows){
    const result={mes:rows.at(-1)?.mes||"",dias_trabalhados:0,media_funcionarios_dia:0};
    for(const [key] of KPINAMES)if(KPI_ADDITIVE.has(key))result[key]=0;
    let workerDays=0;
    rows.forEach(row=>{
      for(const [key] of KPINAMES)if(KPI_ADDITIVE.has(key))result[key]+=metric(row,key);
      const days=metric(row,"dias_trabalhados");
      result.dias_trabalhados+=days;
      workerDays+=days*metric(row,"media_funcionarios_dia");
    });
    result.media_funcionarios_dia=result.dias_trabalhados>0?workerDays/result.dias_trabalhados:0;
    result.eficiencia=workerDays>0?result.producao_total_m3/workerDays:0;
    result.meses_com_dados=rows.length;
    return result;
  }
  function comparePeriod(range,rows){
    if(!rows.length)return null;
    if(range.mode==="month"){
      const prior=monthOffset(range.end,-1);
      return data.months.find(r=>monthKey(r.mes)===prior)||null;
    }
    const previous=rows.map(r=>data.months.find(other=>
      monthKey(other.mes)===monthOffset(monthKey(r.mes),-12))).filter(Boolean);
    return previous.length===rows.length?aggregateMonths(previous):null;
  }
  function comparedLabel(range){
    return range.mode==="month"?"vs. mês anterior":"vs. ano anterior (meses equivalentes)";
  }
  function animateCounters(){
    if(!motionAllowed())return;
    document.querySelectorAll("[data-count-value]").forEach(el=>{
      const amount=Number(el.dataset.countValue),decimals=Number(el.dataset.countDecimals||0);
      if(!Number.isFinite(amount))return;
      const start=performance.now(),duration=760;
      function frame(now){
        if(!el.isConnected)return;
        const progress=Math.min(1,(now-start)/duration);
        const eased=1-Math.pow(1-progress,3);
        el.textContent=nf(amount*eased,decimals);
        if(progress<1)requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }
  function renderKpis(rows,range){
    const latest=lastMonthly(rows);
    const consolidated=aggregateMonths(rows);
    const compare=comparePeriod(range,rows);
    const unitLabel=range.mode==="month"?"Fechamento mensal":"Total consolidado";
    $("biMonthBadge").textContent=range.mode==="month"?fmtMonth(range.end):
      `${range.year} · ${rows.length} ${rows.length===1?"mês":"meses"} com fechamento`;
    $("biSummaryContext").textContent=rows.length
      ? `${unitLabel} · ${rows.length} ${rows.length===1?"fechamento":"fechamentos"} na seleção · clique em um indicador para explorar seu histórico.`
      : "Nenhum fechamento cadastrado na janela selecionada.";
    const palette=["#69a6ff","#56d6bf","#f3ca7c","#b59aff","#81bdfb","#8bdbac","#ff9298","#ff9298","#f4c471","#bcaafd","#4bd3be","#f7c96a"];
    $("biKpis").innerHTML=KPINAMES.map(([key,title,icon,unit,higher],i)=>{
      const n=rows.length?metric(range.mode==="month"?latest:consolidated,key):null;
      const previousNumber=compare?metric(compare,key):null;
      const pct=previousNumber===null||n===null?null:pctChange(n,previousNumber);
      const nice=pct===null?"neutral":Math.abs(pct)<.05?"neutral":(pct>0)===higher?"good":"bad";
      const decimals=key==="media_funcionarios_dia"||key==="eficiencia"?2:key==="consoles_consoles_qtd"?0:3;
      const formatted=n===null?"—":nf(n,decimals);
      return `<button type="button" class="bi-kpi bi-interactive" data-kpi-key="${esc(key)}"
        style="--kpi-accent:${palette[i]}" aria-label="${esc(title)}: ${esc(formatted)} ${esc(unit)}. Ver detalhes">
         <div class="bi-kpi-name"><span>${esc(title)}</span><span class="bi-kpi-mark">${esc(icon)}</span></div>
         <strong ${n!==null?`data-count-value="${n}" data-count-decimals="${decimals}"`:""}>${formatted}</strong>
         <small>${esc(unit)} ${range.mode==="month"?"· mês":"· consolidado"}</small>
         <div><span class="bi-kpi-delta ${nice}">${esc(n===null?"Sem dados":pct===null?"Sem período comparável":`${pct>=0?"+":""}${nf(pct,1)}% ${comparedLabel(range)}`)}</span></div>
         <span class="bi-card-open">Explorar indicador ↗</span>
       </button>`;
    }).join("");
    animateCounters();
  }
  function renderPulse(rows,range,worksInfo){
    const s=aggregateMonths(rows);
    const achieved=rows.filter(r=>metric(r,"producao_total_m3")>=TARGET_M3).length;
    const monthsLabel=range.mode==="month"?"Mês selecionado":`Ano de ${range.year}`;
    const items=[
      ["VISÃO",monthsLabel,"calendar-days"],
      ["VOLUME PRODUZIDO",`${nf(s.producao_total_m3,3)} m³`,"trending-up"],
      ["FECHAMENTOS",`${rows.length} meses com dados`,"database"],
      ["META ATINGIDA",`${achieved} ${achieved===1?"mês":"meses"}`,"target"],
      ["OBRAS",`${worksInfo.works.length} em análise`,"building-2"]
    ];
    $("biPulseBar").innerHTML=items.map(([label,value])=>
      `<span class="bi-pulse-item"><small>${esc(label)}</small><strong>${esc(value)}</strong></span>`).join("");
  }
  function miniSpark(values,color){
    if(!values.length)return '<div class="bi-spark-empty">Aguardando registros do período</div>';
    const max=Math.max(1,...values.map(val)),w=230,h=54,left=4,right=226;
    const points=values.map((v,i)=>{
      const x=values.length===1?115:left+(right-left)*i/(values.length-1);
      return [x,49-(val(v)/max)*38];
    });
    const d=points.map(([x,y],i)=>`${i?"L":"M"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
    const [x,y]=points[points.length-1];
    return `<svg class="bi-impact-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <path d="${d}" stroke="${color}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" class="bi-animated-line" pathLength="1"/>
      <circle cx="${x}" cy="${y}" r="4.3" fill="${color}" stroke="#13263d" stroke-width="2"/>
    </svg>`;
  }
  function renderImpact(rows,range){
    const summary=aggregateMonths(rows),breakdown=consolesBreakdown(range);
    const total=val(summary.producao_total_m3);
    const effective=val(summary.producao_efetiva_m3);
    const targetBase=rows.length*TARGET_M3;
    const targetPct=targetBase>0?total/targetBase*100:0;
    const yieldPct=total>0?effective/total*100:0;
    const days=val(summary.dias_trabalhados);
    const productivity=val(summary.eficiencia);
    const items=[
      {label:"RITMO INDUSTRIAL",title:rows.length?`${nf(targetPct,1)}%`:"—",
       subtitle:`Produção acumulada sobre ${nf(targetBase,0)} m³ de referência (${nf(rows.length)} fechamento(s) × 550 m³)`,
       color:"#f5c56f",pct:targetPct,
       trend:rows.map(r=>val(r.producao_total_m3)/TARGET_M3*100),focus:"producao_total_m3",note:"META POR COMPETÊNCIA"},
      {label:"ÍNDICE DE APROVEITAMENTO",title:total?`${nf(yieldPct,2)}%`:"—",
       subtitle:`${nf(effective,3)} m³ de produção efetiva em ${nf(total,3)} m³ produzidos`,
       color:"#4bd8c8",pct:yieldPct,
       trend:rows.map(r=>val(r.producao_total_m3)?val(r.producao_efetiva_m3)/val(r.producao_total_m3)*100:0),
       focus:"producao_efetiva_m3",note:"QUALIDADE"},
      {label:"EFICIÊNCIA POR EQUIPE",title:days?`${nf(productivity,2)}`:"—",
       subtitle:`m³ por funcionário/dia · ${nf(days)} dias trabalhados analisados`,
       color:"#b9a3ff",pct:null,
       trend:rows.map(r=>efficiency(r)),focus:"eficiencia",note:"PRODUTIVIDADE"},
      {label:"CONSOLES DOCUMENTADOS",title:nf(breakdown.total),
       subtitle:range.workId==="all"
          ?`${nf(breakdown.totalHistorico)} históricos · ${nf(breakdown.totalControle)} em meses sem fechamento`
          :`Consoles da obra selecionada no período`,
       color:"#73aaff",pct:null,
       trend:breakdown.series.map(r=>r.consoles),focus:"consoles",note:"SÉRIE HISTÓRICA"}
    ];
    $("biImpactGrid").innerHTML=items.map((it,i)=>{
      const pct=it.pct===null?0:Math.max(0,Math.min(100,it.pct));
      return `<button type="button" class="bi-impact-card" data-stage-focus="${esc(it.focus)}"
       style="--impact-color:${it.color};--impact-progress:${pct}%"
       aria-label="${esc(it.label)} ${esc(it.title)}. Explorar indicador">
       <div class="bi-impact-card-top"><span>${esc(it.label)}</span><span class="bi-impact-index">0${i+1}</span></div>
       <div class="bi-impact-body">
         <div class="bi-impact-gauge ${it.pct===null?"bi-impact-orb":""}"><div class="bi-impact-gauge-core"><strong>${esc(it.title)}</strong></div></div>
         ${miniSpark(it.trend,it.color)}
       </div>
       <p>${esc(it.subtitle)}</p>
       <footer><span>${esc(it.note)}</span><span>EXPLORAR ↗</span></footer>
      </button>`;
    }).join("");
  }
  function renderTimeline(range){
    const year=String(range.year);
    const keys=new Set([
      ...data.months.map(r=>monthKey(r.mes)),
      ...data.work_months.map(r=>monthKey(r.mes))
    ].filter(k=>k.startsWith(`${year}-`)));
    const monthKeys=[...keys].sort();
    const choices=[`<button type="button" class="bi-timeline-chip ${range.mode==="year"?"active":""}"
        data-timeline-month="all" aria-pressed="${range.mode==="year"}">
        <span class="bi-timeline-dot"></span> ANO COMPLETO</button>`];
    monthKeys.forEach(k=>{
      const closing=data.months.some(r=>monthKey(r.mes)===k);
      const selected=range.mode==="month"&&range.end===k;
      choices.push(`<button type="button" class="bi-timeline-chip ${selected?"active":""}"
        data-timeline-month="${esc(k.slice(5))}" aria-pressed="${selected}" title="${closing?"Fechamento registrado":"Dados de consoles"}">
        <span class="bi-timeline-dot ${closing?"closing":"execution"}"></span> ${esc(fmtMonth(k))}</button>`);
    });
    $("biTimeline").innerHTML=choices.join("")+
      (monthKeys.length?"":'<span class="bi-timeline-none">Sem meses cadastrados neste ano.</span>');
  }
  function axisNice(max){
    if(max<=0 || !Number.isFinite(max))return 1;
    const base=Math.pow(10,Math.floor(Math.log10(max)));
    return [1,1.5,2,2.5,4,5,8,10].map(x=>x*base).find(x=>x>=max)||Math.ceil(max/base)*base;
  }
  function pointLabel(x){return esc(fmtMonth(x));}
  function chartLegend(items){
    return `<div class="bi-chart-legend">${items.map(([name,color,key])=>key
      ?`<button type="button" class="bi-legend-item bi-legend-button"
           data-series-legend="${esc(key)}" aria-pressed="false"
           title="Clique para destacar esta série"><i style="--legend-color:${esc(color)}"></i>${esc(name)}</button>`
      :`<span class="bi-legend-item"><i style="--legend-color:${esc(color)}"></i>${esc(name)}</span>`
    ).join("")}</div>`;
  }
  function updateLegendFocus(el,key){
    const active=el.dataset.activeSeries===key?"":key;
    el.dataset.activeSeries=active;
    el.querySelectorAll("[data-series-key]").forEach(g=>{
      g.classList.toggle("bi-series-muted",!!active&&g.dataset.seriesKey!==active);
    });
    el.querySelectorAll("[data-series-legend]").forEach(button=>{
      const isSelected=!!active&&button.dataset.seriesLegend===active;
      button.classList.toggle("is-selected",isSelected);
      button.setAttribute("aria-pressed",String(isSelected));
    });
  }
  function updateTooltip(text,x,y){
    const tip=$("biFloatingTooltip");
    if(!tip)return;
    tip.textContent=text;
    tip.hidden=false;
    const bounds=tip.getBoundingClientRect();
    tip.style.left=`${Math.max(12,Math.min(x+17,window.innerWidth-bounds.width-12))}px`;
    tip.style.top=`${Math.max(12,Math.min(y+16,window.innerHeight-bounds.height-12))}px`;
  }
  function hideTooltip(){
    const tip=$("biFloatingTooltip");
    if(tip)tip.hidden=true;
  }
  let highlightedMonth="";
  function synchronizeMonth(month){
    if(highlightedMonth===month)return;
    highlightedMonth=month||"";
    document.querySelectorAll(".bi-chart-canvas [data-point-month]").forEach(node=>{
      const active=Boolean(month)&&node.getAttribute("data-point-month")===month;
      node.classList.toggle("bi-synced-point",active);
    });
    document.querySelectorAll(".bi-timeline-chip[data-timeline-month]").forEach(chip=>{
      chip.classList.toggle("bi-timeline-hover",Boolean(month)&&chip.dataset.timelineMonth===month.slice(5,7));
    });
  }
  function chartEventBinding(chartId,detailId,initial){
    const el=$(chartId);
    if($(detailId))$(detailId).textContent=initial||"Clique ou toque em uma barra ou ponto para detalhes.";
    const markFor=target=>target.closest?.("[data-chart-point]");
    const show=target=>{
      const mark=markFor(target);
      if(mark&&el.contains(mark)&&$(detailId))$(detailId).textContent=mark.getAttribute("data-chart-detail")||"—";
      return mark;
    };
    el.onclick=e=>{
      const legend=e.target.closest?.("[data-series-legend]");
      if(legend){updateLegendFocus(el,legend.dataset.seriesLegend);hideTooltip();return;}
      const mark=show(e.target);
      if(mark)openPointDetail(mark,chartId);
    };
    el.onpointermove=e=>{
      const mark=show(e.target);
      if(mark&&e.pointerType!=="touch"){
        updateTooltip(mark.dataset.chartDetail||"—",e.clientX,e.clientY);
        synchronizeMonth(mark.dataset.pointMonth||"");
      }else{hideTooltip();synchronizeMonth("");}
    };
    el.onpointerleave=()=>{hideTooltip();synchronizeMonth("");};
    el.onfocusin=e=>{
      const mark=show(e.target);
      if(mark){
        const rect=mark.getBoundingClientRect();
        updateTooltip(mark.dataset.chartDetail||"—",rect.left,rect.top);
        synchronizeMonth(mark.dataset.pointMonth||"");
      }
    };
    el.onfocusout=()=>{hideTooltip();synchronizeMonth("");};
    el.onkeydown=e=>{
      const mark=markFor(e.target);
      if((e.key==="Enter"||e.key===" ")&&mark){
        e.preventDefault();show(e.target);openPointDetail(mark,chartId);
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
  function barChart(chartId,detailId,rows,{key,label,color="#72a7ff",suffix="",decimals=0,target=null,mean=true,zeroHidden=true,percent=false,colorFor=null,detailFor=null,legendOverride=null}){
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
      const detail=detailFor?detailFor(r,v):`${fmtMonth(r.mes)} · ${label}: ${nf(v,decimals)}${suffix}`;
      const barColor=colorFor?colorFor(r):color;
      return `<rect class="bi-animated-bar" x="${x}" y="${y}" width="${Math.min(56,group*.64)}" height="${Math.max(h,.5)}" rx="5"
          fill="${barColor}" opacity=".91" role="button" tabindex="0" data-chart-point="1"
          data-point-month="${esc(monthKey(r.mes))}" data-point-key="${esc(key)}"
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
    const leg=[...(legendOverride||[[label,color]]),...(mean?[["Média","#f6c96b"]]:[]),...(target!==null?[["Meta","#ff6878"]]:[])];
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
        return `<circle cx="${f.X(i)}" cy="${f.Y(amount)}" r="6" fill="${c}" stroke="#152438" stroke-width="2"
           role="button" tabindex="0" data-chart-point="1" data-point-month="${esc(monthKey(row.mes))}"
           data-point-key="${esc(key)}" data-chart-detail="${esc(detail)}" aria-label="${esc(detail)}">
           <title>${esc(detail)}</title></circle>`;
      }).join("");
      return `<g class="bi-series" data-series-key="${esc(key)}">
        <path class="bi-animated-line" pathLength="1" d="${path}" stroke="${c}" stroke-width="3" stroke-linejoin="round"
          stroke-linecap="round" fill="none"/>${circles}</g>`;
    }).join("");
    const showTarget=keys.some(k=>["producao_total_m3","expedicao_m3","montagem_m3","projetado_m3"].includes(k));
    const targetY=f.Y(TARGET_M3);
    const targetLine=showTarget?`<line x1="${f.pad.left}" x2="${f.width-f.pad.right}" y1="${targetY}" y2="${targetY}" class="bi-target"/>
      <text x="${f.width-f.pad.right}" y="${Math.max(15,targetY-6)}" text-anchor="end" font-size="11" fill="#ff9299">META</text>`:"";
    const legend=keys.map(k=>[SERIES[k].label,SERIES[k].color,k]).concat(showTarget?[["Meta 550 m³","#ff6878"]]:[]);
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
      return `<g role="button" tabindex="0" data-chart-point="1" data-point-month="${esc(monthKey(r.mes))}"
        data-point-key="recusas_total_m3" data-chart-detail="${esc(detail)}" aria-label="${esc(detail)}">
        <title>${esc(detail)}</title>${partA}${partB}</g>`;
    }).join("");
    graphSvg(chartId,detailId,`<svg viewBox="0 0 ${f.width} ${f.height}" style="min-width:${points.length>14?Math.min(width,1250):0}px" role="group" aria-label="Recusas por origem">${f.grid}${bars}${f.ticks}</svg>`,
      [["Recusas da fábrica","#ff8b91"],["Outras recusas","#f5c96b"]],"Barras empilhadas em m³ · selecione um mês.");
  }
  function renderDonut(rows){
    const aggregate=aggregateMonths(rows),node=$("biDonutChart");
    if(!rows.length || metric(aggregate,"producao_total_m3")<=0){node.innerHTML='<div class="bi-empty">Sem fechamento com produção neste período.</div>';$("biDonutDetail").textContent="—";return;}
    const total=metric(aggregate,"producao_total_m3"),reject=Math.max(0,metric(aggregate,"recusas_fabrica_m3"));
    const effective=Math.max(0,total-reject),ratio=Math.max(0,Math.min(100,effective/total*100));
    node.innerHTML=`<div class="bi-donut" role="button" tabindex="0" aria-label="${esc(nf(ratio,1))}% de produção efetiva. Clique para ampliar" style="background:conic-gradient(#4ad2bb 0% ${ratio}%,#ff8b91 ${ratio}% 100%)">
      <div class="bi-donut-center"><strong>${nf(ratio,1)}%</strong><span>Aproveitamento</span></div>
      </div><div class="bi-donut-side">
      <div><span>Produção efetiva</span><strong>${nf(effective,3)} m³</strong></div>
      <div><span>Recusas da fábrica</span><strong>${nf(reject,3)} m³</strong></div></div>`;
    $("biDonutDetail").textContent=`Consolidado de ${rows.length} fechamento(s). Índice = (produção total − recusas da fábrica) ÷ produção total. Clique no gráfico para detalhes.`;
    node.onclick=event=>{if(event.target.closest(".bi-donut"))openChartDetail("biDonutChart");};
    node.onkeydown=event=>{
      if((event.key==="Enter"||event.key===" ")&&event.target.closest(".bi-donut")){
        event.preventDefault();openChartDetail("biDonutChart");
      }
    };
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
    const consolidatedConsoles=consolesBreakdown(range);
    barChart("biConsolesChart","biConsolesDetail",consolidatedConsoles.series,{
      key:"consoles",label:"Consoles registrados",color:"#f5c56f",
      suffix:" un.",decimals:0,zeroHidden:false,
      colorFor:r=>r.source==="fechamento"?"#f5c56f":"#4bd8c8",
      detailFor:(r,v)=>`${fmtMonth(r.mes)} · ${nf(v)} consoles · ${consolesOrigin(r)} · ${nf(r.pilares)} pilares/peças`,
      legendOverride:range.workId==="all"
        ?[["Fechamentos históricos","#f5c56f"],["Controle Consoles (meses sem fechamento)","#4bd8c8"]]
        :[["Execuções da obra","#4bd8c8"]]
    });
    const explanation=$("biConsolesSource");
    if(explanation){
      explanation.innerHTML=range.workId==="all"
        ?`<span class="bi-source-dot gold"></span> ${nf(consolidatedConsoles.historico.length)} ${consolidatedConsoles.historico.length===1?"mês":"meses"} do Fechamentos de Mês ·
          <span class="bi-source-dot teal"></span> ${nf(consolidatedConsoles.controle.length)} ${consolidatedConsoles.controle.length===1?"mês":"meses"} sem fechamento (Controle Consoles).
          <strong>Total: ${nf(consolidatedConsoles.total)} consoles.</strong>`
        :`<span class="bi-source-dot teal"></span> Filtro por obra: somente execuções registradas no Controle Consoles.
          <strong>${nf(consolidatedConsoles.total)} consoles no período.</strong>`;
    }
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
      ["Consoles no controle (período)",consolesPeriod]
    ].map(([label,n])=>`<div class="bi-work-stat"><small>${esc(label)}</small><strong>${nf(n)}</strong></div>`).join("");
    const ranked=[...works].filter(w=>val(w.pilares_total)>0).sort((a,b)=>{
      const ap=val(a.pilares_concluidos)/val(a.pilares_total),bp=val(b.pilares_concluidos)/val(b.pilares_total);
      return bp-ap || a.nome.localeCompare(b.nome,"pt-BR");
    }).slice(0,8);
    $("biWorksRanking").innerHTML=ranked.length?ranked.map((w,i)=>{
      const progress=Math.min(100,val(w.pilares_concluidos)/val(w.pilares_total)*100);
      return `<button type="button" class="bi-rank-row bi-interactive" data-work-id="${esc(w.id)}" aria-label="Detalhes da obra ${esc(w.nome)}">
       <span class="bi-rank-index">${String(i+1).padStart(2,"0")}</span>
       <span class="bi-rank-name" title="${esc(w.nome)}">${esc(w.nome)}</span>
       <div class="bi-rank-track"><div class="bi-rank-fill" style="width:${progress}%"></div></div>
       <strong>${nf(progress,0)}%</strong></button>`;
    }).join(""):'<div class="bi-empty">Ainda não há obras com pilares cadastrados.</div>';
    $("biWorksCards").innerHTML=works.length?works.sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR")).map(w=>{
      const total=val(w.pilares_total),done=val(w.pilares_concluidos),pct=total?Math.min(100,done/total*100):0;
      return `<button type="button" class="bi-work-item bi-interactive" data-work-id="${esc(w.id)}" aria-label="Explorar obra ${esc(w.nome)}"><header><span>${esc(w.nome)}</span><span class="bi-work-badge">${nf(pct,0)}%</span></header>
       <p>${nf(total)} pilares · ${nf(done)} concluídos · ${nf(Math.max(0,total-done))} pendentes</p>
       <div class="bi-progress-track"><i style="width:${pct}%"></i></div>
       <footer><span>${nf(val(w.consoles_total))} consoles (acumulado)</span>
       <span>Última execução: ${esc(shortDate(w.ultima_execucao))}</span></footer><span class="bi-work-cta">Abrir painel da obra ↗</span></button>`;
    }).join(""):'<div class="bi-empty">Nenhuma obra encontrada.</div>';
    return {totalAll,doneAll,pilaresPeriod,consolesPeriod,works};
  }
  function renderInsights(rows,workInfo,range){
    const summary=aggregateMonths(rows),latest=lastMonthly(rows),items=[];
    const add=(kind,title,description,key="producao_total_m3",tone="blue",icon="✧")=>
      items.push({kind,title,description,key,tone,icon});
    if(rows.length){
      const total=metric(summary,"producao_total_m3");
      const productive=rows.filter(r=>metric(r,"producao_total_m3")>0);
      const mean=productive.length?total/productive.length:0;
      const hits=rows.filter(r=>metric(r,"producao_total_m3")>=TARGET_M3).length;
      add("Produção consolidada",`${nf(total,3)} m³`,
        `Soma de ${rows.length} fechamento(s). Média mensal dos meses com produção: ${nf(mean,3)} m³.`,"producao_total_m3","blue","◈");
      add("Meta industrial",`${hits} ${hits===1?"mês":"meses"} na meta`,
        `De ${rows.length} fechamento(s), ${hits} atingiram pelo menos 550 m³ de produção no mês.`,
        "producao_total_m3","gold","◎");
      if(productive.length){
        const best=[...productive].sort((a,b)=>metric(b,"producao_total_m3")-metric(a,"producao_total_m3"))[0];
        add("Recorde de produção",`${nf(metric(best,"producao_total_m3"),3)} m³`,
          `O maior volume de produção foi registrado em ${fmtMonth(best.mes)}.`,"producao_total_m3","blue","★");
      }
      if(total>0){
        const refuse=metric(summary,"recusas_fabrica_m3");
        add("Aproveitamento",`${nf(100-refuse/total*100,2)}%`,
          `Recusas da fábrica totalizaram ${nf(refuse,3)} m³, equivalentes a ${nf(refuse/total*100,2)}% da produção.`,
          "recusas_fabrica_m3","teal","◇");
      }
      add("Expedição consolidada",`${nf(metric(summary,"expedicao_m3"),3)} m³`,
        `Volume expedido ao longo dos meses selecionados, conforme fechamentos registrados.`,
        "expedicao_m3","gold","➤");
      const bestDispatch=rows.filter(r=>metric(r,"expedicao_m3")>0)
        .sort((a,b)=>metric(b,"expedicao_m3")-metric(a,"expedicao_m3"))[0];
      if(bestDispatch)add("Pico de expedição",`${fmtMonth(bestDispatch.mes)}`,
        `${nf(metric(bestDispatch,"expedicao_m3"),3)} m³ expedidos no mês de destaque.`,
        "expedicao_m3","gold","↗");
      const maquillage=metric(summary,"maquiagem_m3");
      if(maquillage>0)add("Acabamento industrial",`${nf(maquillage,3)} m³`,
        `Volume de maquiagem acumulado nos ${rows.length} fechamentos, sem estimar serviços fora do sistema.`,
        "maquiagem_m3","purple","✧");
      if(rows.length){
        const monthlyMean=rows.filter(r=>metric(r,"producao_total_m3")>0);
        if(monthlyMean.length){
          const meanVolume=total/monthlyMean.length,difference=meanVolume-TARGET_M3;
          add("Distância da meta mensal",`${difference>=0?"+":""}${nf(difference,2)} m³`,
            `Média mensal de ${nf(meanVolume,2)} m³ em ${monthlyMean.length} mês(es) com produção; diferença para a meta de 550 m³.`,
            "producao_total_m3",difference>=0?"teal":"coral","◎");
        }
      }
      const qualityMonths=rows.filter(r=>metric(r,"producao_total_m3")>0);
      if(qualityMonths.length){
        const best=[...qualityMonths].sort((a,b)=>
          (metric(b,"producao_efetiva_m3")/metric(b,"producao_total_m3"))-
          (metric(a,"producao_efetiva_m3")/metric(a,"producao_total_m3")))[0];
        const rate=metric(best,"producao_efetiva_m3")/metric(best,"producao_total_m3")*100;
        add("Melhor aproveitamento",`${nf(rate,2)}% · ${fmtMonth(best.mes)}`,
          `Percentual de produção efetiva sobre o total no melhor mês com volume positivo.`,
          "producao_efetiva_m3","teal","✦");
      }
      const productiveMonths=rows.filter(r=>efficiency(r)>0);
      if(productiveMonths.length){
        const best=[...productiveMonths].sort((a,b)=>efficiency(b)-efficiency(a))[0];
        add("Pico de produtividade",`${nf(efficiency(best),2)} m³/func./dia`,
          `Maior produtividade mensal em ${fmtMonth(best.mes)}, considerando produção, dias e equipe.`,
          "eficiencia","purple","✦");
        add("Eficiência consolidada",`${nf(summary.eficiencia,2)} m³/func./dia`,
          `Produção consolidada dividida pela soma dos funcionários-dia do período.`,
          "eficiencia","teal","◉");
      }
      if(metric(summary,"projetado_m3")>0||metric(summary,"montagem_m3")>0){
        add("Projetado e montagem",`${nf(metric(summary,"projetado_m3"),2)} / ${nf(metric(summary,"montagem_m3"),2)} m³`,
          `Volumes acumulados por atividade; não representam necessariamente um saldo de obras pendentes.`,
          "montagem_m3","purple","▣");
      }
      const {previous}=latestAndPrevious(rows);
      if(latest&&previous){
        const curr=metric(latest,"producao_total_m3"),prev=metric(previous,"producao_total_m3");
        const variation=pctChange(curr,prev);
        add("Tendência mais recente",variation===null?"Sem base comparável":`${variation>=0?"+":""}${nf(variation,1)}%`,
          `Comparação de ${fmtMonth(latest.mes)} (${nf(curr,3)} m³) com ${fmtMonth(previous.mes)} (${nf(prev,3)} m³).`,
          "producao_total_m3",variation!==null&&variation>=0?"teal":"coral","↕");
      }
    }
    if(workInfo.works.length){
      const donePct=workInfo.totalAll?100*workInfo.doneAll/workInfo.totalAll:0;
      add("Carteira de obras",`${nf(donePct,1)}% dos pilares`,
        `${nf(workInfo.doneAll)} pilares concluídos de ${nf(workInfo.totalAll)} cadastrados; avanço acumulado, não restrito ao ano.`,
        "works","teal","▦");
      const historic=consolesBreakdown(range);
      add(range.workId==="all"?"Consoles · visão integrada":"Consoles · obra selecionada",
        `${nf(historic.total)} consoles`,
        range.workId==="all"
          ?`${nf(historic.totalHistorico)} consoles preservados nos fechamentos e ${nf(historic.totalControle)} de meses sem fechamento. Sem duplicar competências.`
          :`Execuções da obra selecionada no período. Os fechamentos pertencem à fábrica inteira.`,
        "works","gold","▣");
      const most=[...workInfo.works].sort((a,b)=>val(b.consoles_total)-val(a.consoles_total))[0];
      if(most&&val(most.consoles_total)>0)add("Obra em destaque",most.nome,
        `${nf(most.consoles_total)} consoles acumulados e ${nf(most.pilares_concluidos)} pilares concluídos.`,
        "work:"+most.id,"purple","★");
    }
    insightsCache=items;
    $("biInsightsSummary").innerHTML=rows.length
      ?`<div class="bi-insight-hero"><span class="bi-eyebrow">LEITURA ESTRATÉGICA</span>
        <strong>${range.mode==="month"?"Panorama do mês":"Panorama consolidado"} · ${esc(range.mode==="month"?fmtMonth(range.end):String(range.year))}</strong>
        <p>${rows.length} fechamento(s) analisado(s). Meses sem fechamento não são contabilizados como zero.</p></div>
        <div class="bi-insight-side"><span class="bi-eyebrow">META 550 m³</span>
          <strong>${rows.filter(r=>metric(r,"producao_total_m3")>=TARGET_M3).length} de ${rows.length}</strong>
          <p>fechamentos atingiram a meta mensal.</p></div>`
      :`<div class="bi-empty">Não há fechamentos registrados nesse período.</div>`;
    $("biInsights").innerHTML=items.length?items.map((it,index)=>
      `<button type="button" class="bi-insight bi-interactive tone-${it.tone}" data-insight-index="${index}"
        aria-label="Detalhes: ${esc(it.kind)}">
        <div class="bi-insight-top"><span class="bi-insight-tag">${esc(it.kind)}</span>
          <span class="bi-insight-icon" aria-hidden="true">${esc(it.icon)}</span></div>
        <strong>${esc(it.title)}</strong><p>${esc(it.description)}</p>
        <span class="bi-insight-cta">Explorar análise ↗</span></button>`
    ).join(""):'<div class="bi-empty">Os destaques aparecerão quando houver fechamentos e execuções cadastradas.</div>';
  }

  let storyIndex=0;
  function renderStorySpotlight(){
    const host=$("biStorySpotlight");
    if(!host)return;
    if(!insightsCache.length){host.innerHTML="";return;}
    storyIndex=(storyIndex+insightsCache.length)%insightsCache.length;
    const it=insightsCache[storyIndex];
    const progress=(storyIndex+1)/insightsCache.length*100;
    host.innerHTML=`<div class="bi-story-left">
      <span class="bi-eyebrow">EXPERIÊNCIA EXECUTIVA · DESTAQUE ${storyIndex+1} / ${insightsCache.length}</span>
      <h3>${esc(it.kind)}</h3><strong>${esc(it.title)}</strong>
      <p>${esc(it.description)}</p>
      <button type="button" class="bi-story-open" data-story-open="1">Abrir análise completa ↗</button>
      </div>
      <div class="bi-story-right">
        <div class="bi-story-orb" aria-hidden="true"><span>${esc(it.icon)}</span></div>
        <div class="bi-story-nav">
          <button type="button" data-story-nav="-1" aria-label="Destaque anterior">←</button>
          <span>${String(storyIndex+1).padStart(2,"0")} / ${String(insightsCache.length).padStart(2,"0")}</span>
          <button type="button" data-story-nav="1" aria-label="Próximo destaque">→</button>
        </div>
      </div>
      <div class="bi-story-track" aria-hidden="true"><span style="width:${progress}%"></span></div>`;
    document.querySelectorAll(".bi-insight[data-insight-index]").forEach(el=>
      el.classList.toggle("bi-insight-featured",Number(el.dataset.insightIndex)===storyIndex));
  }
  function navigateStory(step){
    if(!insightsCache.length)return;
    storyIndex=(storyIndex+step+insightsCache.length)%insightsCache.length;
    renderStorySpotlight();
  }
  function formatMetric(key,value){
    const decimals=key==="eficiencia"||key==="media_funcionarios_dia"?2:
      key==="consoles_consoles_qtd"||key==="dias_trabalhados"?0:3;
    const unit=key==="eficiencia"?" m³/func./dia":
      key==="media_funcionarios_dia"?" func./dia":
      key==="consoles_consoles_qtd"?" un.":key==="dias_trabalhados"?" dias":" m³";
    return `${nf(value,decimals)}${unit}`;
  }
  function statPanel(label,value,detail=""){
    return `<div class="bi-dialog-stat"><small>${esc(label)}</small><strong>${esc(value)}</strong>
      ${detail?`<span>${esc(detail)}</span>`:""}</div>`;
  }
  function modalTable(headers,rows){
    return `<div class="bi-dialog-table-wrap"><table class="bi-dialog-table">
      <thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(row=>`<tr>${row.map(c=>`<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></div>`;
  }
  function openDialog(kicker,title,subtitle,body){
    hideTooltip();
    const dialog=$("biDetailDialog");
    $("biDialogKicker").textContent=kicker;
    $("biDialogTitle").textContent=title;
    $("biDialogSubtitle").textContent=subtitle;
    $("biDialogBody").innerHTML=body;
    if(!dialog.open)dialog.showModal();
    dialog.scrollTop=0;
  }
  function openKpiDetail(key,context=""){
    const range=params(),rows=filteredMonths(range),aggregated=aggregateMonths(rows);
    const info=KPINAMES.find(k=>k[0]===key);
    if(!info)return;
    const [,title]=info;
    const values=rows.map(r=>({mes:monthKey(r.mes),value:metric(r,key)}));
    const avg=values.length?values.reduce((s,v)=>s+v.value,0)/values.length:0;
    const peak=values.length?[...values].sort((a,b)=>b.value-a.value)[0]:null;
    const total=metric(aggregated,key);
    const interpretation=key==="media_funcionarios_dia"
      ?"Média ponderada pelo número de dias trabalhados: soma dos funcionários-dia dividida pela soma dos dias. Não é soma de médias mensais."
      :key==="eficiencia"
      ?"Produção total dividida pela soma de funcionários-dia. As médias mensais não são somadas."
      :"Valores mensais dos fechamentos salvos. Meses ausentes não são tratados como registros de valor zero.";
    const headline=range.mode==="month"&&values.length?values[0].value:total;
    let body=`<div class="bi-dialog-stats">
      ${statPanel(range.mode==="month"?"Valor do mês":"Indicador consolidado",formatMetric(key,headline))}
      ${statPanel("Meses com fechamento",nf(rows.length))}
      ${statPanel("Maior registro",peak?formatMetric(key,peak.value):"—",peak?fmtMonth(peak.mes):"")}
      ${statPanel("Média mensal",rows.length?formatMetric(key,avg):"—")}
      </div><p class="bi-dialog-note">${esc(interpretation)}</p>`;
    if(context)body+=`<p class="bi-dialog-callout">${esc(context)}</p>`;
    body+=`<h3>Evolução mensal detalhada</h3>`+
      (values.length?modalTable(["Mês","Valor registrado"],values.map(v=>[fmtMonth(v.mes),formatMetric(key,v.value)])):
      '<div class="bi-empty">Nenhum fechamento no período.</div>');
    openDialog("DETALHE DO INDICADOR",title,
      `${fmtMonth(range.start)} — ${fmtMonth(range.end)} · dados reais do Supabase`,body);
  }
  const CHART_KEYS={
    biHeroChart:["producao_total_m3","expedicao_m3","montagem_m3","projetado_m3"],
    biProductionChart:["producao_total_m3"],
    biFlowChart:["expedicao_m3","montagem_m3"],
    biMakeupChart:["maquiagem_m3","projetado_m3"],
    biTargetChart:["producao_total_m3"],
    biRefusalChart:["recusas_total_m3","recusas_fabrica_m3","outras_recusas_m3"],
    biDonutChart:["producao_total_m3","producao_efetiva_m3","recusas_fabrica_m3"],
    biEfficiencyChart:["eficiencia","media_funcionarios_dia"],
    biPeopleChart:["media_funcionarios_dia","dias_trabalhados"],
    biConsolesChart:["consoles"],
    biWorksRanking:[]
  };
  function metricTitle(key){
    if(key==="consoles")return "Consoles executados";
    if(key==="dias_trabalhados")return "Dias trabalhados";
    return KPINAMES.find(k=>k[0]===key)?.[1]||SERIES[key]?.label||key;
  }
  function openChartDetail(chartId){
    const target=$(chartId);
    if(!target)return;
    const chartCard=target.closest(".bi-chart-card");
    const title=chartCard?.querySelector("h3")?.textContent||"Análise detalhada";
    const range=params();
    const rows=chartId==="biConsolesChart"?consolesTimeline(range):filteredMonths(range);
    const keys=chartId==="biHeroChart"?
      ($("biIndicator").value==="all"?CHART_KEYS.biHeroChart:[$("biIndicator").value]):
      (CHART_KEYS[chartId]||[]);
    const chartMarkup=target.innerHTML;
    const tableRows=rows.map(r=>[fmtMonth(r.mes),...keys.map(key=>
      key==="consoles"?`${nf(val(r.consoles))} un.`:formatMetric(key,metric(r,key))),
      ...(chartId==="biConsolesChart"?[consolesOrigin(r)]:[])]);
    const body=`<div class="bi-dialog-chart">${chartMarkup}</div>
      <h3>Valores mensais</h3>
      ${keys.length?(tableRows.length?modalTable(["Mês",...keys.map(metricTitle),...(chartId==="biConsolesChart"?["Origem dos dados"]:[])],tableRows):
        '<div class="bi-empty">Sem dados mensais.</div>'):
        '<p class="bi-dialog-note">Selecione uma obra no ranking para examinar seu avanço acumulado e execução mensal.</p>'}
      <p class="bi-dialog-note">Referência de meta de produção: 550 m³ mensais. As linhas e as tabelas representam somente registros existentes.</p>`;
    openDialog("EXPLORAR GRÁFICO",title,`${fmtMonth(range.start)} — ${fmtMonth(range.end)}`,body);
  }
  function openPointDetail(mark,chartId){
    const month=mark.dataset.pointMonth,detail=mark.dataset.chartDetail||"";
    const key=mark.dataset.pointKey;
    if(!month){openChartDetail(chartId);return;}
    const row=data.months.find(m=>monthKey(m.mes)===month);
    const workTotals=consolesTimeline(params()).find(m=>monthKey(m.mes)===month);
    const parts=[];
    if(row){
      for(const k of ["producao_total_m3","producao_efetiva_m3","expedicao_m3",
        "montagem_m3","projetado_m3","maquiagem_m3","recusas_total_m3",
        "media_funcionarios_dia","eficiencia"])
        parts.push(statPanel(metricTitle(k),formatMetric(k,metric(row,k))));
    }
    if(workTotals){
      parts.push(statPanel("Consoles no mês",`${nf(workTotals.consoles)} un.`,consolesOrigin(workTotals)));
      parts.push(statPanel("Pilares/peças (Consoles)",nf(workTotals.pilares)));
    }
    const body=`<p class="bi-dialog-callout">${esc(detail)}</p>
      <div class="bi-dialog-stats">${parts.join("")||statPanel("Situação","Sem dados adicionais")}</div>
      <p class="bi-dialog-note">Clique em outro ponto do gráfico para consultar outro mês. Os dados por obra não são atribuídos aos volumes da fábrica.</p>`;
    openDialog("DETALHE MENSAL",fmtMonth(month),metricTitle(key),body);
  }
  function openWorkDetail(workId){
    const w=data.works.find(item=>String(item.id)===String(workId));
    if(!w)return;
    const range=params();
    const total=val(w.pilares_total),done=val(w.pilares_concluidos);
    const pct=total?Math.min(100,100*done/total):0;
    const records=filteredWorkMonths(range).filter(r=>String(r.obra_id)===String(workId))
      .sort((a,b)=>String(a.mes).localeCompare(String(b.mes)));
    const consoles=records.reduce((s,r)=>s+val(r.consoles),0);
    const body=`<div class="bi-dialog-stats">
      ${statPanel("Pilares cadastrados",nf(total))}
      ${statPanel("Pilares concluídos",nf(done),"Acumulado")}
      ${statPanel("Avanço acumulado",`${nf(pct,1)}%`)}
      ${statPanel("Consoles no período",nf(consoles))}
      </div><div class="bi-detail-progress"><div style="width:${pct}%"></div></div>
      <p class="bi-dialog-note">Última execução registrada: ${esc(shortDate(w.ultima_execucao))}. O avanço de pilares é acumulado desde o início da obra; a tabela abaixo respeita os filtros de período.</p>
      <h3>Execuções registradas por mês</h3>
      ${records.length?modalTable(["Mês","Pilares com execução","Consoles"],
        records.map(r=>[fmtMonth(r.mes),nf(r.pilares),nf(r.consoles)])):
        '<div class="bi-empty">Sem execuções no período selecionado.</div>'}`;
    openDialog("PAINEL DA OBRA",w.nome,"Execução por obra · leitura protegida",body);
  }
  function openInsightDetail(index){
    const it=insightsCache[index];
    if(!it)return;
    if(it.key.startsWith("work:")){openWorkDetail(it.key.slice(5));return;}
    if(it.key==="works"){openChartDetail("biConsolesChart");return;}
    openKpiDetail(it.key,`${it.kind}: ${it.title}. ${it.description}`);
  }
  function installExpandControls(){
    document.querySelectorAll(".bi-chart-card").forEach(card=>{
      const node=card.querySelector(".bi-chart-canvas,.bi-donut-wrap,.bi-work-ranking");
      const head=card.querySelector(".bi-card-head");
      if(!node||!head||head.querySelector(".bi-expand-chart"))return;
      const button=document.createElement("button");
      button.type="button";
      button.className="bi-expand-chart";
      button.dataset.expandChart=node.id;
      button.textContent="↗ Ampliar";
      button.setAttribute("aria-label",`Ampliar gráfico: ${head.querySelector("h3")?.textContent||"gráfico"}`);
      head.appendChild(button);
    });
  }
  function observeReveals(){
    if(revealedObserver)revealedObserver.disconnect();
    const elements=[...document.querySelectorAll(".bi-section,.bi-chart-card,.bi-insight,.bi-work-stat,.bi-kpi")];
    if(!motionAllowed()||!window.IntersectionObserver){
      elements.forEach(el=>el.classList.add("bi-visible"));
      return;
    }
    revealedObserver=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          entry.target.classList.add("bi-visible");
          revealedObserver.unobserve(entry.target);
        }
      });
    },{threshold:.04,rootMargin:"0px 0px 80px 0px"});
    elements.forEach(el=>{
      el.classList.add("bi-reveal");
      el.classList.remove("bi-visible");
      revealedObserver.observe(el);
    });
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
    highlightedMonth="";
    const range=params();
    const months=filteredMonths(range);
    $("biSnapshotLabel").textContent=range.mode==="year"
      ?`Ano ${range.year} · consolidado`
      :`${fmtMonth(range.start)} — ${fmtMonth(range.end)}`;
    renderKpis(months,range);
    renderCharts(months,range);
    const worksInfo=renderWorks(range);
    renderPulse(months,range,worksInfo);
    renderInsights(months,worksInfo,range);
    renderImpact(months,range);
    renderTimeline(range);
    storyIndex=0;
    renderStorySpotlight();
    focusSections();
    observeReveals();
    if(!data.months.length && !data.works.length)notify("Sem dados cadastrados ainda. Os gráficos serão preenchidos à medida que os módulos forem utilizados.","ok");
    else notify(`Dados carregados: ${months.length} fechamento(s) e ${worksInfo.works.length} obra(s) na seleção.`, "ok");
  }
  function populateYearSelect(){
    const select=$("biYear");
    const saved=select.value;
    const years=new Set([
      ...data.months.map(r=>Number(monthKey(r.mes).slice(0,4))),
      ...data.work_months.map(r=>Number(monthKey(r.mes).slice(0,4)))
    ].filter(y=>Number.isInteger(y)&&y>2000&&y<2100));
    if(!years.size)years.add(Number(currentMonth().slice(0,4)));
    const ordered=[...years].sort((a,b)=>b-a);
    select.innerHTML=ordered.map(y=>`<option value="${y}">${y}</option>`).join("");
    select.value=ordered.includes(Number(saved))?saved:String(ordered[0]);
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
      // A primeira abertura seleciona o ano mais recente, sem restringir o mês.
      // Atualizações posteriores preservam a escolha feita pelo usuário.
      $("biUpdated").textContent=result.generated_at
        ?`Atualizado em ${new Date(result.generated_at).toLocaleString("pt-BR")}`
        :"Dados atualizados";
      populateYearSelect();populateWorkSelect();render();
    }catch(err){
      console.error("Inteligência Administrativa:",err);
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
    $("biPeriod").addEventListener("change",()=>{
      const choice=$("biPeriod").value;
      if(choice==="month"&&$("biMonthFilter").value==="all"){
        const year=$("biYear").value;
        const last=data.months.map(r=>monthKey(r.mes)).filter(k=>k.startsWith(year+"-")).at(-1);
        $("biMonthFilter").value=(last||`${year}-12`).slice(5,7);
      }else if(choice!=="month"){
        $("biMonthFilter").value="all";
      }
      render();
    });
    $("biMonthFilter").addEventListener("change",()=>{
      $("biPeriod").value=$("biMonthFilter").value==="all"?"year":"month";
      render();
    });
    for(const id of ["biYear","biWorkFilter","biFocus","biIndicator"]){
      $(id).addEventListener("change",()=>render());
    }
    $("biApp").addEventListener("click",event=>{
      const button=event.target.closest("[data-kpi-key],[data-insight-index],[data-work-id],[data-expand-chart],[data-stage-focus],[data-timeline-month],[data-story-nav],[data-story-open]");
      if(!button)return;
      if(button.dataset.kpiKey)openKpiDetail(button.dataset.kpiKey);
      else if(button.dataset.insightIndex!==undefined)openInsightDetail(Number(button.dataset.insightIndex));
      else if(button.dataset.workId)openWorkDetail(button.dataset.workId);
      else if(button.dataset.expandChart)openChartDetail(button.dataset.expandChart);
      else if(button.dataset.stageFocus){
        if(button.dataset.stageFocus==="consoles")openChartDetail("biConsolesChart");
        else openKpiDetail(button.dataset.stageFocus);
      }else if(button.dataset.timelineMonth){
        const m=button.dataset.timelineMonth;
        $("biMonthFilter").value=m;
        $("biPeriod").value=m==="all"?"year":"month";
        render();
      }else if(button.dataset.storyNav)navigateStory(Number(button.dataset.storyNav));
      else if(button.dataset.storyOpen)openInsightDetail(storyIndex);
    });
    $("biApp").addEventListener("pointerover",event=>{
      if(event.pointerType==="touch")return;
      const insight=event.target.closest(".bi-insight[data-insight-index]");
      if(insight){
        const i=Number(insight.dataset.insightIndex);
        if(Number.isInteger(i)&&i!==storyIndex){
          storyIndex=i;
          renderStorySpotlight();
        }
      }
    });
    $("biStorySpotlight").addEventListener("keydown",event=>{
      if(event.key==="ArrowRight"||event.key==="ArrowLeft"){
        event.preventDefault();navigateStory(event.key==="ArrowRight"?1:-1);
      }
    });
    $("biApp").addEventListener("pointermove",event=>{
      if(event.pointerType==="touch")return;
      const card=event.target.closest(".bi-kpi,.bi-chart-card,.bi-insight,.bi-work-item,.bi-impact-card");
      if(!card)return;
      const rect=card.getBoundingClientRect();
      card.style.setProperty("--shine-x",`${event.clientX-rect.left}px`);
      card.style.setProperty("--shine-y",`${event.clientY-rect.top}px`);
    });
    $("biDialogClose").addEventListener("click",()=>$("biDetailDialog").close());
    $("biDetailDialog").addEventListener("click",event=>{
      if(event.target===$("biDetailDialog"))$("biDetailDialog").close();
    });
    $("biDetailDialog").addEventListener("close",hideTooltip);
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
      installExpandControls();
      bindEvents();
      await refreshData();
    }catch(err){
      console.error("Inicialização BI:",err);
      $("biSplashText").textContent=`Não foi possível iniciar: ${String(err.message||err)}.`;
    }
  }
  boot();
})();
