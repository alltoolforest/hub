import {el,action,notice,setupStatus,status} from './core.js';
import {
  supportedCurrencyCodes,
  localDateISO,
  createInvoiceNumber,
  createInvoiceState,
  createLineItem,
  calculateInvoice,
  formatMoney,
  formatUnitRate
} from './invoice-engine.js';

let sequence=0;
const uid=prefix=>prefix+'-'+(++sequence);

function formSection(title,description=''){
  const section=el('section',{class:'invoice-form-section'});
  section.append(el('h2',{text:title}));
  if(description)section.append(el('p',{class:'invoice-section-help',text:description}));
  return section;
}

function makeField({id=uid('invoice-field'),label,type='text',value='',required=false,options=[],hint='',full=false,min,max,step,maxlength,inputmode}){
  const wrap=el('div',{class:'field invoice-field'+(full?' full':'')});
  const labelEl=el('label',{for:id,text:label+(required?' *':'')});
  const attrs={id,name:id,type};
  if(required){attrs.required=true;attrs['aria-required']='true'}
  if(min!=null)attrs.min=min;
  if(max!=null)attrs.max=max;
  if(step!=null)attrs.step=step;
  if(maxlength!=null)attrs.maxlength=maxlength;
  if(inputmode)attrs.inputmode=inputmode;
  let input;
  if(type==='textarea')input=el('textarea',attrs);
  else if(type==='select'){
    input=el('select',{id,name:id,...(required?{required:true,'aria-required':'true'}:{})});
    for(const option of options){
      const pair=Array.isArray(option)?option:[option,option];
      input.append(el('option',{value:pair[0],text:pair[1]}));
    }
  }else input=el('input',attrs);
  input.value=String(value??'');

  const described=[];
  if(hint){
    const hintId=id+'-hint';
    wrap.append(labelEl,input,el('small',{id:hintId,class:'invoice-field-hint',text:hint}));
    described.push(hintId);
  }else wrap.append(labelEl,input);

  const errorId=id+'-error';
  const error=el('small',{id:errorId,class:'field-error',hidden:true,'aria-live':'polite'});
  wrap.append(error);
  described.push(errorId);
  input.setAttribute('aria-describedby',described.join(' '));

  return {wrap,input,error,label:labelEl,id,required};
}

function setFieldError(field,message){
  field.error.textContent=message;
  field.error.hidden=!message;
  field.input.setAttribute('aria-invalid',message?'true':'false');
}

function clearFieldError(field){
  setFieldError(field,'');
}

function partyPreview(title,party){
  const block=el('section',{class:'invoice-party'});
  block.append(el('h3',{text:title}),el('strong',{text:party.name}));
  if(party.address)block.append(el('pre',{text:party.address}));
  const details=[];
  if(party.email)details.push(party.email);
  if(party.phone)details.push(party.phone);
  if(party.taxId)details.push((party.taxIdLabel||'Tax ID')+': '+party.taxId);
  if(details.length)block.append(el('p',{text:details.join(' · ')}));
  return block;
}

function validateEmail(field){
  const value=field.input.value.trim();
  if(value&&!field.input.validity.valid){
    setFieldError(field,'Enter a valid email address.');
    return false;
  }
  return true;
}

function validateRequired(field,message){
  if(!field.input.value.trim()){
    setFieldError(field,message||('Complete '+field.label.textContent.replace(' *','')+'.'));
    return false;
  }
  return true;
}

function validateNumber(field,{positive=false,min=0,max=Infinity,label='Value'}={}){
  const raw=field.input.value.trim();
  const value=Number(raw);
  if(!raw||!Number.isFinite(value)||(positive?value<=0:value<min)||value>max){
    let message=positive?label+' must be greater than zero.':label+' must be '+(Number.isFinite(max)?'between '+min+' and '+max+'.':'at least '+min+'.');
    setFieldError(field,message);
    return false;
  }
  return true;
}

function renderTotals(container,totals){
  container.replaceChildren();
  const list=el('dl',{class:'invoice-totals-list'});
  const add=(label,value,strong=false)=>{
    const row=el('div',{class:'invoice-total-row'+(strong?' invoice-total-final':'')});
    row.append(el('dt',{text:label}),el('dd',{text:formatMoney(value,totals.currency)}));
    list.append(row);
  };
  add('Subtotal',totals.subtotalMinor);
  if(totals.discountMinor)add('Discount',-totals.discountMinor);
  for(const tax of totals.taxSummary){
    if(tax.amountMinor)add(tax.name+' ('+tax.ratePercent+'%)',tax.amountMinor);
  }
  add('Total',totals.totalMinor,true);
  container.append(list);
}

