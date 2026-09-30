import {$,el,notice,setupStatus,status} from '../../assets/js/core.js';

const root=$('#workspace');
if(!root) throw Error('Tax calculator workspace unavailable.');

const currencies=[
 ['USD','USD — US Dollar ($)','en-US'],['EUR','EUR — Euro (€)','de-DE'],['GBP','GBP — British Pound (£)','en-GB'],
 ['INR','INR — Indian Rupee (₹)','en-IN'],['JPY','JPY — Japanese Yen (¥)','ja-JP'],['CNY','CNY — Chinese Yuan (CN¥)','zh-CN'],
 ['AUD','AUD — Australian Dollar (A$)','en-AU'],['CAD','CAD — Canadian Dollar (C$)','en-CA'],['CHF','CHF — Swiss Franc (CHF)','de-CH'],
 ['SGD','SGD — Singapore Dollar (S$)','en-SG'],['AED','AED — UAE Dirham (AED)','en-AE']
];
let components=[{name:'Tax',rate:10}];

const style=el('style',{text:`
.tax-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.tax-full{grid-column:1/-1}
.tax-components{display:grid;gap:10px}.tax-component{display:grid;grid-template-columns:minmax(140px,2fr) minmax(100px,1fr) auto;gap:10px;align-items:end}
.tax-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.tax-head h2{font-size:17px;margin:0}.tax-head p{font-size:13px;color:var(--muted);margin:3px 0 0}
.tax-manual{border-left:3px solid #b9872e;background:#fff8e8;padding:11px 14px;border-radius:0 7px 7px 0;font-size:13px}
.tax-results{margin-top:22px}.tax-results h2{font-size:17px}.tax-lines{margin-top:18px;display:grid;gap:8px}.tax-line{display:flex;justify-content:space-between;gap:15px;border-bottom:1px solid var(--line);padding:8px 0}.tax-line span{color:var(--muted)}
@media(max-width:700px){.tax-grid{grid-template-columns:1fr}.tax-full{grid-column:auto}.tax-component{grid-template-columns:1fr}.tax-component button{width:100%}.tax-head{display:block}.tax-head button{width:100%;margin-top:10px}.tax-line{display:block}.tax-line strong{display:block;margin-top:3px}}
`});
root.prepend(style);

const form=el('div',{class:'tax-grid'});
root.append(form);
const field=(label,control,full=false)=>{const w=el('div',{class:'field'+(full?' tax-full':'')});if(!control.getAttribute('aria-label'))control.setAttribute('aria-label',label);w.append(el('label',{text:label}),control);return w};
const input=(attrs={})=>{const x=el('input',attrs);if(attrs.value!=null)x.value=attrs.value;return x};
const select=(options,value)=>{const x=el('select');for(const [v,l] of options)x.append(el('option',{value:v,text:l}));x.value=value;return x};

const currency=select(currencies.map(x=>[x[0],x[1]]),'USD');
const mode=select([['exclusive','Add tax — entered price excludes tax'],['inclusive','Reverse tax — entered price includes tax']],'exclusive');
const unitPrice=input({type:'number',value:'100',min:'0',max:'1000000000000',step:'0.01',inputmode:'decimal'});
const quantity=input({type:'number',value:'1',min:'0',max:'1000000',step:'0.001',inputmode:'decimal'});
const discountType=select([['none','No discount'],['percent','Percentage discount'],['fixed','Fixed amount discount']],'none');
const discount=input({type:'number',value:'0',min:'0',max:'1000000000000',step:'0.01',inputmode:'decimal'});
const discountOrder=select([['before','Discount before tax'],['after','Discount after tax']],'before');
const rounding=select([['currency','Currency-default display'],['2','Display 2 decimal places'],['0','Display whole currency units']],'currency');

for(const [label,control] of [
 ['Currency',currency],['Calculation',mode],['Unit price / entered price',unitPrice],['Quantity',quantity],
 ['Discount type',discountType],['Discount value',discount],['Discount ordering',discountOrder],['Display rounding',rounding]
]) form.append(field(label,control));

const compWrap=el('div',{class:'tax-full'});
form.append(compWrap);
function renderComponents(){
 compWrap.replaceChildren();
 const head=el('div',{class:'tax-head'},[
  el('div',{},[el('h2',{text:'Tax components'}),el('p',{text:'Enter the tax name and rate manually. Components are combined as additive rates on the same taxable base.'})]),
  el('button',{type:'button',text:'+ Add tax component'})
 ]);
 head.querySelector('button').addEventListener('click',()=>{if(components.length>=10){status('Maximum 10 tax components.',true);return}components.push({name:'Tax '+(components.length+1),rate:0});renderComponents();calculate()});
 const rows=el('div',{class:'tax-components'});
 components.forEach((item,i)=>{
  const name=input({type:'text',value:item.name,maxlength:'40','aria-label':'Tax component '+(i+1)+' name'});
  const rate=input({type:'number',value:item.rate,min:'0',max:'1000',step:'0.001',inputmode:'decimal','aria-label':'Tax component '+(i+1)+' rate percent'});
  const remove=el('button',{type:'button',class:'quiet',text:'Remove','aria-label':'Remove tax component '+(i+1)});
  name.addEventListener('input',()=>{item.name=name.value;calculate()});
  rate.addEventListener('input',()=>{const v=readNumber(rate,0,1000);if(v===null){item.rate=NaN;calculate();return}item.rate=v;calculate()});
  remove.addEventListener('click',()=>{components.splice(i,1);renderComponents();calculate()});
  rows.append(el('div',{class:'tax-component'},[field('Component name',name),field('Rate (%)',rate),remove]));
 });
 compWrap.append(head,el('div',{class:'tax-manual',text:'Manual-rate status: rates are entered by you. AllToolForest does not determine the legally applicable tax rate, taxability, exemptions, place-of-supply rules or filing treatment.'}),rows);
}

