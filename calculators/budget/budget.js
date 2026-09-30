import {$,el,notice,setupStatus,status} from '../../assets/js/core.js';

const root=$('#workspace');
if(!root) throw Error('Budget workspace unavailable.');

const currencies=[
 ['USD','USD — US Dollar ($)','en-US'],['EUR','EUR — Euro (€)','de-DE'],['GBP','GBP — British Pound (£)','en-GB'],
 ['INR','INR — Indian Rupee (₹)','en-IN'],['JPY','JPY — Japanese Yen (¥)','ja-JP'],['CNY','CNY — Chinese Yuan (CN¥)','zh-CN'],
 ['AUD','AUD — Australian Dollar (A$)','en-AU'],['CAD','CAD — Canadian Dollar (C$)','en-CA'],['CHF','CHF — Swiss Franc (CHF)','de-CH'],
 ['SGD','SGD — Singapore Dollar (S$)','en-SG'],['AED','AED — UAE Dirham (AED)','en-AE']
];
const storageKey='alltoolforest-budget-v2';
const defaults={
 currency:'USD',
 incomes:[{name:'Primary income',amount:5000}],
 expenses:[
  {name:'Housing',amount:1500,type:'fixed',group:'needs'},
  {name:'Food & groceries',amount:600,type:'variable',group:'needs'},
  {name:'Transport',amount:300,type:'variable',group:'needs'},
  {name:'Lifestyle / entertainment',amount:400,type:'variable',group:'wants'},
  {name:'Debt payments',amount:300,type:'fixed',group:'financial'}
 ],
 goals:[{name:'Emergency fund / savings',amount:500}]
};
let state=structuredClone(defaults);


const budgetStyle=el('style',{text:`
.budget-top{display:grid;grid-template-columns:minmax(0,260px);margin-bottom:20px}
.budget-editor{display:grid;gap:22px}
.budget-section{border:1px solid var(--line);border-radius:12px;padding:18px}
.budget-section-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:14px}
.budget-section-head h2,.budget-summary h2,.budget-breakdown h2{font-size:17px;margin:0 0 4px}
.budget-section-head p{font-size:13px;color:var(--muted);margin:0;max-width:600px}
.budget-rows{display:grid;gap:10px}.budget-row{display:grid;grid-template-columns:minmax(130px,2fr) minmax(100px,1fr) minmax(110px,1fr) minmax(150px,1.4fr) auto;gap:9px;align-items:center}
.budget-section:nth-child(1) .budget-row,.budget-section:nth-child(3) .budget-row{grid-template-columns:minmax(160px,2fr) minmax(110px,1fr) auto}
.budget-row button{min-height:46px}.budget-invalid{border-color:#a33131!important;outline:2px solid #a3313122}.budget-summary,.budget-breakdown{margin-top:22px;padding-top:20px;border-top:1px solid var(--line)}
.budget-sub{display:block;font-size:12px;color:var(--muted);margin-top:3px}.budget-compare{margin-top:22px}.budget-compare h3{font-size:15px;margin:0 0 4px}.budget-compare p{font-size:13px;color:var(--muted);margin:0 0 12px}
.budget-reference{display:grid;gap:7px}.budget-ref-row{display:grid;grid-template-columns:minmax(150px,2fr) .7fr 1fr 1.2fr;gap:10px;padding:10px 0;border-bottom:1px solid var(--line);font-size:13px}
.budget-bars{display:grid;gap:13px}.budget-bar-label{display:flex;justify-content:space-between;gap:12px;font-size:13px}.budget-bar-track{height:9px;background:#e1e9e4;border-radius:999px;overflow:hidden}.budget-bar-fill{display:block;height:100%;background:var(--green);border-radius:999px}
@media(max-width:700px){.budget-section{padding:14px}.budget-section-head{display:block}.budget-section-head button{width:100%;margin-top:10px}.budget-row,.budget-section:nth-child(1) .budget-row,.budget-section:nth-child(3) .budget-row{grid-template-columns:1fr}.budget-row button{width:100%}.budget-ref-row{grid-template-columns:1fr 1fr}.budget-bar-label{display:block}.budget-bar-label strong{display:block}.budget-top{grid-template-columns:1fr}}
`});
root.prepend(budgetStyle);

