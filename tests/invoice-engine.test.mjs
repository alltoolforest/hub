import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  supportedCurrencyCodes,
  currencyFractionDigits,
  formatMoney,
  formatUnitRate,
  localDateISO,
  createInvoiceNumber,
  createInvoiceState,
  createLineItem,
  addLineItem,
  removeLineItem,
  calculateInvoice
} from '../assets/js/invoice-engine.js';

function invoice(overrides={}){
  return createInvoiceState({
    now:new Date(2026,9,7,10,11,12),
    currency:'USD',
    discountPercent:'0',
    items:[createLineItem({id:'one',description:'Service',quantity:'1',rate:'100',taxes:[]})],
    ...overrides
  });
}

const currencies=supportedCurrencyCodes();
for(const code of ['USD','EUR','INR','JPY','KWD'])assert.ok(currencies.includes(code),'Expected supported currency '+code);
assert.equal(currencyFractionDigits('USD'),2);
assert.equal(currencyFractionDigits('JPY'),0);
assert.equal(currencyFractionDigits('KWD'),3);
assert.match(formatMoney(123456,'USD','en-US'),/1,234\.56/);
assert.match(formatMoney(123456,'JPY','en-US'),/123,456/);
assert.match(formatUnitRate('0.335','USD','en-US'),/0\.335/);
assert.match(formatUnitRate('1.2345','KWD','en-US'),/1\.2345/);

const local=new Date(2026,9,7,23,59,58);
assert.equal(localDateISO(local),'2026-10-07');
const number1=createInvoiceNumber(new Date(2026,9,7,10,11,12));
const number2=createInvoiceNumber(new Date(2026,9,7,10,11,13));
assert.match(number1,/^INV-20261007-101112$/);
assert.notEqual(number1,number2,'Default invoice number must not be a repeated static value.');

const engineUrl=pathToFileURL(resolve('assets/js/invoice-engine.js')).href;
function dateInTimezone(tz,iso){
  const script=`import {localDateISO} from ${JSON.stringify(engineUrl)}; console.log(localDateISO(new Date(${JSON.stringify(iso)})));`;
  const run=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',env:{...process.env,TZ:tz}});
  assert.equal(run.status,0,run.stderr);
  return run.stdout.trim();
}
assert.equal(dateInTimezone('Asia/Kolkata','2026-01-01T20:00:00Z'),'2026-01-02');
assert.equal(dateInTimezone('America/Los_Angeles','2026-01-01T04:00:00Z'),'2025-12-31');

const mixed=calculateInvoice(invoice({
  discountPercent:'10',
  items:[
    createLineItem({id:'a',description:'A',quantity:'2',rate:'19.99',taxes:[{name:'VAT',ratePercent:'7.5'}]}),
    createLineItem({id:'b',description:'B',quantity:'1.5',rate:'100',taxes:[{name:'VAT',ratePercent:'0'}]})
  ]
}));
assert.equal(mixed.subtotalMinor,18998);
assert.equal(mixed.discountMinor,1900);
assert.equal(mixed.netMinor,17098);
assert.equal(mixed.taxMinor,270);
assert.equal(mixed.totalMinor,17368);
assert.equal(mixed.lines[0].grossMinor,3998);
assert.equal(mixed.lines[0].discountMinor,400);
assert.equal(mixed.lines[0].taxMinor,270);
assert.equal(mixed.lines[1].grossMinor,15000);
assert.equal(mixed.lines[1].taxMinor,0);
assert.equal(mixed.taxSummary.length,2,'Different tax-rate groups must remain distinguishable.');

const multiTax=calculateInvoice(invoice({
  items:[createLineItem({
    id:'taxed',description:'Consulting',quantity:'1',rate:'100',
    taxes:[{name:'GST',ratePercent:'5'},{name:'Local tax',ratePercent:'2.5'}]
  })]
}));
assert.equal(multiTax.subtotalMinor,10000);
assert.equal(multiTax.taxMinor,750);
assert.equal(multiTax.totalMinor,10750);
assert.deepEqual(multiTax.taxSummary.map(t=>[t.name,t.ratePercent,t.amountMinor]),[
  ['GST','5',500],['Local tax','2.5',250]
]);

const rounding=calculateInvoice(invoice({
  items:[createLineItem({id:'round',description:'Rounded',quantity:'3',rate:'0.335',taxes:[]})]
}));
assert.equal(rounding.subtotalMinor,101,'0.335 × 3 must deterministically round half-up to $1.01.');
assert.equal(rounding.lines[0].rate,'0.335','Precise unit-rate input must be preserved for invoice display.');

