import {$,el,field,read,num,action,notice,setupStatus,status} from '../../assets/js/core.js';

const root=$('#workspace');
if(!root) throw Error('GST workspace unavailable.');

const form=el('div',{class:'fields'});
const result=el('div',{id:'result',class:'result-panel',hidden:true});
root.append(form);

const add=(id,label,type='number',value='',opts={})=>{
  const wrap=field(id,label,type,value,opts);
  form.append(wrap);
  return wrap;
};
const select=(id,label,options,value=Array.isArray(options[0])?options[0][0]:options[0])=>
  add(id,label,'select',value,{options});

select('gst-mode','GST treatment',[
  ['exclusive','Exclusive of GST — add GST'],
  ['inclusive','Inclusive of GST — extract / reverse GST']
],'exclusive');

add('amount','Amount before discount (₹)','number','10000',{
  min:'0',max:'100000000000000',step:'0.01',
  hint:'Enter the price before discount. Its GST treatment is controlled above.'
});

select('gst-rate','GST rate',[
  ['0','Nil / 0%'],['0.25','0.25%'],['3','3%'],['5','5%'],
  ['12','12%'],['18','18%'],['28','28%'],['custom','Custom rate']
],'18');

const customRateWrap=add('custom-rate','Custom GST rate (%)','number','18',{
  min:'0',max:'100',step:'0.01',hint:'Use only the rate applicable to your supply.'
});
customRateWrap.hidden=true;

select('supply-type','Supply type',[
  ['intra','Intra-State — CGST + SGST/UTGST'],
  ['inter','Inter-State — IGST']
],'intra');

select('discount-type','Discount',[
  ['none','No discount'],
  ['percent','Percentage discount'],
  ['fixed','Fixed ₹ discount']
],'none');

const discountWrap=add('discount-value','Discount (%)','number','0',{
  min:'0',max:'100',step:'0.01',
  hint:'Applied before GST calculation. For inclusive prices, the entered discount is treated consistently with the inclusive price.'
});
discountWrap.hidden=true;

select('rounding','Display rounding',[
  ['paise','2 decimal places (paise)'],
  ['rupee','Nearest rupee']
],'paise');

const rateResponsibility=el('div',{class:'notice'});
rateResponsibility.append(
  el('strong',{text:'GST rate responsibility: '}),
  document.createTextNode('GST rates depend on classification, exemptions and applicable conditions. Verify the rate for your goods or services before relying on this result. '),
  el('a',{
    href:'https://cbic-gst.gov.in/gst-goods-services-rates.html',
    target:'_blank',rel:'noopener',
    text:'Check CBIC GST rates ↗'
  })
);
root.append(rateResponsibility);

function getRate(){
  const selected=read('gst-rate');
  return selected==='custom'?num('custom-rate',{min:0,max:100}):Number(selected);
}

function getDiscount(amount){
  const type=read('discount-type');
  if(type==='none') return {amount:0,label:'No discount'};
  const value=num('discount-value',{min:0,max:type==='percent'?100:100000000000000});
  const discount=type==='percent'?amount*value/100:value;
  if(discount>amount) throw Error('Fixed discount cannot exceed the entered amount.');
  return {amount:discount,label:type==='percent'?value+'%':'₹ discount'};
}

function money(value){
  const digits=read('rounding')==='rupee'?0:2;
  const rounded=read('rounding')==='rupee'?Math.round((value+Number.EPSILON)):Math.round((value+Number.EPSILON)*100)/100;
  try{
    return new Intl.NumberFormat('en-IN',{
      style:'currency',currency:'INR',
      minimumFractionDigits:digits,maximumFractionDigits:digits
    }).format(rounded);
  }catch{
    return '₹'+rounded.toFixed(digits);
  }
}

function percent(value){
  return new Intl.NumberFormat('en-IN',{maximumFractionDigits:4}).format(value)+'%';
}