const top=el('div',{class:'budget-top'});
const currencyLabel=el('label',{for:'budget-currency',text:'Currency'});
const currency=el('select',{id:'budget-currency'});
for(const [code,label] of currencies) currency.append(el('option',{value:code,text:label}));
top.append(el('div',{class:'field'},[currencyLabel,currency]));
root.append(top);

const editor=el('div',{class:'budget-editor'});
root.append(editor);

function cleanAmount(v){const n=Number(v);return Number.isFinite(n)&&n>=0&&n<=1e12?n:0}
function parseAmount(v){if(String(v).trim()==='')return null;const n=Number(v);return Number.isFinite(n)&&n>=0&&n<=1e12?n:null}
function hasInvalidAmounts(){return [...editor.querySelectorAll('input[type="number"]')].some(x=>parseAmount(x.value)===null)}
function requireValidAmounts(){if(hasInvalidAmounts())throw Error('Fix highlighted amount fields before saving or exporting.')}
function locale(){return currencies.find(x=>x[0]===state.currency)?.[2]||undefined}
function money(v){
 try{return new Intl.NumberFormat(locale(),{style:'currency',currency:state.currency,maximumFractionDigits:state.currency==='JPY'?0:2}).format(v)}
 catch{return state.currency+' '+Number(v).toLocaleString(undefined,{maximumFractionDigits:2})}
}
function percent(v){return Number.isFinite(v)?new Intl.NumberFormat(undefined,{maximumFractionDigits:1}).format(v)+'%':'—'}
function total(rows){return rows.reduce((s,r)=>s+cleanAmount(r.amount),0)}

function input(attrs={}){
 const n=el('input',{...attrs}); if(attrs.value!=null)n.value=attrs.value; return n;
}
function selectControl(value,options){
 const s=el('select');for(const [v,label] of options)s.append(el('option',{value:v,text:label}));s.value=value;return s;
}

function row(kind,item,index){
 const r=el('div',{class:'budget-row'});
 const name=input({type:'text',value:item.name,'aria-label':kind+' name',maxlength:'60'});
 const amount=input({type:'number',value:item.amount,min:'0',max:'1000000000000',step:'0.01',inputmode:'decimal','aria-label':kind+' amount'});
 r.append(name,amount);
 if(kind==='Expense'){
   const type=selectControl(item.type,[['fixed','Fixed'],['variable','Variable']]);type.setAttribute('aria-label','Expense type');
   const group=selectControl(item.group,[['needs','Needs / essentials'],['wants','Wants / discretionary'],['financial','Savings / debt / financial'],['other','Other']]);group.setAttribute('aria-label','Budget group');
   r.append(type,group);
   type.addEventListener('change',()=>{item.type=type.value;renderSummary()});
   group.addEventListener('change',()=>{item.group=group.value;renderSummary()});
 }
 const remove=el('button',{type:'button',class:'quiet',text:'Remove','aria-label':'Remove '+kind.toLowerCase()+' row '+(index+1)});
 remove.addEventListener('click',()=>{state[kind==='Income'?'incomes':kind==='Expense'?'expenses':'goals'].splice(index,1);render()});
 name.addEventListener('input',()=>{item.name=name.value;renderSummary()});
 amount.addEventListener('input',()=>{
   const value=parseAmount(amount.value),invalid=value===null;
   amount.setAttribute('aria-invalid',invalid?'true':'false');
   amount.classList.toggle('budget-invalid',invalid);
   if(!invalid){item.amount=value;renderSummary()}
 });
 r.append(remove);return r;
}