function moneyWithSign(minor,currency){
  if(minor>=0)return formatMoney(minor,currency);
  return '−'+formatMoney(Math.abs(minor),currency);
}

export async function mount(root){
  root.classList.add('invoice-builder');
  const form=el('div',{class:'invoice-builder-form'});

  const businessSection=formSection('Business','Add the details the customer should see on the invoice.');
  const businessGrid=el('div',{class:'fields'});
  const businessName=makeField({id:'invoice-business-name',label:'Business or seller name',required:true,maxlength:200});
  const businessAddress=makeField({id:'invoice-business-address',label:'Business address',type:'textarea',full:true,maxlength:2000});
  const businessEmail=makeField({id:'invoice-business-email',label:'Email',type:'email',maxlength:254});
  const businessPhone=makeField({id:'invoice-business-phone',label:'Phone',type:'tel',maxlength:80});
  const businessTaxLabel=makeField({id:'invoice-business-tax-label',label:'Tax ID label',value:'Tax ID',maxlength:40,hint:'Examples: GSTIN, VAT ID, ABN, EIN.'});
  const businessTaxId=makeField({id:'invoice-business-tax-id',label:'Tax ID',maxlength:120});
  businessGrid.append(businessName.wrap,businessAddress.wrap,businessEmail.wrap,businessPhone.wrap,businessTaxLabel.wrap,businessTaxId.wrap);
  businessSection.append(businessGrid);

  const customerSection=formSection('Customer','Add the customer or organization being billed.');
  const customerGrid=el('div',{class:'fields'});
  const customerName=makeField({id:'invoice-customer-name',label:'Customer name',required:true,maxlength:200});
  const customerAddress=makeField({id:'invoice-customer-address',label:'Customer address',type:'textarea',full:true,maxlength:2000});
  const customerEmail=makeField({id:'invoice-customer-email',label:'Email',type:'email',maxlength:254});
  const customerPhone=makeField({id:'invoice-customer-phone',label:'Phone',type:'tel',maxlength:80});
  const customerTaxLabel=makeField({id:'invoice-customer-tax-label',label:'Tax ID label',value:'Tax ID',maxlength:40});
  const customerTaxId=makeField({id:'invoice-customer-tax-id',label:'Tax ID',maxlength:120});
  customerGrid.append(customerName.wrap,customerAddress.wrap,customerEmail.wrap,customerPhone.wrap,customerTaxLabel.wrap,customerTaxId.wrap);
  customerSection.append(customerGrid);

  const detailsSection=formSection('Invoice details');
  const detailsGrid=el('div',{class:'fields'});
  const invoiceNumber=makeField({id:'invoice-number',label:'Invoice number',value:createInvoiceNumber(),required:true,maxlength:80});
  const invoiceDate=makeField({id:'invoice-date',label:'Invoice date',type:'date',value:localDateISO(),required:true});
  const dueDate=makeField({id:'invoice-due-date',label:'Due date',type:'date'});
  const reference=makeField({id:'invoice-reference',label:'Reference / PO number',maxlength:120});
  const currencies=supportedCurrencyCodes();
  const defaultCurrency=currencies.includes('INR')?'INR':currencies.includes('USD')?'USD':currencies[0];
  const currency=makeField({id:'invoice-currency',label:'Currency',type:'select',value:defaultCurrency,required:true,options:currencies.map(code=>[code,code])});
  detailsGrid.append(invoiceNumber.wrap,invoiceDate.wrap,dueDate.wrap,reference.wrap,currency.wrap);
  detailsSection.append(detailsGrid);

  const itemsSection=formSection('Items','Add each product or service separately. Taxes can be set per item.');
  const itemList=el('div',{class:'invoice-items','aria-live':'polite'});
  const itemControls=el('div',{class:'actions invoice-item-actions'});
  const addItemButton=el('button',{type:'button',text:'Add item'});
  itemControls.append(addItemButton);
  itemsSection.append(itemList,itemControls);

  const totalsSection=formSection('Totals');
  const totalsGrid=el('div',{class:'fields'});
  const discount=makeField({id:'invoice-discount',label:'Invoice discount (%)',type:'number',value:'0',min:0,max:100,step:'0.01',inputmode:'decimal',hint:'Applied to line amounts before tax.'});
  totalsGrid.append(discount.wrap);
  const totalsOutput=el('div',{class:'invoice-totals-summary','aria-live':'polite'},[
    el('p',{class:'invoice-empty-total',text:'Create or update the invoice to calculate totals.'})
  ]);
  totalsSection.append(totalsGrid,totalsOutput);

  const termsSection=formSection('Terms and payment information');
  const termsGrid=el('div',{class:'fields'});
  const paymentTerms=makeField({id:'invoice-payment-terms',label:'Payment terms',value:'Due within 14 days',full:true,maxlength:500});
  const paymentInstructions=makeField({id:'invoice-payment-instructions',label:'Payment instructions',type:'textarea',full:true,maxlength:2000,hint:'Optional. Add only the payment details you want the customer to see.'});
  const notes=makeField({id:'invoice-notes',label:'Notes',type:'textarea',full:true,maxlength:2000});
  termsGrid.append(paymentTerms.wrap,paymentInstructions.wrap,notes.wrap);
  termsSection.append(termsGrid);

  form.append(businessSection,customerSection,detailsSection,itemsSection,totalsSection,termsSection);
  root.append(form);

  const itemEntries=[];
  function reindexItems(){
    itemEntries.forEach((entry,index)=>{
      entry.legend.textContent='Item '+(index+1);
      entry.removeButton.setAttribute('aria-label','Remove item '+(index+1));
      entry.removeButton.hidden=itemEntries.length===1;
    });
  }

  function addTax(entry,tax={name:'Tax',ratePercent:'0'}){
    const row=el('div',{class:'invoice-tax-row'});
    const taxName=makeField({id:uid('invoice-tax-name'),label:'Tax name',value:tax.name||'Tax',maxlength:40});
    const taxRate=makeField({id:uid('invoice-tax-rate'),label:'Tax rate (%)',type:'number',value:String(tax.ratePercent??'0'),min:0,max:100,step:'0.01',inputmode:'decimal'});
    const remove=el('button',{type:'button',class:'invoice-remove-tax',text:'Remove tax','aria-label':'Remove this tax'});
    row.append(taxName.wrap,taxRate.wrap,remove);
    const taxEntry={row,name:taxName,rate:taxRate,remove};
    entry.taxes.push(taxEntry);
    remove.addEventListener('click',()=>{
      const index=entry.taxes.indexOf(taxEntry);
      if(index>=0)entry.taxes.splice(index,1);
      row.remove();
      entry.addTaxButton.focus();
    });
    entry.taxList.append(row);
    return taxEntry;
  }

  function addItem(initial={}){
    const fieldset=el('fieldset',{class:'invoice-item-card'});
    const legend=el('legend',{text:'Item'});
    fieldset.append(legend);
    const grid=el('div',{class:'invoice-item-grid'});
    const description=makeField({id:uid('invoice-item-description'),label:'Description',type:'textarea',required:true,full:true,maxlength:2000});
    const quantity=makeField({id:uid('invoice-item-quantity'),label:'Quantity',type:'number',value:String(initial.quantity??'1'),required:true,min:'0.000001',step:'any',inputmode:'decimal'});
    const unit=makeField({id:uid('invoice-item-unit'),label:'Unit',value:initial.unit||'',maxlength:40,hint:'Optional: hour, item, kg, day…'});
    const rate=makeField({id:uid('invoice-item-rate'),label:'Unit rate',type:'number',value:String(initial.rate??'0'),required:true,min:'0',step:'any',inputmode:'decimal'});
    description.input.value=initial.description||'';
    grid.append(description.wrap,quantity.wrap,unit.wrap,rate.wrap);

    const taxBlock=el('div',{class:'invoice-item-taxes'});
    taxBlock.append(el('h3',{text:'Taxes'}));
    const taxList=el('div',{class:'invoice-tax-list'});
    const addTaxButton=el('button',{type:'button',text:'Add tax'});
    taxBlock.append(taxList,el('div',{class:'actions invoice-tax-actions'},[addTaxButton]));

    const removeButton=el('button',{type:'button',class:'invoice-remove-item',text:'Remove item'});
    const entry={fieldset,legend,description,quantity,unit,rate,taxes:[],taxList,addTaxButton,removeButton};
    itemEntries.push(entry);
    addTaxButton.addEventListener('click',()=>{const taxEntry=addTax(entry);taxEntry.name.input.focus()});
    removeButton.addEventListener('click',()=>{
      if(itemEntries.length===1)return;
      const index=itemEntries.indexOf(entry);
      const nextFocus=itemEntries[index+1]?.description.input||itemEntries[index-1]?.description.input||addItemButton;
      itemEntries.splice(index,1);
      fieldset.remove();
      reindexItems();
      nextFocus.focus();
    });
    for(const tax of initial.taxes||[{name:'Tax',ratePercent:'0'}])addTax(entry,tax);
    fieldset.append(grid,taxBlock,el('div',{class:'actions invoice-item-footer'},[removeButton]));
    itemList.append(fieldset);
    reindexItems();
    return entry;
  }

  addItem();
  addItemButton.addEventListener('click',()=>{const entry=addItem({taxes:[{name:'Tax',ratePercent:'0'}]});entry.description.input.focus()});

  const previewHeadingId='invoice-preview-heading';
  const invoice=el('article',{class:'invoice invoice-preview',hidden:true,tabindex:'-1','aria-labelledby':previewHeadingId});
  root.append(invoice);

  const allStaticFields=[
    businessName,businessAddress,businessEmail,businessPhone,businessTaxLabel,businessTaxId,
    customerName,customerAddress,customerEmail,customerPhone,customerTaxLabel,customerTaxId,
    invoiceNumber,invoiceDate,dueDate,reference,currency,discount,paymentTerms,paymentInstructions,notes
  ];

  function clearErrors(){
    for(const field of allStaticFields)clearFieldError(field);
    for(const item of itemEntries){
      for(const field of [item.description,item.quantity,item.unit,item.rate])clearFieldError(field);
      for(const tax of item.taxes){clearFieldError(tax.name);clearFieldError(tax.rate)}
    }
  }

  function focusFirstInvalid(){
    const invalid=root.querySelector('[aria-invalid="true"]');
    invalid?.focus();
  }

  function collectInvoice(){
    clearErrors();
    let valid=true;
    valid=validateRequired(businessName,'Enter the business or seller name.')&&valid;
    valid=validateRequired(customerName,'Enter the customer name.')&&valid;
    valid=validateRequired(invoiceNumber,'Enter an invoice number.')&&valid;
    valid=validateRequired(invoiceDate,'Choose an invoice date.')&&valid;
    valid=validateEmail(businessEmail)&&valid;
    valid=validateEmail(customerEmail)&&valid;

    if(dueDate.input.value&&invoiceDate.input.value&&dueDate.input.value<invoiceDate.input.value){
      setFieldError(dueDate,'Due date cannot be earlier than the invoice date.');
      valid=false;
    }

    valid=validateNumber(discount,{min:0,max:100,label:'Invoice discount'})&&valid;

    const items=[];
    for(const [index,item] of itemEntries.entries()){
      valid=validateRequired(item.description,'Enter a description for item '+(index+1)+'.')&&valid;
      valid=validateNumber(item.quantity,{positive:true,label:'Quantity'})&&valid;
      valid=validateNumber(item.rate,{min:0,label:'Unit rate'})&&valid;
      const taxes=[];
      for(const tax of item.taxes){
        const hasName=validateRequired(tax.name,'Enter a tax name.');
        const hasRate=validateNumber(tax.rate,{min:0,max:100,label:'Tax rate'});
        valid=hasName&&hasRate&&valid;
        if(hasName&&hasRate)taxes.push({name:tax.name.input.value.trim(),ratePercent:tax.rate.input.value.trim()});
      }
      items.push(createLineItem({
        id:item.fieldset.dataset.itemId||(item.fieldset.dataset.itemId=uid('invoice-line')),
        description:item.description.input.value.trim(),
        quantity:item.quantity.input.value.trim(),
        unit:item.unit.input.value.trim(),
        rate:item.rate.input.value.trim(),
        taxes
      }));
    }

    if(!valid){
      focusFirstInvalid();
      throw Error('Check the highlighted invoice fields and try again.');
    }

    return createInvoiceState({
      seller:{
        name:businessName.input.value.trim(),
        address:businessAddress.input.value.trim(),
        email:businessEmail.input.value.trim(),
        phone:businessPhone.input.value.trim(),
        taxIdLabel:businessTaxLabel.input.value.trim()||'Tax ID',
        taxId:businessTaxId.input.value.trim()
      },
      customer:{
        name:customerName.input.value.trim(),
        address:customerAddress.input.value.trim(),
        email:customerEmail.input.value.trim(),
        phone:customerPhone.input.value.trim(),
        taxIdLabel:customerTaxLabel.input.value.trim()||'Tax ID',
        taxId:customerTaxId.input.value.trim()
      },
      invoiceNumber:invoiceNumber.input.value.trim(),
      invoiceDate:invoiceDate.input.value,
      dueDate:dueDate.input.value,
      reference:reference.input.value.trim(),
      currency:currency.input.value,
      paymentTerms:paymentTerms.input.value.trim(),
      paymentInstructions:paymentInstructions.input.value.trim(),
      notes:notes.input.value.trim(),
      discountPercent:discount.input.value.trim(),
      items
    });
  }

  function renderInvoice(state,totals){
    invoice.replaceChildren();
    const header=el('header',{class:'invoice-preview-header'});
    const titleBlock=el('div');
    titleBlock.append(el('h2',{id:previewHeadingId,text:'INVOICE'}),el('p',{text:'#'+state.invoiceNumber}));
    const dates=el('dl',{class:'invoice-meta'});
    const addMeta=(label,value)=>{
      if(!value)return;
      const row=el('div');
      row.append(el('dt',{text:label}),el('dd',{text:value}));
      dates.append(row);
    };
    addMeta('Invoice date',state.invoiceDate);
    addMeta('Due date',state.dueDate);
    addMeta('Reference',state.reference);
    addMeta('Currency',state.currency);
    header.append(titleBlock,dates);

    const parties=el('div',{class:'invoice-parties'},[
      partyPreview('From',state.seller),
      partyPreview('Bill to',state.customer)
    ]);

    const tableWrap=el('div',{class:'invoice-table-wrap'});
    const table=el('table',{class:'invoice-line-table'});
    table.append(el('caption',{class:'sr-only',text:'Invoice line items'}));
    table.append(el('thead',{},el('tr',{},[
      el('th',{scope:'col',text:'Description'}),
      el('th',{scope:'col',text:'Quantity'}),
      el('th',{scope:'col',text:'Rate'}),
      el('th',{scope:'col',text:'Tax'}),
      el('th',{scope:'col',text:'Amount'})
    ])));
    const body=el('tbody');
    for(const line of totals.lines){
      const taxText=line.taxes.filter(t=>Number(t.ratePercent)!==0).map(t=>t.name+' '+t.ratePercent+'%').join(', ')||'—';
      const descriptionCell=el('td',{'data-label':'Description'});
      descriptionCell.append(el('strong',{text:line.description}));
      if(line.unit)descriptionCell.append(el('small',{text:'Unit: '+line.unit}));
      body.append(el('tr',{},[
        descriptionCell,
        el('td',{'data-label':'Quantity',text:line.quantity}),
        el('td',{'data-label':'Rate',text:formatUnitRate(line.rate,totals.currency)}),
        el('td',{'data-label':'Tax',text:taxText}),
        el('td',{'data-label':'Amount',text:formatMoney(line.totalMinor,totals.currency)})
      ]));
    }
    table.append(body);
    tableWrap.append(table);

    const summary=el('div',{class:'invoice-preview-summary'});
    const list=el('dl',{class:'invoice-totals-list'});
    const addTotal=(label,minor,strong=false)=>{
      const row=el('div',{class:'invoice-total-row'+(strong?' invoice-total-final':'')});
      row.append(el('dt',{text:label}),el('dd',{text:moneyWithSign(minor,totals.currency)}));
      list.append(row);
    };
    addTotal('Subtotal',totals.subtotalMinor);
    if(totals.discountMinor)addTotal('Discount',-totals.discountMinor);
    for(const tax of totals.taxSummary)if(tax.amountMinor)addTotal(tax.name+' ('+tax.ratePercent+'%)',tax.amountMinor);
    addTotal('Total due',totals.totalMinor,true);
    summary.append(list);

    const footer=el('div',{class:'invoice-preview-notes'});
    if(state.paymentTerms)footer.append(el('section',{},[el('h3',{text:'Payment terms'}),el('p',{text:state.paymentTerms})]));
    if(state.paymentInstructions)footer.append(el('section',{},[el('h3',{text:'Payment instructions'}),el('pre',{text:state.paymentInstructions})]));
    if(state.notes)footer.append(el('section',{},[el('h3',{text:'Notes'}),el('pre',{text:state.notes})]));

    invoice.append(header,parties,tableWrap,summary,footer);
    invoice.hidden=false;
    renderTotals(totalsOutput,totals);
    document.body.classList.add('print-invoice');
    status('Invoice preview updated.');
    invoice.focus();
  }

  const createButton=action('Create / update invoice',()=>{
    const state=collectInvoice();
    const totals=calculateInvoice(state);
    renderInvoice(state,totals);
  },true);

  const printButton=action('Print / Save PDF',()=>{
    if(invoice.hidden)throw Error('Create the invoice first.');
    window.print();
  });

  root.insertBefore(el('div',{class:'actions invoice-main-actions'},[createButton,printButton]),invoice);
  notice(root,'Your invoice is prepared locally in this browser. Optional tax ID fields are provided for flexibility; this tool does not claim compliance with any specific jurisdiction. Review the invoice before issuing it.');
  setupStatus(root);
}