const jpy=calculateInvoice(invoice({
  currency:'JPY',
  items:[createLineItem({id:'jpy',description:'JPY item',quantity:'2',rate:'100.5',taxes:[]})]
}));
assert.equal(jpy.subtotalMinor,201);
assert.equal(jpy.totalMinor,201);

const kwd=calculateInvoice(invoice({
  currency:'KWD',
  items:[createLineItem({id:'kwd',description:'KWD item',quantity:'1',rate:'1.2345',taxes:[]})]
}));
assert.equal(kwd.subtotalMinor,1235);
assert.equal(kwd.lines[0].rateMinor,1235);

const zero=calculateInvoice(invoice({
  discountPercent:'100',
  items:[createLineItem({id:'free',description:'No charge',quantity:'1',rate:'0',taxes:[{name:'Tax',ratePercent:'20'}]})]
}));
assert.equal(zero.totalMinor,0);

const high=calculateInvoice(invoice({
  items:[createLineItem({id:'high',description:'High value',quantity:'2',rate:'1000000000',taxes:[{name:'Tax',ratePercent:'18'}]})]
}));
assert.equal(high.subtotalMinor,200000000000);
assert.equal(high.taxMinor,36000000000);
assert.equal(high.totalMinor,236000000000);

const model=createInvoiceState({
  now:new Date(2026,9,7,9,0,0),
  seller:{name:'Seller',taxId:'GST-123',taxIdLabel:'GSTIN'},
  customer:{name:'Buyer',taxId:'VAT-456',taxIdLabel:'VAT ID'},
  dueDate:'2026-10-21',
  reference:'PO-77',
  paymentTerms:'Net 14',
  paymentInstructions:'Bank transfer',
  notes:'Thank you',
  currency:'EUR',
  items:[createLineItem({id:'base',description:'Base',quantity:'1',unit:'hour',rate:'10',taxes:[]})]
});
assert.equal(model.seller.taxId,'GST-123');
assert.equal(model.customer.taxIdLabel,'VAT ID');
assert.equal(model.dueDate,'2026-10-21');
assert.equal(model.reference,'PO-77');
assert.equal(model.paymentInstructions,'Bank transfer');
assert.equal(model.items[0].unit,'hour');

const withSecond=addLineItem(model,{id:'second',description:'Second',quantity:'2',rate:'5'});
assert.equal(model.items.length,1,'addLineItem must not mutate the existing invoice state.');
assert.equal(withSecond.items.length,2);
const removed=removeLineItem(withSecond,'base');
assert.equal(removed.items.length,1);
assert.equal(removed.items[0].id,'second');
assert.throws(()=>removeLineItem(model,'base'),/at least one line item/);

const hostile='<img src=x onerror=alert(1)>';
const hostileState=createInvoiceState({
  seller:{displayText:hostile},
  customer:{displayText:'Buyer'},
  items:[createLineItem({id:'x',description:hostile,quantity:'1',rate:'1'})]
});
const hostileTotals=calculateInvoice(hostileState);
assert.equal(hostileState.seller.displayText,hostile);
assert.equal(hostileTotals.lines[0].description,hostile);

assert.throws(()=>calculateInvoice(invoice({currency:'NOT'})),/valid ISO currency|supported ISO currency/);
assert.throws(()=>calculateInvoice(invoice({discountPercent:'100.01'})),/between 0 and 100/);
assert.throws(()=>calculateInvoice(invoice({
  items:[createLineItem({id:'bad',description:'Bad',quantity:'0',rate:'10'})]
})),/greater than zero/);
assert.throws(()=>calculateInvoice(invoice({
  items:[createLineItem({id:'bad',description:'Bad',quantity:'1',rate:'-1'})]
})),/valid non-negative number/);

const [appSource,workSource,invoiceSource]=await Promise.all([
  readFile('assets/js/app.js','utf8'),
  readFile('assets/js/work.js','utf8'),
  readFile('assets/js/invoice.js','utf8')
]);
assert.match(appSource,/slug==='invoice'\)mod=await import\('\.\/invoice\.js'\)/,'Invoice route must use its isolated module.');
assert.ok(!workSource.includes("slug==='invoice'"),'Shared work.js must not retain Invoice Builder implementation.');
assert.ok(!invoiceSource.includes('innerHTML'),'Invoice rendering must not insert user-entered HTML.');
assert.match(invoiceSource,/createInvoiceNumber\(\)/);
assert.match(invoiceSource,/localDateISO\(\)/);
assert.match(invoiceSource,/supportedCurrencyCodes\(\)/);

console.log('Invoice Task 1 engine and isolation regression passed.');