function section(title,kind,rows,help){
 const box=el('section',{class:'budget-section'});
 box.append(el('div',{class:'budget-section-head'},[el('div',{},[el('h2',{text:title}),el('p',{text:help})]),el('button',{type:'button',text:'+ Add row'})]));
 const list=el('div',{class:'budget-rows'});
 rows.forEach((item,i)=>list.append(row(kind,item,i)));
 box.querySelector('button').addEventListener('click',()=>{
   if(rows.length>=100){status('Maximum 100 rows per section.',true);return}
   rows.push(kind==='Expense'?{name:'New expense',amount:0,type:'variable',group:'other'}:{name:kind==='Income'?'New income':'New savings goal',amount:0});
   render();
 });
 box.append(list);return box;
}

const summary=el('section',{class:'budget-summary','aria-live':'polite'});
const breakdown=el('section',{class:'budget-breakdown'});
const actions=el('div',{class:'actions'});
root.append(summary,breakdown,actions);

function summaryItem(label,value,extra=''){
 return el('div',{class:'result-item'},[el('small',{text:label}),el('strong',{text:value}),extra?el('span',{class:'budget-sub',text:extra}):'']);
}

function renderSummary(){
 state.currency=currency.value;
 const income=total(state.incomes),expenses=total(state.expenses),goals=total(state.goals);
 const committed=expenses+goals,surplus=income-committed;
 const fixed=state.expenses.filter(x=>x.type==='fixed').reduce((s,x)=>s+cleanAmount(x.amount),0);
 const variable=expenses-fixed;
 summary.replaceChildren(el('h2',{text:'Monthly budget summary'}));
 const grid=el('div',{class:'result-grid'});
 grid.append(
  summaryItem('Income',money(income)),
  summaryItem('Expenses',money(expenses),income?percent(expenses/income*100)+' of income':''),
  summaryItem('Savings goals',money(goals),income?percent(goals/income*100)+' of income':''),
  summaryItem(surplus>=0?'Surplus':'Deficit',money(Math.abs(surplus)),income?percent(Math.abs(surplus)/income*100)+' of income':'')
 );
 summary.append(grid);

 const groups={needs:0,wants:0,financial:goals,other:0};
 for(const x of state.expenses) groups[x.group]=(groups[x.group]||0)+cleanAmount(x.amount);
 const compare=el('div',{class:'budget-compare'});
 compare.append(el('h3',{text:'50 / 30 / 20 reference comparison'}),el('p',{text:'A neutral reference only — not a recommended or required budget. Categories are based on how you classify each row.'}));
 const refs=[['Needs / essentials',groups.needs,50],['Wants / discretionary',groups.wants,30],['Financial goals / debt',groups.financial,20]];
 const table=el('div',{class:'budget-reference'});
 for(const [label,value,target] of refs){
   const actual=income?value/income*100:0;
   table.append(el('div',{class:'budget-ref-row'},[
    el('span',{text:label}),el('strong',{text:income?percent(actual):'—'}),el('span',{text:'Reference '+target+'%'}),el('span',{text:income?'Difference '+(actual-target>=0?'+':'')+percent(actual-target):'—'})
   ]));
 }
 compare.append(table);summary.append(compare);

 breakdown.replaceChildren(el('h2',{text:'Category breakdown'}));
 const details=[
  ['Fixed expenses',fixed],['Variable expenses',variable],
  ['Needs / essentials',groups.needs],['Wants / discretionary',groups.wants],
  ['Financial / debt expenses',groups.financial-goals],['Other expenses',groups.other],['Savings goals',goals]
 ];
 const bg=el('div',{class:'budget-bars'});
 const max=Math.max(1,...details.map(x=>x[1]));
 for(const [label,value] of details){
   bg.append(el('div',{class:'budget-bar-row'},[
    el('div',{class:'budget-bar-label'},[el('span',{text:label}),el('strong',{text:money(value)+(income?' · '+percent(value/income*100):'')})]),
    el('div',{class:'budget-bar-track'},el('span',{class:'budget-bar-fill',style:'width:'+Math.min(100,value/max*100)+'%'}))
   ]));
 }
 breakdown.append(bg);
}

