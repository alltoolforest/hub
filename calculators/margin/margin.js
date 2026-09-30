import {$,el,notice,setupStatus,status} from '../../assets/js/core.js';

const root=$('#workspace');
if(!root) throw Error('Margin calculator workspace unavailable.');

const currencies=[
 ['USD','USD — US Dollar ($)','en-US'],['EUR','EUR — Euro (€)','de-DE'],['GBP','GBP — British Pound (£)','en-GB'],
 ['INR','INR — Indian Rupee (₹)','en-IN'],['JPY','JPY — Japanese Yen (¥)','ja-JP'],['CNY','CNY — Chinese Yuan (CN¥)','zh-CN'],
 ['AUD','AUD — Australian Dollar (A$)','en-AU'],['CAD','CAD — Canadian Dollar (C$)','en-CA'],['CHF','CHF — Swiss Franc (CHF)','de-CH'],
 ['SGD','SGD — Singapore Dollar (S$)','en-SG'],['AED','AED — UAE Dirham (AED)','en-AE']
];

const style=el('style',{text:`
.margin-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.margin-full{grid-column:1/-1}
.margin-note{padding:12px 14px;border:1px solid var(--line);border-radius:8px;background:var(--surface);font-size:13px;color:var(--muted)}
.margin-results{margin-top:22px}.margin-results h2{font-size:17px}.margin-explain{margin-top:18px;padding-top:14px;border-top:1px solid var(--line);font-size:14px;color:var(--muted)}
@media(max-width:700px){.margin-grid{grid-template-columns:1fr}.margin-full{grid-column:auto}.actions button{width:100%}}
`});
root.prepend(style);

const form=el('div',{class:'margin-grid'});root.append(form);
const field=(label,control,full=false)=>{const w=el('div',{class:'field'+(full?' margin-full':'')});control.setAttribute('aria-label',label);w.append(el('label',{text:label}),control);return w};
const input=(value,opts={})=>{const x=el('input',{type:'number',value:String(value),min:opts.min??'0',max:opts.max??'1000000000000',step:opts.step??'0.01',inputmode:'decimal'});x.value=String(value);return x};
const select=(options,value)=>{const x=el('select');for(const [v,l] of options)x.append(el('option',{value:v,text:l}));x.value=value;return x};

const currency=select(currencies.map(x=>[x[0],x[1]]),'USD');
const mode=select([
 ['evaluate','Selling price → margin & markup'],
 ['target-margin','Target margin → required selling price'],
 ['markup-price','Markup → selling price'],
 ['cost-price','Cost → selling price']
],'evaluate');
const productCost=input(60),sellingPrice=input(100),targetMargin=input(40,{max:'99.999999',step:'0.01'}),markup=input(66.6667,{max:'100000',step:'0.01'});
const shipping=input(0),fees=input(0),other=input(0);
const targetMarkup=input(50,{max:'100000',step:'0.01'});
const targetBasis=select([['margin','Use target margin'],['markup','Use target markup']],'margin');

form.append(field('Currency',currency),field('Solve mode',mode),field('Product / acquisition cost',productCost),field('Selling price',sellingPrice));
const marginField=field('Target margin (%)',targetMargin),markupField=field('Markup (%)',markup),basisField=field('Cost → price method',targetBasis),targetMarkupField=field('Target markup (%)',targetMarkup);
form.append(marginField,markupField,basisField,targetMarkupField);
form.append(field('Shipping / fulfillment cost',shipping),field('Fees / commissions',fees),field('Tax / other cost',other));
form.append(el('div',{class:'margin-note margin-full',text:'Optional costs are treated as costs borne by the seller and added to product cost. Enter only costs you want included in profitability; do not double-count amounts already included elsewhere.'}));

const actions=el('div',{class:'actions'}),results=el('section',{class:'margin-results','aria-live':'polite'});
root.append(actions,results);
actions.append(el('button',{type:'button',class:'primary',text:'Calculate',onclick:calculate}),el('button',{type:'button',class:'quiet',text:'Reset',onclick:reset}));

