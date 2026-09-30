import {$,el,field,read,num,action,notice,setupStatus,status} from '../../assets/js/core.js';

const root=$('#workspace');
if(!root) throw Error('Savings workspace unavailable.');

const form=el('div',{class:'fields'});
const result=el('div',{id:'result',class:'result-panel',hidden:true});
root.append(form);

const add=(id,label,type='number',value='',opts={})=>{
  const wrap=field(id,label,type,value,opts); form.append(wrap); return wrap;
};
const select=(id,label,options,value=Array.isArray(options[0])?options[0][0]:options[0])=>
  add(id,label,'select',value,{options});

select('currency','Currency',[
 ['USD','USD — US Dollar ($)'],['EUR','EUR — Euro (€)'],['GBP','GBP — British Pound (£)'],
 ['INR','INR — Indian Rupee (₹)'],['JPY','JPY — Japanese Yen (¥)'],['CNY','CNY — Chinese Yuan (CN¥)'],
 ['AUD','AUD — Australian Dollar (A$)'],['CAD','CAD — Canadian Dollar (C$)'],['CHF','CHF — Swiss Franc (CHF)'],
 ['SGD','SGD — Singapore Dollar (S$)'],['AED','AED — UAE Dirham (AED)']
],'USD');

add('starting','Starting balance','number','10000',{min:'0',max:'1000000000000',step:'0.01'});
add('contribution','Periodic contribution','number','500',{min:'0',max:'1000000000',step:'0.01'});
select('contribution-frequency','Contribution frequency',[
 ['0','No contributions'],['12','Monthly'],['4','Quarterly'],['2','Semi-annually'],['1','Annually']
],'12');
select('contribution-timing','Contribution timing',[
 ['beginning','Beginning of each contribution period'],['end','End of each contribution period']
],'end');

add('years','Savings term (years)','number','10',{min:'0.0833333333',max:'100',step:'0.0833333333',
 hint:'Use fractional years if needed; calculations run on a monthly timeline.'});

select('rate-type','Annual rate type',[
 ['effective','APY / effective annual rate'],
 ['nominal','Nominal annual rate (APR-style)']
],'effective');
add('rate','Annual interest / return rate (%)','number','5',{min:'-99',max:'100',step:'0.01'});

const compoundingWrap=select('compounding','Compounding frequency',[
 ['1','Annually'],['2','Semi-annually'],['4','Quarterly'],['12','Monthly']
],'12');

select('inflation-mode','Inflation adjustment',[
 ['off','Off — nominal future value only'],['on','On — show today’s purchasing-power value']
],'off');
const inflationWrap=add('inflation','Annual inflation rate (%)','number','2.5',{min:'-50',max:'100',step:'0.01',
 hint:'Used only to discount the projected future balance into today’s purchasing power.'});
inflationWrap.hidden=true;

function periodsPerYear(){ return Number(read('compounding')); }

function effectiveAnnualRate(){
  const annual=num('rate',{min:-99,max:100})/100;
  if(read('rate-type')==='effective') return annual;
  const m=periodsPerYear();
  const base=1+annual/m;
  if(base<=0) throw Error('This nominal rate is incompatible with the selected compounding frequency.');
  return Math.pow(base,m)-1;
}

function monthlyRate(){
  const eff=effectiveAnnualRate();
  if(1+eff<=0) throw Error('Annual rate must remain above −100%.');
  return Math.pow(1+eff,1/12)-1;
}

const currencyLocales={USD:'en-US',EUR:'de-DE',GBP:'en-GB',INR:'en-IN',JPY:'ja-JP',CNY:'zh-CN',AUD:'en-AU',CAD:'en-CA',CHF:'de-CH',SGD:'en-SG',AED:'en-AE'};
function money(value){
  if(!Number.isFinite(value)) throw Error('The result is outside the supported range. Check the inputs.');
  const currency=read('currency'),locale=currencyLocales[currency]||undefined;
  try{return new Intl.NumberFormat(locale,{style:'currency',currency,maximumFractionDigits:currency==='JPY'?0:2}).format(value)}
  catch{return currency+' '+value.toLocaleString(undefined,{maximumFractionDigits:currency==='JPY'?0:2})}
}
function pct(value){return new Intl.NumberFormat(undefined,{maximumFractionDigits:4}).format(value*100)+'%';}