function render(){
 currency.value=state.currency;
 editor.replaceChildren(
  section('Income','Income',state.incomes,'Add salary, freelance income, benefits or any other monthly income source.'),
  section('Expenses','Expense',state.expenses,'Create your own categories and classify each as fixed or variable.'),
  section('Savings goals','Goal',state.goals,'Monthly amounts you intentionally want to set aside toward savings goals.')
 );
 renderSummary();
}

function safeState(raw){
 if(!raw||typeof raw!=='object')throw Error('Saved budget data is invalid.');
 const code=currencies.some(x=>x[0]===raw.currency)?raw.currency:'USD';
 const cleanRows=(rows,kind)=>(Array.isArray(rows)?rows:[]).slice(0,100).map(x=>({
   name:String(x?.name||'').slice(0,60)||'Untitled',
   amount:cleanAmount(x?.amount),
   ...(kind==='expense'?{type:['fixed','variable'].includes(x?.type)?x.type:'variable',group:['needs','wants','financial','other'].includes(x?.group)?x.group:'other'}:{})
 }));
 return {currency:code,incomes:cleanRows(raw.incomes,'income'),expenses:cleanRows(raw.expenses,'expense'),goals:cleanRows(raw.goals,'goal')};
}

function saveLocal(){
 try{requireValidAmounts();localStorage.setItem(storageKey,JSON.stringify(safeState(state)));status('Budget saved on this browser/device.')}
 catch{status('Local saving is unavailable in this browser mode. Use Export instead.',true)}
}
function loadLocal(){
 try{const raw=localStorage.getItem(storageKey);if(!raw){status('No locally saved budget was found.',true);return}state=safeState(JSON.parse(raw));render();status('Saved budget loaded.')}
 catch(e){status(e.message||'Could not load the saved budget.',true)}
}
function exportBudget(){
 try{requireValidAmounts()}catch(e){status(e.message,true);return}
 const payload={version:2,savedAt:new Date().toISOString(),...safeState(state)};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=el('a',{href:url,download:'alltoolforest-budget.json'});
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Budget exported as JSON.');
}
function exportCSV(){
 try{requireValidAmounts()}catch(e){status(e.message,true);return}
 const esc=v=>'"'+String(v).replaceAll('"','""')+'"';
 const clean=safeState(state);\n const rows=[['Section','Name','Amount','Type','Budget group']];\n clean.incomes.forEach(x=>rows.push(['Income',x.name,x.amount,'','']));
 clean.expenses.forEach(x=>rows.push(['Expense',x.name,x.amount,x.type,x.group]));
 clean.goals.forEach(x=>rows.push(['Savings goal',x.name,x.amount,'','financial']));
 const blob=new Blob([rows.map(r=>r.map(esc).join(',')).join('\n')],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=el('a',{href:url,download:'alltoolforest-budget.csv'});
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Budget exported as CSV.');
}
function reset(){
 if(!confirm('Reset the planner to its example budget? Your locally saved copy will remain until you save again.'))return;
 state=structuredClone(defaults);render();status('Planner reset to example values.');
}

currency.addEventListener('change',()=>{state.currency=currency.value;renderSummary()});
actions.append(
 el('button',{type:'button',class:'primary',text:'Save locally',onclick:saveLocal}),
 el('button',{type:'button',text:'Load saved',onclick:loadLocal}),
 el('button',{type:'button',text:'Export JSON',onclick:exportBudget}),
 el('button',{type:'button',text:'Export CSV',onclick:exportCSV}),
 el('button',{type:'button',class:'quiet',text:'Reset',onclick:reset})
);
notice(root,'Your budget stays in this browser unless you export it. Currency selection changes labels and formatting only; it does not convert values. The 50/30/20 view is an optional comparison framework, not financial advice or a prescribed budget.');
setupStatus(root);
render();
