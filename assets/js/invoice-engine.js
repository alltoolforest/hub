const FALLBACK_CURRENCIES=[
  'AED','ARS','AUD','BDT','BHD','BRL','CAD','CHF','CLP','CNY','COP','CZK','DKK','EGP','EUR','GBP','GHS','HKD','HUF','IDR','ILS','INR','ISK','JPY','KES','KRW','KWD','LKR','MAD','MXN','MYR','NGN','NOK','NZD','OMR','PEN','PHP','PKR','PLN','QAR','RON','SAR','SEK','SGD','THB','TRY','TWD','TZS','UGX','USD','VND','ZAR'
];

const POW10=[1n];
function pow10(n){
  if(!Number.isInteger(n)||n<0||n>30)throw Error('Decimal precision is unsupported.');
  while(POW10.length<=n)POW10.push(POW10[POW10.length-1]*10n);
  return POW10[n];
}

function decimal(value,{name='Value',positive=false,nonNegative=false,maxScale=12}={}){
  const text=String(value??'').trim();
  if(!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text))throw Error(name+' must be a valid non-negative number.');
  const [whole,fraction='']=text.split('.');
  if(fraction.length>maxScale)throw Error(name+' has too many decimal places.');
  const digits=(whole+fraction).replace(/^0+(?=\d)/,'')||'0';
  const result={int:BigInt(digits),scale:fraction.length,text};
  if(positive&&result.int===0n)throw Error(name+' must be greater than zero.');
  if(nonNegative&&result.int<0n)throw Error(name+' cannot be negative.');
  return result;
}

function roundDivide(numerator,denominator){
  if(denominator<=0n)throw Error('Invalid calculation denominator.');
  if(numerator<0n)throw Error('Negative monetary values are not supported.');
  const quotient=numerator/denominator,remainder=numerator%denominator;
  return remainder*2n>=denominator?quotient+1n:quotient;
}