function row(grid,label,value,emphasis=false){
  grid.append(el('div',{class:'result-item'},[
    el('small',{text:label}),
    el('strong',{text:value,...(emphasis?{'aria-label':label+' '+value}:{})})
  ]));
}

function calculate(){
  const amount=num('amount',{min:0,max:100000000000000});
  const rate=getRate();
  const discount=getDiscount(amount);
  const afterDiscount=amount-discount.amount;
  const inclusive=read('gst-mode')==='inclusive';

  const taxable=inclusive
    ? (rate===0?afterDiscount:afterDiscount*100/(100+rate))
    : afterDiscount;
  const gst=inclusive?afterDiscount-taxable:taxable*rate/100;
  const invoiceTotal=taxable+gst;
  const supply=read('supply-type');

  if(![taxable,gst,invoiceTotal].every(Number.isFinite)) throw Error('The entered values produce an unsupported result.');

  result.hidden=false;
  result.replaceChildren(el('h2',{text:'GST calculation'}));
  const grid=el('div',{class:'result-grid'});
  row(grid,'Original amount',money(amount));
  if(discount.amount>0) row(grid,'Discount',money(discount.amount));
  row(grid,'Taxable value',money(taxable));
  row(grid,'GST rate',percent(rate));

  if(supply==='intra'){
    row(grid,'CGST ('+percent(rate/2)+')',money(gst/2));
    row(grid,'SGST / UTGST ('+percent(rate/2)+')',money(gst/2));
  }else{
    row(grid,'IGST ('+percent(rate)+')',money(gst));
  }

  row(grid,'Total GST',money(gst));
  row(grid,'Invoice total',money(invoiceTotal),true);
  result.append(grid);

  const detail=inclusive
    ? 'Inclusive / reverse calculation extracts GST from the discounted inclusive amount; it does not mean GST reverse charge.'
    : 'Exclusive calculation adds GST to the taxable value after the discount.';
  result.append(el('p',{class:'notice',text:detail+' Internal calculations keep full precision; only displayed values use the selected rounding.'}));
}

function sync(){
  const custom=read('gst-rate')==='custom';
  customRateWrap.hidden=!custom;
  $('#custom-rate').disabled=!custom;

  const type=read('discount-type');
  discountWrap.hidden=type==='none';
  $('#discount-value').disabled=type==='none';
  const label=discountWrap.querySelector('label');
  const input=$('#discount-value');
  const hint=discountWrap.querySelector('small');
  if(type==='percent'){
    label.textContent='Discount (%)';
    input.max='100';
    input.value=Math.min(Number(input.value)||0,100);
    hint.textContent='Percentage reduction applied before GST calculation.';
  }else if(type==='fixed'){
    label.textContent='Discount amount (₹)';
    input.max='100000000000000';
    hint.textContent='Fixed reduction from the entered price before GST calculation.';
  }
}

$('#gst-rate').addEventListener('change',sync);
$('#discount-type').addEventListener('change',sync);
$('#rounding').addEventListener('change',()=>{if(!result.hidden) calculate()});

const defaults={
  'gst-mode':'exclusive','amount':'10000','gst-rate':'18','custom-rate':'18',
  'supply-type':'intra','discount-type':'none','discount-value':'0','rounding':'paise'
};

const actions=el('div',{class:'actions'},[
  action('Calculate GST',calculate,true),
  action('Reset',()=>{
    for(const [id,value] of Object.entries(defaults)) $('#'+id).value=value;
    result.hidden=true;
    sync();
    status('Inputs reset.');
  })
]);
root.append(actions,result);

notice(root,'Focused calculation only — not tax advice or GST-compliance software. Supply type and GST rate are your inputs. Discounts are treated as reductions before GST calculation; post-supply discounts can have additional legal conditions. Compensation cess, HSN/SAC classification, GSTIN validation, ITC, returns and e-invoicing are outside this calculator.');
setupStatus(root);
sync();
