(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const data = window.FISHERIES_DATA;
  if (!data || !Array.isArray(data.monthly) || !window.d3) {
    $('load-error').hidden = false;
    $('load-error').textContent = 'The dashboard data could not be loaded. Reload this page to try again.';
    $('data-cutoff').textContent = 'Historical data unavailable';
    document.querySelectorAll('select, #export-monthly, [data-range], [data-mode]').forEach(el => el.disabled = true);
    return;
  }
  const d3 = window.d3;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const num = (value, digits = 0) => value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString('en', {minimumFractionDigits:digits, maximumFractionDigits:digits});
  const parseMonth = month => new Date(month + '-01T00:00:00Z');
  const monthKey = d3.utcFormat('%Y-%m');
  const monthName = d3.utcFormat('%b %Y');
  const longMonth = d3.utcFormat('%B %Y');
  const allMonths = [...new Set(data.monthly.map(r => r.month))].sort();
  const latestMonth = allMonths.at(-1);
  const latestDate = parseMonth(latestMonth);
  const years = [...new Set(allMonths.map(m => Number(m.slice(0, 4))))];
  const yearColors = new Map(years.map((year, i) => [year, ['var(--blue)', 'var(--orange)', 'var(--teal)', 'var(--purple)'][i % 4]]));
  const gears = data.gears?.length ? data.gears : [{id:'all',label:'All gears'}];
  const state = {page:'history', gear:gears[0].id, range:'recent', mode:'timeline', month:latestMonth, calendarMonth:latestDate.getUTCMonth(), revenue:'licence', forecastScale:'index',fleetView:'groups'};
  const sources = Array.isArray(data.sources) ? data.sources : Object.entries(data.sources || {}).map(([id, source]) => ({id,...source}));
  const tooltip = $('chart-tooltip');
  let plots = [];
  let lastWidth = 0;
  const defs = [
    {id:'effort', field:'hours', comparable:'comparableHours', title:'Apparent fishing effort', unit:'Fishing hours', suffix:'hours', decimals:0},
    {id:'fleet', field:'observedVessels', comparable:'comparableObservedVessels', title:'Vessels detected fishing', unit:'Monthly unique vessels', suffix:'vessels', decimals:0},
    {id:'share', field:'sharePct', title:'Kiribati’s share of observed vessel-days', unit:'Share of observed vessel-days (%)', suffix:'%', decimals:1}
  ];
  const safeURL = value => {try {const url = new URL(value);return ['https:','http:'].includes(url.protocol) ? url.href : null;} catch {return null;}};
  function announce(text) {$('status').textContent = text;}
  function calendarDaysInMonth(month){return d3.utcDay.offset(d3.utcMonth.offset(parseMonth(month),1),-1).getUTCDate();}
  function effortCoverage(){
    const availability=data.availability?.effort||{};
    const row=data.monthly.find(record=>record.month===latestMonth&&record.gear==='all')||data.monthly.find(record=>record.month===latestMonth);
    const cutoffText=data.meta?.latestEffortDate||availability.end;
    const cutoff=cutoffText?new Date(cutoffText+'T00:00:00Z'):latestDate;
    const calendarDays=row?.calendarDays??calendarDaysInMonth(latestMonth);
    const days=row?.daysCovered??(availability.partialMonth===latestMonth?availability.partialDays:calendarDays);
    const partial=typeof row?.partial==='boolean'?row.partial:days<calendarDays;
    return {cutoff,calendarDays,days,partial};
  }
  function latestCoverageNote(){
    const coverage=effortCoverage(),month=longMonth(latestDate);
    return coverage.partial?`${month} is partial (${coverage.days} of ${coverage.calendarDays} days)`:`${month} is complete`;
  }
  function seasonalCoverageNote(){
    const windows=new Map();
    data.monthly.filter(row=>row.gear==='all'&&row.month>=minimumMonth()).forEach(row=>{
      const days=row.comparableDaysCovered??row.daysCovered,calendarDays=row.calendarDays??calendarDaysInMonth(row.month);
      if(days==null||days>=calendarDays)return;
      const month=Number(row.month.slice(5,7))-1;if(!windows.has(month))windows.set(month,new Set());windows.get(month).add(days);
    });
    if(!windows.size)return 'Full calendar-month comparisons';
    return [...windows].sort((a,b)=>a[0]-b[0]).map(([month,days])=>{
      const name=d3.utcFormat('%B')(new Date(Date.UTC(2000,month,1)));
      return days.size===1?`${name} comparisons use days 1–${[...days][0]} in each year`:`${name} comparison windows vary; see exported days`;
    }).join(' · ');
  }
  function effortPeriodDefinition(){
    const coverage=effortCoverage();
    return `Fishing observations run through ${d3.utcFormat('%d %B %Y')(coverage.cutoff)}. ${latestCoverageNote()}. ${seasonalCoverageNote()}. The regional series retains its separately stated coverage; blank gaps are not zero.`;
  }
  function minimumMonth() {
    if (state.range === 'year') return latestMonth.slice(0,4) + '-01';
    if (state.range === '24m') return monthKey(d3.utcMonth.offset(latestDate, -23));
    return allMonths[0] > '2024-01' ? allMonths[0] : '2024-01';
  }
  function visibleMonths() {return allMonths.filter(month => month >= minimumMonth());}
  function gearRows() {return data.monthly.filter(row => row.gear === state.gear && row.month >= minimumMonth()).sort((a,b) => a.month.localeCompare(b.month));}
  function regionalRows() {
    const candidates = (data.regional || []).filter(row => row.gear === state.gear && row.month >= minimumMonth());
    return candidates.filter(row => /kiribati|^kir$|^ki$|^kir_/i.test(String(row.destination || '')));
  }
  function metricRows(def) {
    const input = def.id === 'share' ? regionalRows() : gearRows();
    const byMonth = new Map(input.map(row => [row.month, row]));
    return visibleMonths().map(month => {
      const row = byMonth.get(month);
      const raw = row ? (state.mode === 'seasonal' && def.comparable && row[def.comparable] != null ? row[def.comparable] : row[def.field]) : null;
      return {month, date:parseMonth(month), year:Number(month.slice(0,4)), calendarMonth:Number(month.slice(5,7))-1, value:raw == null ? null : Number(raw), partial:!!row?.partial, row};
    });
  }
  function fleetSeries(){
    const specs=state.fleetView==='methods'?[{id:'all',label:'Total',gear:'all',color:'var(--teal)'},{id:'ll',label:'Longline',gear:'ll',color:'var(--blue)'},{id:'ps',label:'Purse seine',gear:'ps',color:'var(--orange)'}]:[{id:'all',label:'Total',color:'var(--teal)'},{id:'kir',label:'Kiribati-flagged',color:'var(--blue)'},{id:'jv',label:'JV-associated',color:'var(--orange)'}];
    return specs.map(spec=>{
      const input=state.fleetView==='methods'?data.monthly.filter(row=>row.gear===spec.gear):(data.vesselGroups||[]).filter(row=>row.gear===state.gear&&row.group===spec.id);
      const byMonth=new Map(input.map(row=>[row.month,row]));
      const rows=visibleMonths().map(month=>{const row=byMonth.get(month),value=row?(state.mode==='seasonal'?(row.comparableObservedVessels??row.observedVessels):row.observedVessels):null;return{month,date:parseMonth(month),year:Number(month.slice(0,4)),calendarMonth:Number(month.slice(5,7))-1,value,partial:!!row?.partial,row,seriesId:spec.id,seriesLabel:spec.label,color:spec.color};});
      return {...spec,rows};
    });
  }
  function setPage(page) {
    if (!['history','revenue','sources'].includes(page)) return;
    state.page = page;
    document.querySelectorAll('[data-page]').forEach(button => button.setAttribute('aria-current', button.dataset.page === page ? 'page' : 'false'));
    ['history','revenue','sources'].forEach(name => $('page-'+name).hidden = name !== page);
    history.replaceState(null, '', '#'+page);
    hideTooltip();
    if (page === 'history') drawHistory();
    if (page === 'revenue') drawRevenue();
  }
  function sourceLabel(id) {const source = sources.find(s => s.id === id);return source?.title || source?.label || source?.name || id;}
  function updateControls() {
    document.querySelectorAll('[data-range]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.range === state.range)));
    document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode)));
    const months = visibleMonths();
    if (!months.includes(state.month)) state.month = months.at(-1);
    $('inspect-label').textContent = state.mode === 'seasonal' ? 'Inspect season' : 'Inspect month';
    $('month-select').innerHTML = state.mode === 'seasonal'
      ? Array.from({length:12}, (_, i) => `<option value="${i}">${d3.utcFormat('%B')(new Date(Date.UTC(2000,i,1)))}</option>`).join('')
      : months.map(month => `<option value="${month}">${monthName(parseMonth(month))}</option>`).join('');
    $('month-select').value = state.mode === 'seasonal' ? String(state.calendarMonth) : state.month;
    $('period-description').textContent = `${longMonth(parseMonth(months[0]))} – ${longMonth(latestDate)} · ${state.mode === 'timeline' ? 'monthly observations' : 'calendar months aligned by year'}`;
    $('year-legend').hidden = state.mode !== 'seasonal';
    $('year-legend').innerHTML = [...new Set(months.map(m => Number(m.slice(0,4))))].map(year => `<span><i style="border-color:${yearColors.get(year)}"></i>${year}</span>`).join('');
    $('effort-subtitle').textContent = state.mode === 'seasonal' ? 'Screened fleet · '+seasonalCoverageNote() : 'Screened fleet · apparent fishing inside Kiribati EEZ · '+latestCoverageNote();
    $('share-subtitle').textContent = 'Selected dates worldwide · equal weight per vessel-day · sample varies by year · Jan–Aug only';
  }
  function svgFrame(element, domain, unit, height) {
    const width = element.getBoundingClientRect().width;
    if (width < 100) return null;
    const H = height || (width < 500 ? 190 : 205);
    const margin = {left:60,right:21,top:26,bottom:40};
    const w = width-margin.left-margin.right, h=H-margin.top-margin.bottom;
    const svg = d3.select(element);svg.selectAll('*').remove();svg.attr('viewBox', `0 0 ${width} ${H}`);
    const g = svg.append('g').attr('transform',`translate(${margin.left},${margin.top})`);
    const y = d3.scaleLinear().domain(domain).nice().range([h-4,4]);
    g.append('g').call(d3.axisLeft(y).ticks(4).tickSize(-w).tickFormat(d3.format('~s'))).call(axis => axis.selectAll('.tick text').attr('x',-9));
    g.append('line').attr('x2',w).attr('y1',h).attr('y2',h).attr('stroke','var(--line)');
    svg.append('text').attr('x',margin.left).attr('y',13).text(unit);
    return {svg,g,y,width,H,margin,w,h};
  }
  function drawMetric(def) {
    const rows = metricRows(def);
    const valid = rows.filter(row => row.value != null && Number.isFinite(row.value));
    const element = $(def.id+'-chart'), empty=$(def.id+'-empty');
    element.toggleAttribute('hidden', !valid.length);empty.hidden=!!valid.length;
    empty.textContent = `No ${def.id === 'share' ? 'matched regional observations' : 'observations'} are available for this gear and period.`;
    if (!valid.length) return;
    const c = svgFrame(element, [0, d3.max(valid, r => r.value)*1.13 || 1], def.unit);
    if (!c) return;
    const x = state.mode === 'timeline'
      ? d3.scaleUtc().domain([d3.utcDay.offset(parseMonth(visibleMonths()[0]),-10),d3.utcDay.offset(latestDate,10)]).range([4,c.w-4])
      : d3.scaleLinear().domain([0,11]).range([4,c.w-4]);
    const at = row => state.mode === 'timeline' ? x(row.date) : x(row.calendarMonth);
    const maxTicks = c.width<450 ? 3 : c.width<740 ? 5 : 7;
    let ticks;
    if (state.mode === 'timeline') {
      const months=visibleMonths();ticks=Array.from({length:Math.min(maxTicks,months.length)},(_,i)=>parseMonth(months[Math.round(i*(months.length-1)/(Math.min(maxTicks,months.length)-1 || 1))]));
    } else ticks=c.width<450?[0,5,11]:[0,2,4,6,8,10,11];
    c.g.append('g').attr('transform',`translate(0,${c.h})`).call(d3.axisBottom(x).tickValues(ticks).tickSize(0).tickFormat(state.mode==='timeline'?d3.utcFormat(c.width<450?'%b %y':'%b %Y'):v=>d3.utcFormat('%b')(new Date(Date.UTC(2000,v,1))))).call(axis=>axis.selectAll('text').attr('dy','1.5em'));
    const line=d3.line().defined(row=>row.value!=null).x(at).y(row=>c.y(row.value));
    const groups=state.mode==='timeline'?[{year:null,rows}]:[...d3.group(rows,row=>row.year)].map(([year,rows])=>({year,rows}));
    groups.forEach(group=>{
      const color=group.year==null?'var(--teal)':yearColors.get(group.year);
      const solid=group.rows.map(row=>row.partial?{...row,value:null}:row);
      c.g.append('path').datum(solid).attr('fill','none').attr('stroke',color).attr('stroke-width',2.25).attr('d',line);
      group.rows.forEach((row,i)=>{
        if(row.value==null)return;
        if(row.partial){
          const previous=group.rows[i-1];if(previous?.value!=null)c.g.append('path').datum([previous,row]).attr('fill','none').attr('stroke',color).attr('stroke-width',2.25).attr('stroke-dasharray','5 4').attr('d',line);
          c.g.append('circle').attr('cx',at(row)).attr('cy',c.y(row.value)).attr('r',4).attr('fill','var(--paper)').attr('stroke',color).attr('stroke-width',2);
        }
      });
    });
    c.def=def;c.rows=rows;c.x=x;c.at=at;
    c.pin=c.g.append('line').attr('y2',c.h).attr('stroke','var(--muted)').attr('opacity',.55).attr('stroke-dasharray','3 4');
    c.guide=c.g.append('line').attr('y2',c.h).attr('stroke','var(--ink)').attr('visibility','hidden');
    c.markers=c.g.append('g');
    c.g.append('rect').attr('width',c.w).attr('height',c.h).attr('fill','transparent').on('pointermove',function(event){
      const point=d3.pointer(event,this)[0];
      if(state.mode==='timeline'){
        const date=x.invert(point), index=d3.bisector(row=>row.date).center(rows,date),month=rows[index].month;
        highlightMonth(month, null);showTooltip(event,month,null,def);
      } else {
        const calendarMonth=Math.max(0,Math.min(11,Math.round(x.invert(point))));highlightMonth(null,calendarMonth);showTooltip(event,null,calendarMonth,def);
      }
    }).on('pointerleave',hideTooltip).on('click',function(event){
      if(state.mode==='timeline'){state.month=rows[d3.bisector(row=>row.date).center(rows,x.invert(d3.pointer(event,this)[0]))].month;state.calendarMonth=Number(state.month.slice(5,7))-1;}
      else state.calendarMonth=Math.max(0,Math.min(11,Math.round(x.invert(d3.pointer(event,this)[0]))));
      $('month-select').value=state.mode==='timeline'?state.month:String(state.calendarMonth);updateDetails();
    });
    plots.push(c);
  }
  function drawFleet(){
    const series=fleetSeries(),values=series.flatMap(s=>s.rows.filter(row=>row.value!=null).map(row=>row.value)),seasonal=state.mode==='seasonal';
    const hasData=!!values.length;$('fleet-empty').hidden=hasData;$('fleet-empty').textContent='No vessel-group observations are available for this selection.';
    $('fleet-chart').toggleAttribute('hidden',seasonal||!hasData);$('fleet-facets').hidden=!seasonal||!hasData;
    $('fleet-subtitle').textContent=(state.fleetView==='methods'?'All eligible vessels · by fishing method · independent of the Fleet / gear filter':'Monthly unique active vessels · selected gear · flag and historical JV groups overlap')+' · '+(seasonal?seasonalCoverageNote():latestCoverageNote());
    $('fleet-note').textContent=state.fleetView==='methods'?(data.vesselGroupsMeta?.methodNote||'Total includes other and unclassified methods.'):('Kiribati flag is reported by the source. JV is a historical ownership/charter association, not verified current ownership. '+(data.vesselGroupsMeta?.overlapNote||'Groups overlap; do not add them.'));
    $('fleet-legend').innerHTML=seasonal?[...new Set(visibleMonths().map(month=>Number(month.slice(0,4))))].map(year=>`<span><i style="border-color:${yearColors.get(year)}"></i>${year}</span>`).join(''):series.map(s=>`<span><i style="border-color:${s.color}"></i>${esc(s.label)}</span>`).join('');
    if(!hasData)return;
    const domain=[0,d3.max(values)*1.13||1];
    if(seasonal){$('fleet-facets').innerHTML=series.map(s=>`<section class="fleet-facet"><h3>${esc(s.label)}</h3><div class="facet-values" id="facet-${s.id}-values"></div><svg class="fleet-facet-chart" id="facet-${s.id}" role="img" aria-label="${esc(s.label)} monthly active vessels by year"></svg></section>`).join('');series.forEach(s=>drawFleetPlot($('facet-'+s.id),[s],domain,true));}
    else{$('fleet-facets').innerHTML='';drawFleetPlot($('fleet-chart'),series,domain,false);}
  }
  function drawFleetPlot(element,series,domain,seasonal){
    const c=svgFrame(element,domain,'Unique active vessels',seasonal?(window.innerWidth<=760?180:205):null);if(!c)return;
    const months=visibleMonths();
    c.x=seasonal?d3.scaleLinear().domain([0,11]).range([4,c.w-4]):d3.scaleUtc().domain([d3.utcDay.offset(parseMonth(months[0]),-10),d3.utcDay.offset(latestDate,10)]).range([4,c.w-4]);
    const tickCount=c.width<450?3:c.width<740?5:7,ticks=seasonal?(c.width<450?[0,5,11]:[0,2,4,6,8,10,11]):Array.from({length:Math.min(tickCount,months.length)},(_,i)=>parseMonth(months[Math.round(i*(months.length-1)/(Math.min(tickCount,months.length)-1||1))]));
    c.g.append('g').attr('transform',`translate(0,${c.h})`).call(d3.axisBottom(c.x).tickValues(ticks).tickSize(0).tickFormat(seasonal?v=>d3.utcFormat('%b')(new Date(Date.UTC(2000,v,1))):d3.utcFormat(c.width<450?'%b %y':'%b %Y'))).call(axis=>axis.selectAll('text').attr('dy','1.5em'));
    c.rows=series.flatMap(s=>s.rows);c.isFleet=true;c.series=series;c.facet=seasonal?series[0]:null;c.def=defs[1];
    const at=row=>seasonal?c.x(row.calendarMonth):c.x(row.date),line=d3.line().defined(row=>row.value!=null).x(at).y(row=>c.y(row.value));
    series.forEach(s=>{
      const groups=seasonal?[...d3.group(s.rows,row=>row.year)].map(([year,rows])=>({color:yearColors.get(year),rows})):[{color:s.color,rows:s.rows}];
      groups.forEach(group=>{
        c.g.append('path').datum(group.rows.map(row=>row.partial?{...row,value:null}:row)).attr('fill','none').attr('stroke',group.color).attr('stroke-width',2).attr('d',line);
        group.rows.forEach((row,index)=>{if(!row.partial||row.value==null)return;const previous=group.rows[index-1];if(previous?.value!=null)c.g.append('path').datum([previous,row]).attr('fill','none').attr('stroke',group.color).attr('stroke-width',2).attr('stroke-dasharray','5 4').attr('d',line);c.g.append('circle').attr('cx',at(row)).attr('cy',c.y(row.value)).attr('r',3.5).attr('fill','var(--paper)').attr('stroke',group.color).attr('stroke-width',1.8);});
      });
    });
    c.pin=c.g.append('line').attr('y2',c.h).attr('stroke','var(--muted)').attr('opacity',.5).attr('stroke-dasharray','3 4');c.guide=c.g.append('line').attr('y2',c.h).attr('stroke','var(--ink)').attr('visibility','hidden');c.markers=c.g.append('g');
    c.g.append('rect').attr('width',c.w).attr('height',c.h).attr('fill','transparent').on('pointermove',function(event){
      const point=d3.pointer(event,this)[0],calendarMonth=seasonal?Math.max(0,Math.min(11,Math.round(c.x.invert(point)))):null,month=seasonal?null:series[0].rows[d3.bisector(row=>row.date).center(series[0].rows,c.x.invert(point))].month;
      highlightMonth(month,calendarMonth);const selected=c.rows.filter(row=>seasonal?row.calendarMonth===calendarMonth:row.month===month);
      tooltip.innerHTML=`<strong>${seasonal?d3.utcFormat('%B')(new Date(Date.UTC(2000,calendarMonth,1)))+' · '+esc(series[0].label):esc(monthName(parseMonth(month)))+' · active vessels'}</strong>`+selected.map(row=>`<div class="tooltip-row"><span>${seasonal?row.year:esc(row.seriesLabel)}</span><b>${num(row.value)}${row.partial?' · partial':''}</b></div>`).join('')+`<div class="tooltip-note">${state.fleetView==='methods'?'All eligible vessels; methods may overlap.':'Flag / JV groups overlap; do not add.'}</div>`;tooltip.hidden=false;positionTooltip(event);
    }).on('pointerleave',hideTooltip).on('click',function(event){if(seasonal)state.calendarMonth=Math.max(0,Math.min(11,Math.round(c.x.invert(d3.pointer(event,this)[0]))));else{state.month=series[0].rows[d3.bisector(row=>row.date).center(series[0].rows,c.x.invert(d3.pointer(event,this)[0]))].month;state.calendarMonth=Number(state.month.slice(5,7))-1;}$('month-select').value=seasonal?String(state.calendarMonth):state.month;updateDetails();});
    plots.push(c);
  }
  function updateFleetDetails(){
    const series=fleetSeries();
    if(state.mode==='timeline')$('fleet-detail').innerHTML=`${esc(monthName(parseMonth(state.month)))}${series[0]?.rows.find(row=>row.month===state.month)?.partial?' · partial':''} &nbsp; `+series.map(s=>`${esc(s.label)} <strong>${num(s.rows.find(row=>row.month===state.month)?.value)}</strong>`).join(' &nbsp;·&nbsp; ');
    else{$('fleet-detail').textContent=d3.utcFormat('%B')(new Date(Date.UTC(2000,state.calendarMonth,1)))+' · compare years within each group';series.forEach(s=>{const el=$('facet-'+s.id+'-values');if(el){const rows=s.rows.filter(row=>row.calendarMonth===state.calendarMonth);el.innerHTML=rows.length?rows.map(row=>`${row.year}: <strong>${num(row.value)}</strong>`).join(' · '):'No observation';}});}
  }
  function highlightMonth(month, calendarMonth) {
    plots.forEach(c=>{
      const selected=c.rows.filter(row=>state.mode==='timeline'?row.month===month:row.calendarMonth===calendarMonth);
      const px=state.mode==='timeline'?c.x(parseMonth(month)):c.x(calendarMonth);
      c.guide.attr('x1',px).attr('x2',px).attr('visibility','visible');c.markers.selectAll('*').remove();
      selected.filter(row=>row.value!=null).forEach(row=>c.markers.append('circle').attr('cx',px).attr('cy',c.y(row.value)).attr('r',4).attr('fill',state.mode==='timeline'?(row.color||'var(--teal)'):yearColors.get(row.year)).attr('stroke','var(--paper)').attr('stroke-width',1.5));
    });
  }
  function positionTooltip(event) {
    const left=Math.max(9,Math.min(event.clientX+16,window.innerWidth-tooltip.offsetWidth-9));
    const top=Math.max(9,Math.min(event.clientY+15,window.innerHeight-tooltip.offsetHeight-9));
    tooltip.style.left=left+'px';tooltip.style.top=top+'px';
  }
  function showTooltip(event,month,calendarMonth,activeDef) {
    let html='';
    if(state.mode==='timeline'){
      const primary=gearRows().find(row=>row.month===month);
      html=`<strong>${esc(monthName(parseMonth(month)))}${primary?.partial?' · partial':''}</strong>`;
      defs.forEach(def=>{const row=metricRows(def).find(row=>row.month===month);html+=`<div class="tooltip-row"><span>${def.id==='effort'?'Fishing hours':def.id==='fleet'?'Active vessels':'Observed-day share'}</span><b>${row?.value==null?'No observation':num(row.value,def.decimals)+(def.id==='share'?'%':'')}</b></div>`;});
      if(primary?.partial)html+=`<div class="tooltip-note">${num(primary.daysCovered)} observed days; incomplete calendar month</div>`;
    }else{
      html=`<strong>${d3.utcFormat('%B')(new Date(Date.UTC(2000,calendarMonth,1)))} · ${esc(activeDef.unit)}</strong>`;
      const rows=metricRows(activeDef).filter(row=>row.calendarMonth===calendarMonth);
      rows.forEach(row=>html+=`<div class="tooltip-row"><span>${row.year}</span><b>${num(row.value,activeDef.decimals)}${activeDef.id==='share'&&row.value!=null?'%':''}${row.partial?' · partial':''}</b></div>`);
      html+='<div class="tooltip-note">All charts inspect the same calendar month.</div>';
    }
    tooltip.innerHTML=html;tooltip.hidden=false;positionTooltip(event);
  }
  function hideTooltip(){tooltip.hidden=true;plots.forEach(c=>{c.guide.attr('visibility','hidden');c.markers.selectAll('*').remove();});}
  function updateDetails(){
    defs.forEach(def=>{
      if(def.id==='fleet')return;
      const rows=metricRows(def);
      if(state.mode==='timeline'){
        const row=rows.find(row=>row.month===state.month);
        $(def.id+'-detail').innerHTML=`${esc(monthName(parseMonth(state.month)))} &nbsp; <strong>${row?.value==null?'No observation':num(row.value,def.decimals)+(def.id==='share'?'%':' '+def.suffix)}</strong>${row?.partial?' <span class="partial-label">partial</span>':''}`;
      }else{
        const selected=rows.filter(row=>row.calendarMonth===state.calendarMonth);
        $(def.id+'-detail').innerHTML=selected.length?selected.map(row=>`${row.year}: <strong>${num(row.value,def.decimals)}${def.id==='share'&&row.value!=null?'%':''}</strong>`).join(' &nbsp;·&nbsp; '):d3.utcFormat('%B')(new Date(Date.UTC(2000,state.calendarMonth,1)))+' · No observation';
      }
    });
    updateFleetDetails();
    plots.forEach(c=>{const px=state.mode==='timeline'?c.x(parseMonth(state.month)):c.x(state.calendarMonth);c.pin.attr('x1',px).attr('x2',px);});
  }
  function drawHistory(){hideTooltip();plots=[];updateControls();defs.forEach(def=>def.id==='fleet'?drawFleet():drawMetric(def));updateDetails();}
  function receiptRows(){return (state.revenue==='broad'?data.broadReceipts:data.receipts)||[];}
  function drawForecast(){
    const forecast=data.forecasts,rows=forecast?.levels||[];
    $('forecast-section').hidden=!rows.length;if(!rows.length)return;
    const meta=forecast.meta||{},latest=forecast.latest||rows.at(-1),growth=forecast.growth?.at(-1),aud=state.forecastScale==='aud';
    const keys=aud?{actual:'actualAudMillion',central:'centralAudMillion',low:'lowAudMillion',high:'highAudMillion'}:{actual:'actualIndex',central:'centralIndex',low:'lowIndex',high:'highIndex'};
    $('forecast-subtitle').textContent='Original narrow licence model · preferred 18-hour tracking screen · through '+(meta.latestPeriod||'the latest saved period');
    $('forecast-growth').textContent=(growth?.centralGrowthPct>=0?'+':'')+num(growth?.centralGrowthPct,1)+'%';
    $('forecast-growth-label').textContent=`${latest.year} modelled change · January–August versus the same months of ${latest.year-1}`;
    const low=latest[keys.low],high=latest[keys.high],center=latest[keys.central];
    $('forecast-interpretation').textContent=`${latest.year} preferred ${aud?'model-equivalent':'index'}: ${aud?'A$':''}${num(center,1)}${aud?'m':''}. Saved sensitivity range: ${aud?'A$':''}${num(low,1)}–${num(high,1)}${aud?'m':''}. The dashed 2025–2026 path links January–August growth; it is not a full-year cash forecast.`;
    $('forecast-method').innerHTML=[meta.bandDefinition,meta.periodNote,meta.audScaleNote,meta.assumptionNote,meta.interpretationNote].filter(Boolean).map(text=>`<p>${esc(text)}</p>`).join('');
    const values=rows.flatMap(row=>Object.values(keys).map(key=>row[key])).filter(value=>value!=null),extent=d3.extent(values),pad=(extent[1]-extent[0])*.13;
    const el=$('forecast-chart'),width=el.getBoundingClientRect().width,c=svgFrame(el,[Math.max(0,extent[0]-pad),extent[1]+pad],aud?'AUD million · model-equivalent after 2024':'Index · 2019 = 100',width<420?265:width<760?280:300);if(!c)return;
    const x=d3.scaleLinear().domain(d3.extent(rows,row=>row.year)).range([5,c.w-5]),ticks=c.width<450?[rows[0].year,rows[2].year,rows[4].year,rows.at(-1).year]:rows.map(row=>row.year);
    const firstExtension=rows.find(row=>row.isSeasonalExtension);
    if(firstExtension)c.g.insert('rect',':first-child').attr('x',x(firstExtension.year-.5)).attr('width',c.w-x(firstExtension.year-.5)).attr('height',c.h).attr('fill','var(--soft)');
    c.g.append('g').attr('transform',`translate(0,${c.h})`).call(d3.axisBottom(x).tickValues(ticks).tickFormat(d3.format('d')).tickSize(0)).call(axis=>axis.selectAll('text').attr('dy','1.5em'));
    c.g.append('path').datum(rows).attr('fill','var(--teal)').attr('opacity',.13).attr('d',d3.area().x(row=>x(row.year)).y0(row=>c.y(row[keys.low])).y1(row=>c.y(row[keys.high])));
    const line=key=>d3.line().defined(row=>row[key]!=null).x(row=>x(row.year)).y(row=>c.y(row[key]));
    const historic=rows.filter(row=>!row.isSeasonalExtension),extension=[historic.at(-1),...rows.filter(row=>row.isSeasonalExtension)].filter(Boolean);
    c.g.append('path').datum(historic).attr('fill','none').attr('stroke','var(--teal)').attr('stroke-width',2.5).attr('d',line(keys.central));
    c.g.append('path').datum(extension).attr('fill','none').attr('stroke','var(--teal)').attr('stroke-width',2.5).attr('stroke-dasharray','6 4').attr('d',line(keys.central));
    c.g.append('path').datum(rows).attr('fill','none').attr('stroke','var(--ink)').attr('stroke-width',1.65).attr('d',line(keys.actual));
    rows.filter(row=>row[keys.actual]!=null).forEach(row=>c.g.append('circle').attr('cx',x(row.year)).attr('cy',c.y(row[keys.actual])).attr('r',3).attr('fill','var(--ink)'));
    c.g.append('circle').attr('cx',x(latest.year)).attr('cy',c.y(center)).attr('r',4).attr('fill','var(--paper)').attr('stroke','var(--teal)').attr('stroke-width',2);
    const guide=c.g.append('line').attr('y2',c.h).attr('stroke','var(--muted)').attr('visibility','hidden'),markers=c.g.append('g');
    c.g.append('rect').attr('width',c.w).attr('height',c.h).attr('fill','transparent').on('pointermove',function(event){const year=Math.round(x.invert(d3.pointer(event,this)[0])),row=rows.find(r=>r.year===year);if(!row)return;guide.attr('x1',x(year)).attr('x2',x(year)).attr('visibility','visible');markers.selectAll('*').remove();['central','actual'].forEach(key=>{if(row[keys[key]]!=null)markers.append('circle').attr('cx',x(year)).attr('cy',c.y(row[keys[key]])).attr('r',4).attr('fill',key==='central'?'var(--teal)':'var(--ink)');});tooltip.innerHTML=`<strong>${year} · ${row.isSeasonalExtension?'Jan–Aug linked extension':'full-year comparison'}</strong><div class="tooltip-row"><span>Preferred model</span><b>${aud?'A$':''}${num(row[keys.central],1)}${aud?'m':''}</b></div><div class="tooltip-row"><span>Actual licences</span><b>${row[keys.actual]==null?'Not available':(aud?'A$':'')+num(row[keys.actual],1)+(aud?'m':'')}</b></div><div class="tooltip-row"><span>Sensitivity range</span><b>${num(row[keys.low],1)}–${num(row[keys.high],1)}</b></div><div class="tooltip-note">${row.isSeasonalExtension?'Seasonal model-equivalent; not full-year cash.':'Retrospective saved model; narrow licence definition.'}</div>`;tooltip.hidden=false;positionTooltip(event);}).on('pointerleave',()=>{guide.attr('visibility','hidden');markers.selectAll('*').remove();hideTooltip();});
  }
  function drawRevenue(){
    drawForecast();
    const rows=receiptRows().slice().sort((a,b)=>a.year-b.year),valid=rows.filter(row=>row.value!=null&&Number.isFinite(Number(row.value)));
    const broad=state.revenue==='broad';
    $('receipts-title').textContent=broad?'Fishing licences and related receipts':'Fishing licence revenue';
    $('receipts-subtitle').textContent='Recorded annual values · AUD millions · calendar years';
    $('revenue-value-header').textContent='AUD million';
    $('revenue-scope').innerHTML=`<strong>${broad?'Broader definition: licences and related receipts.':'Narrow definition: fishing licence revenue.'}</strong> Annual records are shown as supplied. No 2026 collection records or monthly fee schedule are available in this bundle.`;
    const statusLabel=status=>({actual:'Actual',actual_component_sum:'Actual, components summed',unavailable:'Not available'}[status]||status||'Recorded actual');
    $('receipts-table').innerHTML=rows.map(row=>`<tr><td>${esc(row.year)}</td><td>${num(row.value,1)}</td><td>${esc(statusLabel(row.status))}${row.sourceId?' · '+esc(row.sourceTitle||sourceLabel(row.sourceId)):''}${safeURL(row.sourceUrl)?` <a href="${esc(safeURL(row.sourceUrl))}${row.pdfPage?'#page='+encodeURIComponent(row.pdfPage):''}" target="_blank" rel="noopener noreferrer">${row.printedPage?'Page '+esc(row.printedPage):'Source'}</a>`:''}</td></tr>`).join('');
    $('receipts-chart').toggleAttribute('hidden',!valid.length);$('receipts-empty').hidden=!!valid.length;$('receipts-empty').textContent='No annual records are available for this definition.';$('receipts-table-wrap').hidden=!rows.length;
    if(!valid.length)return;
    const el=$('receipts-chart'),c=svgFrame(el,[0,d3.max(valid,row=>Number(row.value))*1.17],'AUD million',el.getBoundingClientRect().width<500?270:310);if(!c)return;
    const x=d3.scaleBand().domain(rows.map(row=>row.year)).range([0,c.w]).padding(.38);
    c.g.append('g').attr('transform',`translate(0,${c.h})`).call(d3.axisBottom(x).tickSize(0)).call(axis=>axis.selectAll('text').attr('dy','1.5em'));
    c.g.selectAll('.revenue-bar').data(valid).join('rect').attr('class','revenue-bar').attr('x',row=>x(row.year)).attr('y',row=>c.y(row.value)).attr('width',x.bandwidth()).attr('height',row=>c.y(0)-c.y(row.value)).attr('rx',2).attr('fill','var(--teal)');
    c.g.selectAll('.revenue-label').data(valid).join('text').attr('class','revenue-label').attr('text-anchor','middle').attr('x',row=>x(row.year)+x.bandwidth()/2).attr('y',row=>c.y(row.value)-8).text(row=>num(row.value,c.width<450?0:1));
    c.g.selectAll('.revenue-hit').data(rows).join('rect').attr('x',row=>x(row.year)-x.step()*.16).attr('y',0).attr('width',x.step()).attr('height',c.h).attr('fill','transparent').on('pointermove',(event,row)=>{tooltip.innerHTML=`<strong>${row.year} · ${broad?'licences & related':'licence revenue'}</strong><div class="tooltip-row"><span>AUD million</span><b>${num(row.value,1)}</b></div><div class="tooltip-note">${esc(row.status||'Recorded annual value')}</div>`;tooltip.hidden=false;positionTooltip(event);}).on('pointerleave',hideTooltip);
  }
  function renderSources(){
    $('source-summary').textContent='This dashboard is built from validated historical source files. It does not query a live tracking feed. The fishing, regional and revenue panels use different source populations and definitions.';
    const definitions=[
      ['Apparent fishing hours','Hours classified as fishing inside the Kiribati EEZ, after the project’s frozen eligible-vessel screen. The screened observations are not a national census.'],
      ['Vessels detected fishing','Physically deduplicated, distinct vessels with classified fishing activity during the month. This is neither average daily fleet size nor a count of every vessel present in the EEZ.'],
      ['Observed vessel-day share',data.meta?.definitions?.regionalShare || 'Kiribati’s fraction of equivalent observed vessel-days across worldwide destinations in the selected matched cohort. Each physical vessel/date is normalized to one day.'],
      ['Incomplete and missing periods',effortPeriodDefinition()],
      ['Crossings and uncertainty','Monthly counts do not identify entry and exit events. Those require a validated boundary-crossing record; missing positions cannot be treated as departures.'],
      ['Revenue','Annual amounts remain in their reported AUD million units and calendar years. Narrow licence revenue and the broader licences-and-related definition are alternatives, not quantities to add.'],
      ['Tracking coverage',data.meta?.scopeNotes?.find(note=>note.includes('supplier transition')) || 'Changing tracking coverage can change detection. Missing positions are not evidence of inactivity.'],
      ['Regional comparison population',data.meta?.regionalScope || 'The selected regional sample differs from the screened effort population and varies by year.'],
      ['Kiribati flag and JV association',(data.vesselGroupsMeta?.flagRule||'Source-reported Kiribati flags.')+' '+(data.vesselGroupsMeta?.jvRule||'Historical ownership and charter associations.').trim()],
      ['Forecast model',(data.forecasts?.meta?.periodNote||'The saved conditional model is shown separately from annual receipts.')+' '+(data.forecasts?.meta?.bandDefinition||'')]
    ];
    $('definitions').innerHTML=definitions.map(([title,text])=>`<section class="definition"><h2>${esc(title)}</h2><p>${esc(text)}</p></section>`).join('');
    $('source-list').innerHTML=sources.map((source,i)=>{
      const title=source.title||source.label||source.name||source.id||'Source',path=source.path||source.file||source.localPath||source.paths?.join(' · '),url=safeURL(source.url||source.sourceUrl),note=source.note||source.description||source.scope||'';
      return `<article class="source-entry"><span class="source-index">${String(i+1).padStart(2,'0')}</span><div><h3>${esc(title)}</h3>${note?`<p>${esc(note)}</p>`:''}${path?`<p class="source-path">${esc(path)}</p>`:''}${url?`<p><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open source document ↗</a></p>`:''}</div></article>`;
    }).join('');
  }
  function exportCSV(){
    const fields=['month','gear','view','fishing_hours','monthly_unique_active_vessels','active_vessel_days','days_covered','calendar_days','source_partial_month','comparison_partial_month','regional_observed_vessel_day_share_pct','effort_source_id','regional_source_id','effort_scope','regional_scope'];
    const regional=new Map(regionalRows().map(row=>[row.month,row]));
    const records=gearRows().map(row=>{const days=state.mode==='seasonal'?(row.comparableDaysCovered??row.daysCovered):row.daysCovered,calendarDays=row.calendarDays??d3.utcDay.offset(d3.utcMonth.offset(parseMonth(row.month),1),-1).getUTCDate();return[row.month,row.gear,state.mode,state.mode==='seasonal'?(row.comparableHours??row.hours):row.hours,state.mode==='seasonal'?(row.comparableObservedVessels??row.observedVessels):row.observedVessels,state.mode==='seasonal'?(row.comparableActiveVesselDays??row.activeVesselDays):row.activeVesselDays,days,calendarDays,row.partial,days<calendarDays,regional.get(row.month)?.sharePct??'',row.sourceId||'effort',regional.get(row.month)?.sourceId||'regional',row.scopeId||'screened_observed',regional.get(row.month)?.scopeId||'regional_matched_union'];});
    const quote=value=>'"'+String(value??'').replace(/"/g,'""')+'"';const csv=[fields,...records].map(row=>row.map(quote).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=`kiribati-${state.gear}-${minimumMonth()}-${latestMonth}-${state.mode}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);announce('CSV exported for the selected gear, period and comparison mode.');
  }
  function exportModel(){
    const forecast=data.forecasts;if(!forecast?.levels?.length)return;
    const fields=['year','period','seasonal_extension','actual_index_2019_100','preferred_index_2019_100','sensitivity_low_index','sensitivity_high_index','actual_aud_million','preferred_aud_million','low_aud_million','high_aud_million','anchor_year','anchor_aud_million','preferred_growth_pct','interpretation','source_id'];
    const records=forecast.levels.map(row=>[row.year,row.period,row.isSeasonalExtension,row.actualIndex,row.centralIndex,row.lowIndex,row.highIndex,row.actualAudMillion,row.centralAudMillion,row.lowAudMillion,row.highAudMillion,row.anchorYear||forecast.meta.baseYear,forecast.meta.anchorAudMillion,forecast.growth.find(g=>g.year===row.year)?.centralGrowthPct,row.audInterpretation,row.sourceId]);
    downloadRows('kiribati-existing-revenue-model.csv',fields,records);announce('Saved revenue model exported with units, period and interpretation.');
  }
  function exportVessels(){
    const fields=['month','view','comparison','series_id','series','gear_scope','unique_active_vessels','days_covered','calendar_days','source_partial_month','comparison_partial_month','source_id','scope_id','interpretation'];
    const records=fleetSeries().flatMap(series=>series.rows.map(item=>{const row=item.row,days=state.mode==='seasonal'?(row?.comparableDaysCovered??row?.daysCovered):row?.daysCovered,calendarDays=d3.utcDay.offset(d3.utcMonth.offset(item.date,1),-1).getUTCDate();return[item.month,state.fleetView,state.mode,series.id,series.label,state.fleetView==='methods'?series.gear:state.gear,item.value,days,calendarDays,row?.partial??'',days==null?'':days<calendarDays,row?.sourceId||'',row?.scopeId||'',state.fleetView==='methods'?data.vesselGroupsMeta?.methodNote:data.vesselGroupsMeta?.overlapNote];}));
    downloadRows(`kiribati-vessels-${state.fleetView}-${state.mode}-${minimumMonth()}-${latestMonth}.csv`,fields,records);announce('Displayed vessel comparisons exported.');
  }
  function downloadRows(filename,fields,records){const quote=value=>'"'+String(value??'').replace(/"/g,'""')+'"';const url=URL.createObjectURL(new Blob(['\ufeff'+[fields,...records].map(row=>row.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('gear-select').innerHTML=gears.map(gear=>`<option value="${esc(gear.id)}">${esc(gear.label)}</option>`).join('');
  $('gear-select').value=state.gear;
  $('history-scope').innerHTML='<strong>Observed fishing in Kiribati’s EEZ.</strong> Primary charts use the project’s screened fleet. The regional panel uses selected tracked dates from a separate analysis; its sample varies by year.';
  defs.forEach(def=>$(def.id+'-title').textContent=def.title);
  const cutoff=effortCoverage().cutoff;
  const regionalCutoff=data.meta?.latestRegionalDate?new Date(data.meta.latestRegionalDate+'T00:00:00Z'):null;
  $('data-cutoff').textContent='Fishing data through '+d3.utcFormat('%d %b %Y')(cutoff);
  $('footer-scope').textContent='Historical observations · fishing through '+d3.utcFormat('%d %b %Y')(cutoff)+(regionalCutoff?' · regional through '+monthName(regionalCutoff):'');
  document.querySelector('[data-range="year"]').textContent=latestMonth.slice(0,4);
  $('revenue-definition').querySelector('[value="broad"]').disabled=!data.broadReceipts?.length;
  document.querySelectorAll('[data-page]').forEach(button=>button.addEventListener('click',()=>setPage(button.dataset.page)));
  document.querySelector('.brand').addEventListener('click',event=>{event.preventDefault();setPage('history');});
  document.querySelectorAll('[data-open-sources]').forEach(button=>button.addEventListener('click',()=>setPage('sources')));
  document.querySelectorAll('[data-range]').forEach(button=>button.addEventListener('click',()=>{state.range=button.dataset.range;drawHistory();announce('Historical period updated.');}));
  document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{state.mode=button.dataset.mode;drawHistory();announce(state.mode==='seasonal'?'Years are aligned by calendar month.':'Chronological timeline shown.');}));
  $('gear-select').addEventListener('change',event=>{state.gear=event.target.value;drawHistory();announce('Fleet filter updated.');});
  $('month-select').addEventListener('change',event=>{if(state.mode==='timeline'){state.month=event.target.value;state.calendarMonth=Number(state.month.slice(5,7))-1;}else state.calendarMonth=Number(event.target.value);updateDetails();});
  $('revenue-definition').addEventListener('change',event=>{state.revenue=event.target.value;drawRevenue();});
  $('forecast-scale').addEventListener('change',event=>{state.forecastScale=event.target.value;drawForecast();});
  $('export-model').addEventListener('click',exportModel);
  $('fleet-view').addEventListener('change',event=>{state.fleetView=event.target.value;drawHistory();announce('Vessel comparison updated.');});
  $('export-vessels').addEventListener('click',exportVessels);
  $('export-monthly').addEventListener('click',exportCSV);
  renderSources();setPage(location.hash.slice(1)||'history');
  new ResizeObserver(entries=>{const width=entries[0].contentRect.width;if(Math.abs(width-lastWidth)>1){lastWidth=width;if(state.page==='history')drawHistory();if(state.page==='revenue')drawRevenue();}}).observe(document.querySelector('.app-shell'));
})();