function safeMinor(big){
  if(big>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Amounts are too large for safe invoice calculation.');
  return Number(big);
}

function multiplyToMinor(quantity,rate,fractionDigits){
  const q=decimal(quantity,{name:'Quantity',positive:true});
  const r=decimal(rate,{name:'Unit rate',nonNegative:true});
  const numerator=q.int*r.int*pow10(fractionDigits);
  const denominator=pow10(q.scale+r.scale);
  return roundDivide(numerator,denominator);
}

function percentOfMinor(amountMinor,percent,name='Percentage'){
  const p=decimal(percent,{name,maxScale:6});
  const hundred=100n*pow10(p.scale);
  if(p.int>hundred)throw Error(name+' must be between 0 and 100.');
  return roundDivide(amountMinor*p.int,hundred);
}

function availableCurrencyCodes(){
  let codes=[];
  try{
    if(typeof Intl.supportedValuesOf==='function')codes=Intl.supportedValuesOf('currency');
  }catch{}
  if(!codes.length)codes=FALLBACK_CURRENCIES;
  return [...new Set(codes.map(code=>String(code).trim().toUpperCase()).filter(code=>/^[A-Z]{3}$/.test(code)))].sort();
}

export function normalizeCurrency(currency){
  const code=String(currency||'').trim().toUpperCase();
  if(!/^[A-Z]{3}$/.test(code))throw Error('Choose a valid ISO currency.');
  if(!availableCurrencyCodes().includes(code))throw Error('Choose a supported ISO currency.');
  return code;
}

export function supportedCurrencyCodes(){
  return availableCurrencyCodes();
}

export function currencyFractionDigits(currency){
  const code=normalizeCurrency(currency);
  return new Intl.NumberFormat('en',{style:'currency',currency:code}).resolvedOptions().maximumFractionDigits;
}

export function formatMoney(minorUnits,currency,locale){
  const code=normalizeCurrency(currency);
  if(!Number.isSafeInteger(minorUnits))throw Error('Money value is outside the supported range.');
  const digits=currencyFractionDigits(code);
  const amount=minorUnits/(10**digits);
  return new Intl.NumberFormat(locale||undefined,{style:'currency',currency:code}).format(amount);
}

export function localDateISO(date=new Date()){
  if(!(date instanceof Date)||Number.isNaN(date.getTime()))throw Error('Invalid date.');
  const y=String(date.getFullYear()).padStart(4,'0');
  const m=String(date.getMonth()+1).padStart(2,'0');
  const d=String(date.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+d;
}

export function createInvoiceNumber(date=new Date()){
  if(!(date instanceof Date)||Number.isNaN(date.getTime()))throw Error('Invalid date.');
  const stamp=localDateISO(date).replaceAll('-','');
  const time=[date.getHours(),date.getMinutes(),date.getSeconds()].map(v=>String(v).padStart(2,'0')).join('');
  return 'INV-'+stamp+'-'+time;
}

export function createParty(overrides={}){
  return {
    name:'',
    address:'',
    email:'',
    phone:'',
    taxId:'',
    taxIdLabel:'Tax ID',
    extra:'',
    displayText:'',
    ...overrides
  };
}

export function createLineItem(overrides={}){
  const item={
    id:overrides.id||('line-'+Math.random().toString(36).slice(2,10)),
    description:'',
    quantity:'1',
    unit:'',
    rate:'0',
    taxes:[],
    ...overrides
  };
  item.taxes=(item.taxes||[]).map(t=>({
    name:String(t?.name||'Tax').trim()||'Tax',
    ratePercent:String(t?.ratePercent??'0').trim()||'0'
  }));
  return item;
}

export function createInvoiceState(overrides={}){
  const now=overrides.now instanceof Date?overrides.now:new Date();
  const items=Array.isArray(overrides.items)&&overrides.items.length?overrides.items.map(createLineItem):[createLineItem()];
  return {
    seller:createParty(overrides.seller),
    customer:createParty(overrides.customer),
    invoiceNumber:overrides.invoiceNumber||createInvoiceNumber(now),
    invoiceDate:overrides.invoiceDate||localDateISO(now),
    dueDate:overrides.dueDate||'',
    reference:overrides.reference||'',
    currency:normalizeCurrency(overrides.currency||'INR'),
    paymentTerms:overrides.paymentTerms??'Due within 14 days',
    paymentInstructions:overrides.paymentInstructions||'',
    notes:overrides.notes||'',
    discountPercent:String(overrides.discountPercent??'0'),
    items
  };
}

export function addLineItem(state,item={}){
  if(!state||!Array.isArray(state.items))throw Error('Invoice state is invalid.');
  return {...state,items:[...state.items,createLineItem(item)]};
}

export function removeLineItem(state,id){
  if(!state||!Array.isArray(state.items))throw Error('Invoice state is invalid.');
  const remaining=state.items.filter(item=>item.id!==id);
  if(!remaining.length)throw Error('An invoice must contain at least one line item.');
  return {...state,items:remaining};
}

function taxKey(name,ratePercent){
  return name.trim()+'|'+String(ratePercent).trim();
}

export function calculateInvoice(state){
  if(!state||!Array.isArray(state.items)||!state.items.length)throw Error('Add at least one line item.');
  const currency=normalizeCurrency(state.currency);
  const fractionDigits=currencyFractionDigits(currency);
  const discountPercent=String(state.discountPercent??'0');
  percentOfMinor(0n,discountPercent,'Discount');

  let subtotal=0n,discount=0n,net=0n,tax=0n,total=0n;
  const taxMap=new Map();

  const lines=state.items.map((raw,index)=>{
    const item=createLineItem(raw);
    const gross=multiplyToMinor(item.quantity,item.rate,fractionDigits);
    const lineDiscount=percentOfMinor(gross,discountPercent,'Discount');
    const taxable=gross-lineDiscount;
    let lineTax=0n;
    const taxes=item.taxes.map(t=>{
      const amount=percentOfMinor(taxable,t.ratePercent,t.name+' rate');
      lineTax+=amount;
      const key=taxKey(t.name,t.ratePercent);
      const previous=taxMap.get(key)||{name:t.name,ratePercent:t.ratePercent,amount:0n};
      previous.amount+=amount;
      taxMap.set(key,previous);
      return {name:t.name,ratePercent:t.ratePercent,amountMinor:safeMinor(amount)};
    });
    const lineTotal=taxable+lineTax;
    subtotal+=gross;discount+=lineDiscount;net+=taxable;tax+=lineTax;total+=lineTotal;
    return {
      id:item.id,
      index,
      description:item.description,
      quantity:item.quantity,
      unit:item.unit,
      rate:item.rate,
      rateMinor:safeMinor(multiplyToMinor('1',item.rate,fractionDigits)),
      grossMinor:safeMinor(gross),
      discountMinor:safeMinor(lineDiscount),
      netMinor:safeMinor(taxable),
      taxMinor:safeMinor(lineTax),
      totalMinor:safeMinor(lineTotal),
      taxes
    };
  });

  const taxSummary=[...taxMap.values()].map(t=>({
    name:t.name,
    ratePercent:t.ratePercent,
    amountMinor:safeMinor(t.amount)
  }));

  return {
    currency,
    fractionDigits,
    lines,
    subtotalMinor:safeMinor(subtotal),
    discountMinor:safeMinor(discount),
    netMinor:safeMinor(net),
    taxMinor:safeMinor(tax),
    totalMinor:safeMinor(total),
    taxSummary
  };
}