function n(control,max=1e12){if(control.value.trim()==='')return null;const v=Number(control.value);return Number.isFinite(v)&&v>=0&&v<=max?v:null}
function money(v){
 const item=currencies.find(x=>x[0]===currency.value)||currencies[0];
 try{return new Intl.NumberFormat(item[2],{style:'currency',currency:item[0],maximumFractionDigits:item[0]==='JPY'?0:2}).format(v)}
 catch{return item[0]+' '+Number(v).toLocaleString(undefined,{maximumFractionDigits:2})}
}
function pct(v,zeroLabel='Undefined'){return Number.isFinite(v)?new Intl.NumberFormat(undefined,{maximumFractionDigits:4}).format(v)+'%':zeroLabel}
function sync(){
 const m=mode.value;
 sellingPrice.disabled=m!=='evaluate';
 targetMargin.disabled=m!=='target-margin'&&!(m==='cost-price'&&targetBasis.value==='margin');
 markup.disabled=m!=='markup-price';
 basisField.hidden=m!=='cost-price';targetMarkupField.hidden=!(m==='cost-price'&&targetBasis.value==='markup');
 marginField.hidden=!(m==='target-margin'||(m==='cost-price'&&targetBasis.value==='margin'));
 markupField.hidden=m!=='markup-price';
}
function fail(message){results.replaceChildren();status(message,true)}
function calculate(){
 const cost=n(productCost),ship=n(shipping),fee=n(fees),extra=n(other);
 if([cost,ship,fee,extra].some(v=>v===null)){fail('Enter valid non-negative costs within the supported limits.');return}
 const allIn=cost+ship+fee+extra;
 if(!Number.isFinite(allIn)||allIn>1e12){fail('All-in cost must not exceed 1,000,000,000,000 currency units.');return}
 let price;
 if(mode.value==='evaluate'){
  price=n(sellingPrice);
  if(price===null){fail('Enter a valid non-negative selling price.');return}
 }else if(mode.value==='target-margin'||(mode.value==='cost-price'&&targetBasis.value==='margin')){
  const m=n(targetMargin,99.999999);
  if(m===null||m>=100){fail('Target margin must be at least 0% and below 100%.');return}
  price=allIn/(1-m/100);
 }else{
  if(allIn===0){fail('Markup-based pricing is undefined when all-in cost is zero. Use target margin or enter a positive cost.');return}
  const control=mode.value==='markup-price'?markup:targetMarkup;
  const mk=n(control,100000);
  if(mk===null){fail('Enter a valid non-negative markup percentage.');return}
  price=allIn*(1+mk/100);
 }
 const maxPreciseMoney=Number.MAX_SAFE_INTEGER/100;
 if(!Number.isFinite(price)||price>maxPreciseMoney){fail('This result is too large to preserve reliable currency precision. Reduce the costs or target percentage.');return}
 const grossProfit=price-cost;
 const profit=price-allIn;
 const margin=price===0?(profit===0?null:-Infinity):profit/price*100;
 const effectiveMarkup=allIn===0?(profit===0?null:Infinity):profit/allIn*100;
 results.replaceChildren(el('h2',{text:'Profitability result'}));
 const grid=el('div',{class:'result-grid'});
 const items=[
  ['Product cost',money(cost)],['Optional costs',money(ship+fee+extra)],['All-in / break-even cost',money(allIn)],
  ['Selling price',money(price)],['Gross profit before optional costs',money(grossProfit)],['Profit after entered costs',money(profit)],['Profit margin',pct(margin,price===0?'Undefined (zero selling price)':'Undefined')],['Markup on all-in cost',pct(effectiveMarkup,allIn===0?'Undefined (zero cost)':'Undefined')]
 ];
 for(const [label,value] of items)grid.append(el('div',{class:'result-item'},[el('small',{text:label}),el('strong',{text:value})]));
 results.append(grid,el('div',{class:'margin-explain',text:'Profit margin here uses profit after all entered costs as a percentage of selling price. Markup uses that profit as a percentage of all-in cost. Gross profit before optional costs is selling price minus product cost. Break-even price equals all-in cost when no additional seller-borne costs or price-dependent fees are omitted.'}));
 status('Calculated. Currency changes formatting only; it does not convert values.');
}
function reset(){
 currency.value='USD';mode.value='evaluate';productCost.value='60';sellingPrice.value='100';targetMargin.value='40';markup.value='66.6667';shipping.value=fees.value=other.value='0';targetBasis.value='margin';targetMarkup.value='50';sync();calculate();status('Inputs reset.');
}
for(const c of [currency,mode,productCost,sellingPrice,targetMargin,markup,shipping,fees,other,targetBasis,targetMarkup])c.addEventListener('input',()=>{sync();calculate()});
sync();setupStatus(root);
notice(root,'Currency selection changes labels and formatting only; it does not perform exchange-rate conversion. Optional tax, fees and shipping are treated as seller-borne costs, not jurisdiction-specific tax calculations. Percentage-based marketplace/payment fees charged on selling price are not modeled as fixed costs here.');
calculate();