const results=el('section',{class:'tax-results','aria-live':'polite'});
const actions=el('div',{class:'actions'});
root.append(actions,results);
actions.append(el('button',{type:'button',class:'primary',text:'Calculate',onclick:calculate}),el('button',{type:'button',class:'quiet',text:'Reset',onclick:reset}));

function readNumber(control,min,max){
 if(control.value.trim()==='')return null;
 const n=Number(control.value);return Number.isFinite(n)&&n>=min&&n<=max?n:null;
}
function money(v){
 const item=currencies.find(x=>x[0]===currency.value)||currencies[0];
 const digits=rounding.value==='currency'?(item[0]==='JPY'?0:2):Number(rounding.value);
 try{return new Intl.NumberFormat(item[2],{style:'currency',currency:item[0],minimumFractionDigits:digits,maximumFractionDigits:digits}).format(v)}
 catch{return item[0]+' '+Number(v).toLocaleString(undefined,{maximumFractionDigits:2})}
}
function roundValue(v){return v}
function calculate(){
 const price=readNumber(unitPrice,0,1e12),qty=readNumber(quantity,0,1e6),disc=readNumber(discount,0,1e12);
 const rates=components.map(x=>Number(x.rate));
 if(price===null||qty===null||disc===null||rates.some(x=>!Number.isFinite(x)||x<0||x>1000)){results.replaceChildren();status('Enter valid non-negative values within the supported limits.',true);return}
 const entered=price*qty;
 if(!Number.isFinite(entered)||entered>1e12){results.replaceChildren();status('Entered subtotal must not exceed 1,000,000,000,000 currency units.',true);return}
 let discountAmount=discountType.value==='none'?0:discountType.value==='percent'?entered*disc/100:disc;
 if(discountType.value==='percent'&&disc>100){results.replaceChildren();status('Percentage discount cannot exceed 100%.',true);return}
 if(discountAmount>entered){results.replaceChildren();status('Discount cannot exceed the entered subtotal.',true);return}
 const totalRate=rates.reduce((a,b)=>a+b,0)/100;
 let base,taxTotal,finalTotal;
 if(mode.value==='exclusive'){
   const before=discountOrder.value==='before'?discountAmount:0;
   base=entered-before;taxTotal=base*totalRate;finalTotal=base+taxTotal-(discountOrder.value==='after'?discountAmount:0);
 }else{
   const before=discountOrder.value==='before'?discountAmount:0;
   const inclusive=entered-before;
   base=inclusive/(1+totalRate);taxTotal=inclusive-base;finalTotal=inclusive-(discountOrder.value==='after'?discountAmount:0);
 }
 if(finalTotal<0){results.replaceChildren();status('Discount produces a negative final total.',true);return}
 const values={entered,discountAmount,base,taxTotal,finalTotal};
 for(const k in values)values[k]=roundValue(values[k]);
 results.replaceChildren(el('h2',{text:'Tax calculation'}));
 const grid=el('div',{class:'result-grid'});
 grid.append(
  item('Entered subtotal',money(values.entered)),
  item(discountOrder.value==='before'?'Discount before tax':'Discount after tax',money(values.discountAmount)),
  item(mode.value==='inclusive'?'Extracted taxable base':'Taxable base',money(values.base)),
  item('Total tax',money(values.taxTotal)),
  item('Final total',money(values.finalTotal))
 );
 results.append(grid);
 const lines=el('div',{class:'tax-lines'});
 components.forEach(x=>lines.append(el('div',{class:'tax-line'},[el('span',{text:(x.name||'Tax')+' · '+x.rate+'%'}),el('strong',{text:money(roundValue(base*Number(x.rate)/100))})])));
 results.append(el('h2',{text:'Tax components'}),lines);
 status('Calculated using manual rates. Verify the applicable rates and tax treatment for your jurisdiction.');
}
function item(label,value){return el('div',{class:'result-item'},[el('small',{text:label}),el('strong',{text:value})])}
function reset(){
 currency.value='USD';mode.value='exclusive';unitPrice.value='100';quantity.value='1';discountType.value='none';discount.value='0';discountOrder.value='before';rounding.value='currency';
 components=[{name:'Tax',rate:10}];renderComponents();calculate();status('Inputs reset. Rates remain manual and jurisdiction-neutral.');
}
for(const c of [currency,mode,unitPrice,quantity,discountType,discount,discountOrder,rounding])c.addEventListener('input',calculate);
renderComponents();
notice(root,'Country-neutral calculator. Currency and display rounding change presentation only and do not convert or alter calculated values. Tax rates and components are manual inputs; this tool does not determine jurisdiction-specific law, registration rules, exemptions, product classification, filing obligations or tax advice.');
setupStatus(root);
calculate();
