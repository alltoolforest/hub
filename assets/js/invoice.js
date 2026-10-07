import {$,el,field,read,num,format,action,notice,setupStatus} from './core.js';
import {
  supportedCurrencyCodes,
  localDateISO,
  createInvoiceNumber,
  createInvoiceState,
  createLineItem,
  calculateInvoice,
  formatMoney
} from './invoice-engine.js';

export async function mount(root){
  const form=el('div',{class:'fields'});
  root.append(form);
  const add=(id,label,type='text',value='',opts={})=>form.append(field(id,label,type,value,opts));
  const required=id=>{
    const value=read(id);
    if(!value)throw Error('Complete '+$('#'+id).labels[0].textContent+'.');
    return value;
  };

  add('seller','From (name / business)','textarea','',{maxlength:2000});
  add('buyer','Bill to','textarea','',{maxlength:2000});
  add('number','Invoice number','text',createInvoiceNumber(),{maxlength:80});
  add('date','Invoice date','date',localDateISO());

  const currencies=supportedCurrencyCodes();
  const defaultCurrency=currencies.includes('INR')?'INR':currencies.includes('USD')?'USD':currencies[0];
  add('currency','Currency','select',defaultCurrency,{options:currencies.map(code=>[code,code])});
  add('terms','Payment terms','text','Due within 14 days',{maxlength:500});
  add('description','Description','textarea','',{full:true,maxlength:2000});
  add('quantity','Quantity','number',1,{min:.001,step:.001});
  add('rate','Unit rate','number',1000,{min:0,step:.01});
  add('discount','Discount (%)','number',0,{min:0,max:100,step:.01});
  add('tax','Tax (%)','number',0,{min:0,max:100,step:.01});

  const invoice=el('article',{class:'invoice',hidden:true});
  const createButton=action('Create invoice',()=>{
    const state=createInvoiceState({
      seller:{displayText:required('seller')},
      customer:{displayText:required('buyer')},
      invoiceNumber:required('number'),
      invoiceDate:required('date'),
      currency:read('currency'),
      paymentTerms:read('terms'),
      discountPercent:read('discount'),
      items:[createLineItem({
        id:'visible-line-1',
        description:required('description'),
        quantity:(num('quantity',{min:.001}),read('quantity')),
        rate:(num('rate',{min:0}),read('rate')),
        taxes:[{name:'Tax',ratePercent:(num('tax',{min:0,max:100}),read('tax'))}]
      })]
    });
    const totals=calculateInvoice(state);
    const money=minor=>formatMoney(minor,totals.currency);

    invoice.replaceChildren();
    invoice.hidden=false;
    invoice.append(
      el('header',{},[
        el('div',{},[
          el('h2',{text:'INVOICE'}),
          el('p',{text:state.invoiceNumber+' · '+state.invoiceDate})
        ]),
        el('pre',{text:state.seller.displayText})
      ]),
      el('h3',{text:'Bill to'}),
      el('pre',{text:state.customer.displayText})
    );

    const line=totals.lines[0];
    const table=el('table');
    table.append(
      el('thead',{},el('tr',{},['Description','Quantity','Rate','Amount'].map(text=>el('th',{text})))),
      el('tbody',{},el('tr',{},[
        line.description,
        format(Number(line.quantity)),
        money(line.rateMinor),
        money(line.grossMinor)
      ].map(text=>el('td',{text}))))
    );

    invoice.append(
      table,
      el('p',{text:'Discount: '+money(totals.discountMinor)+'\nTax: '+money(totals.taxMinor)}),
      el('h3',{text:'Total due: '+money(totals.totalMinor)}),
      el('p',{text:state.paymentTerms})
    );
    document.body.classList.add('print-invoice');
  },true);

  const printButton=action('Print / Save PDF',()=>{
    if(invoice.hidden)throw Error('Create the invoice first.');
    window.print();
  });

  root.append(el('div',{class:'actions'},[createButton,printButton]),invoice);
  notice(root,'Simple single-line invoice. Discount is applied before tax. Currency formatting follows the selected ISO currency. Check your local invoice requirements before issuing it. Choose “Save as PDF” in your device’s print options.');
  setupStatus(root);
}
