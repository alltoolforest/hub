export const INVOICE_DRAFT_KEY='alltoolforest.invoice.draft.v1';
export const INVOICE_DRAFT_VERSION=1;
const MAX_DRAFT_CHARS=250000;

function text(value,max=4000){
  const result=String(value??'');
  return result.slice(0,max);
}

function cleanTax(tax={}){
  return {
    name:text(tax.name,80),
    ratePercent:text(tax.ratePercent,40)
  };
}

function cleanItem(item={}){
  return {
    id:text(item.id,120),
    description:text(item.description,4000),
    quantity:text(item.quantity,80),
    unit:text(item.unit,80),
    rate:text(item.rate,80),
    taxes:Array.isArray(item.taxes)?item.taxes.slice(0,20).map(cleanTax):[]
  };
}

function cleanParty(party={}){
  return {
    name:text(party.name,400),
    address:text(party.address,4000),
    email:text(party.email,400),
    phone:text(party.phone,200),
    taxId:text(party.taxId,240),
    taxIdLabel:text(party.taxIdLabel,80)
  };
}

export function normalizeInvoiceDraft(value){
  if(!value||typeof value!=='object')return null;
  const raw=value.draft&&typeof value.draft==='object'?value.draft:value;
  const items=Array.isArray(raw.items)?raw.items.slice(0,200).map(cleanItem):[];
  if(!items.length)items.push(cleanItem({quantity:'1',rate:'0',taxes:[{name:'Tax',ratePercent:'0'}]}));
  return {
    seller:cleanParty(raw.seller),
    customer:cleanParty(raw.customer),
    invoiceNumber:text(raw.invoiceNumber,160),
    invoiceDate:text(raw.invoiceDate,40),
    dueDate:text(raw.dueDate,40),
    reference:text(raw.reference,240),
    currency:text(raw.currency,8).toUpperCase(),
    paymentTerms:text(raw.paymentTerms,1000),
    paymentInstructions:text(raw.paymentInstructions,4000),
    notes:text(raw.notes,4000),
    discountPercent:text(raw.discountPercent,40),
    paperSize:raw.paperSize==='LETTER'?'LETTER':'A4',
    items
  };
}

export function serializeInvoiceDraft(draft,now=new Date()){
  const normalized=normalizeInvoiceDraft(draft);
  if(!normalized)throw Error('Invoice draft is invalid.');
  const savedAt=now instanceof Date&&!Number.isNaN(now.getTime())?now.toISOString():new Date().toISOString();
  const payload=JSON.stringify({version:INVOICE_DRAFT_VERSION,savedAt,draft:normalized});
  if(payload.length>MAX_DRAFT_CHARS)throw Error('Invoice draft is too large to save locally.');
  return payload;
}

export function parseInvoiceDraft(serialized){
  if(typeof serialized!=='string'||!serialized.trim())return null;
  let parsed;
  try{parsed=JSON.parse(serialized)}catch{return null}
  if(!parsed||parsed.version!==INVOICE_DRAFT_VERSION||typeof parsed.savedAt!=='string')return null;
  const draft=normalizeInvoiceDraft(parsed.draft);
  if(!draft)return null;
  return {savedAt:parsed.savedAt,draft};
}

export function saveInvoiceDraft(storage,draft,now=new Date()){
  if(!storage||typeof storage.setItem!=='function')return {saved:false,reason:'unavailable'};
  try{
    const serialized=serializeInvoiceDraft(draft,now);
    storage.setItem(INVOICE_DRAFT_KEY,serialized);
    return {saved:true,chars:serialized.length};
  }catch(error){
    return {saved:false,reason:error?.message||'Draft could not be saved.'};
  }
}

export function loadInvoiceDraft(storage){
  if(!storage||typeof storage.getItem!=='function')return {draft:null,reason:'unavailable'};
  try{
    const raw=storage.getItem(INVOICE_DRAFT_KEY);
    if(!raw)return {draft:null,reason:'empty'};
    const parsed=parseInvoiceDraft(raw);
    if(!parsed)return {draft:null,reason:'invalid'};
    return {...parsed,reason:null};
  }catch(error){
    return {draft:null,reason:error?.message||'Draft could not be read.'};
  }
}

export function clearInvoiceDraft(storage){
  if(!storage||typeof storage.removeItem!=='function')return false;
  try{storage.removeItem(INVOICE_DRAFT_KEY);return true}catch{return false}
}