function contributionMonths(freq,totalMonths){
  if(!freq) return new Set();
  const interval=12/freq;
  const set=new Set();
  for(let m=0;m<totalMonths;m++) if(m%interval===0) set.add(m);
  return set;
}

function calculateProjection(){
  const starting=num('starting',{min:0,max:1e12});
  const contribution=num('contribution',{min:0,max:1e9});
  const years=num('years',{min:1/12,max:100});
  const totalMonths=Math.max(1,Math.round(years*12));
  if(Math.abs(totalMonths-years*12)>1e-6) throw Error('Enter a term in whole months (for example 10, 10.5, or 10.25 years).');
  const freq=Number(read('contribution-frequency'));
  const timing=read('contribution-timing');
  const nominal=read('rate-type')==='nominal';
  const annual=num('rate',{min:-99,max:100})/100;
  const compoundFreq=periodsPerYear();
  if(nominal&&annual<0&&1+annual/compoundFreq<=0) throw Error('This nominal rate is incompatible with the selected compounding frequency.');
  const effectiveMonthly=nominal?null:monthlyRate();
  const compoundMonths=nominal?12/compoundFreq:null;
  const nominalPeriodRate=nominal?annual/compoundFreq:null;
  const contributionAt=contributionMonths(freq,totalMonths);
  let balance=starting,contributed=starting,interest=0;
  let periodBase=starting,periodContribWeighted=0;
  const rows=[];
  let yearInterest=0,yearContrib=0;

  for(let m=0;m<totalMonths;m++){
    const monthInPeriod=nominal?(m%compoundMonths):0;
    if(timing==='beginning'&&contributionAt.has(m)){
      balance+=contribution; contributed+=contribution; yearContrib+=contribution;
      if(nominal){
        const remaining=(compoundMonths-monthInPeriod)/compoundMonths;
        periodContribWeighted+=contribution*remaining;
      }
    }

    if(nominal){
      const periodEnd=(m+1)%compoundMonths===0;
      const projectionEnd=m===totalMonths-1;
      if(periodEnd||projectionEnd){
        const fraction=periodEnd?1:(monthInPeriod+1)/compoundMonths;
        const earned=periodBase*nominalPeriodRate*fraction+periodContribWeighted*nominalPeriodRate;
        balance+=earned; interest+=earned; yearInterest+=earned;
        periodBase=balance; periodContribWeighted=0;
      }
    }else{
      const earned=balance*effectiveMonthly;
      balance+=earned; interest+=earned; yearInterest+=earned;
    }

    if(timing==='end'&&contributionAt.has(m)){
      balance+=contribution; contributed+=contribution; yearContrib+=contribution;
      if(nominal){
        const remaining=(compoundMonths-(monthInPeriod+1))/compoundMonths;
        periodContribWeighted+=contribution*remaining;
        if((m+1)%compoundMonths===0||m===totalMonths-1) periodBase=balance;
      }
    }

    if((m+1)%12===0||m===totalMonths-1){
      rows.push({year:(m+1)/12,contributions:yearContrib,interest:yearInterest,totalContributed:contributed,balance});
      yearInterest=0; yearContrib=0;
    }
  }

  const eff=effectiveAnnualRate();
  let realValue=null;
  if(read('inflation-mode')==='on'){
    const inflation=num('inflation',{min:-50,max:100})/100;
    if(1+inflation<=0) throw Error('Inflation must be above −100%.');
    realValue=balance/Math.pow(1+inflation,totalMonths/12);
  }
  return {balance,contributed,interest,rows,eff,realValue,totalMonths};
}

function resultItem(grid,label,value){
  grid.append(el('div',{class:'result-item'},[el('small',{text:label}),el('strong',{text:value})]));
}

function drawChart(rows){
  const wrap=el('div',{class:'savings-chart','aria-label':'Savings growth visualization'});
  wrap.append(el('h3',{text:'Growth over time'}));
  const width=760,height=280,pad=42;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  svg.setAttribute('role','img');
  svg.setAttribute('aria-label','Line chart of total contributions and projected balance over time');
  svg.style.width='100%'; svg.style.height='auto';
  const max=Math.max(1,...rows.flatMap(r=>[r.totalContributed,r.balance]));
  const x=i=>pad+(rows.length===1?0:i*(width-pad*2)/(rows.length-1));
  const y=v=>height-pad-v/max*(height-pad*2);
  const ns='http://www.w3.org/2000/svg';
  const axis=document.createElementNS(ns,'path');
  axis.setAttribute('d',`M${pad} ${pad}V${height-pad}H${width-pad}`);
  axis.setAttribute('fill','none');axis.setAttribute('stroke','currentColor');axis.setAttribute('opacity','.35');
  svg.append(axis);
  const path=(key,opacity)=>{
    const p=document.createElementNS(ns,'path');
    p.setAttribute('d',rows.map((r,i)=>(i?'L':'M')+x(i)+' '+y(r[key])).join(' '));
    p.setAttribute('fill','none');p.setAttribute('stroke','currentColor');p.setAttribute('stroke-width','3');p.setAttribute('opacity',opacity);
    svg.append(p);
  };
  path('totalContributed','.45'); path('balance','1');
  wrap.append(svg,el('p',{class:'chart-legend',text:'Lighter line: total contributed · Darker line: projected balance'}));
  return wrap;
}

function annualTable(rows){
  const details=el('details');
  details.append(el('summary',{class:'button',text:'View annual breakdown'}));
  const wrap=el('div',{class:'table-wrap'}),table=el('table');
  table.append(el('thead',{},el('tr',{},['Year','Contributions','Interest earned','Total contributed','Ending balance'].map(v=>el('th',{text:v})))));
  const body=el('tbody');
  for(const r of rows) body.append(el('tr',{},[
    String(Number.isInteger(r.year)?r.year:r.year.toFixed(2)),
    money(r.contributions),money(r.interest),money(r.totalContributed),money(r.balance)
  ].map(v=>el('td',{text:v}))));
  table.append(body);wrap.append(table);details.append(wrap);return details;
}

function calculate(){
  const x=calculateProjection();
  result.hidden=false;
  result.replaceChildren(el('h2',{text:'Savings projection'}));
  const grid=el('div',{class:'result-grid'});
  resultItem(grid,'Future value',money(x.balance));
  resultItem(grid,'Total contributed',money(x.contributed));
  resultItem(grid,'Interest earned',money(x.interest));
  resultItem(grid,'Effective annual rate',pct(x.eff));
  if(x.realValue!==null) resultItem(grid,'Inflation-adjusted value',money(x.realValue));
  result.append(grid,drawChart(x.rows),annualTable(x.rows));
  result.append(el('p',{class:'notice',text:'Projection assumes the entered rate remains constant. Currency selection changes presentation only; no foreign-exchange conversion is performed. APY/effective rates are modeled through an equivalent monthly rate. Nominal rates follow the selected annual, semiannual, quarterly or monthly compounding schedule. Taxes, fees, rate changes and institution-specific posting rules are not included.'}));
}

function sync(){
  const nominal=read('rate-type')==='nominal';
  compoundingWrap.hidden=!nominal;
  $('#compounding').disabled=!nominal;
  const hasContrib=read('contribution-frequency')!=='0';
  $('#contribution').disabled=!hasContrib;
  $('#contribution-timing').disabled=!hasContrib;
  const inflation=read('inflation-mode')==='on';
  inflationWrap.hidden=!inflation; $('#inflation').disabled=!inflation;
}

for(const id of ['rate-type','contribution-frequency','inflation-mode']) $('#'+id).addEventListener('change',sync);
$('#currency').addEventListener('change',()=>{
  if(!result.hidden){result.hidden=true;status('Currency display changed. Calculate again to refresh formatted results.')}
});
for(const input of form.querySelectorAll('input,select')) input.addEventListener('input',()=>{
  if(!result.hidden){result.hidden=true;status('Input changed. Calculate again to refresh the projection.')}
});

const defaults={
 currency:'USD',starting:'10000',contribution:'500','contribution-frequency':'12','contribution-timing':'end',
 years:'10','rate-type':'effective',rate:'5',compounding:'12','inflation-mode':'off',inflation:'2.5'
};

root.append(el('div',{class:'actions'},[
 action('Calculate growth',calculate,true),
 action('Reset',()=>{
   for(const [id,value] of Object.entries(defaults)) $('#'+id).value=value;
   result.hidden=true;sync();status('Inputs reset.');
 })
]),result);

notice(root,'APY / effective annual rate already includes compounding effects. A nominal annual rate does not, so its compounding frequency matters. Inflation adjustment is an estimate of purchasing power, not a prediction of future inflation. This calculator is for projections, not financial advice.');
setupStatus(root);
sync();
