import {el,action,notice,setupStatus,status} from './core.js';
import {
  supportedCurrencyCodes,
  calculateFreelanceRate,
  formatMoney
} from './freelance-rate-engine.js';

function section(title,description){
  const block=el('section',{class:'freelance-rate-section'});
  block.append(el('h2',{text:title}));
  if(description)block.append(el('p',{class:'freelance-rate-section-help',text:description}));
  return block;
}

function makeField({
  id,label,type='number',value='',required=true,options=[],
  hint='',min,max,step='any',inputmode='decimal'
}){
  const wrap=el('div',{class:'field freelance-rate-field'});
  const labelEl=el('label',{for:id,text:label+(required?' *':'')});
  let input;
  if(type==='select'){
    input=el('select',{id,name:id,...(required?{required:true,'aria-required':'true'}:{})});
    for(const option of options){
      const pair=Array.isArray(option)?option:[option,option];
      input.append(el('option',{value:pair[0],text:pair[1]}));
    }
    input.value=String(value);
    for(const option of input.options)option.defaultSelected=option.value===String(value);
  }else{
    const attrs={id,name:id,type};
    if(required){attrs.required=true;attrs['aria-required']='true'}
    if(min!=null)attrs.min=min;
    if(max!=null)attrs.max=max;
    if(step!=null)attrs.step=step;
    if(inputmode)attrs.inputmode=inputmode;
    input=el('input',attrs);
    input.value=String(value);
    input.defaultValue=String(value);
  }

  const described=[];
  wrap.append(labelEl,input);
  if(hint){
    const hintId=id+'-hint';
    wrap.append(el('small',{id:hintId,class:'freelance-rate-field-hint',text:hint}));
    described.push(hintId);
  }
  const errorId=id+'-error';
  const error=el('small',{id:errorId,class:'freelance-rate-field-error',hidden:true,'aria-live':'polite'});
  wrap.append(error);
  described.push(errorId);
  input.setAttribute('aria-describedby',described.join(' '));
  return {wrap,input,error,label:labelEl,id};
}

function setFieldError(field,message=''){
  field.error.textContent=message;
  field.error.hidden=!message;
  field.input.setAttribute('aria-invalid',message?'true':'false');
}

function validateNumber(field,{label,min,max,positive=false}){
  const raw=field.input.value.trim();
  const value=Number(raw);
  let message='';
  if(!raw||!Number.isFinite(value))message='Enter a valid '+label.toLowerCase()+'.';
  else if(positive&&value<=0)message=label+' must be greater than zero.';
  else if(min!=null&&value<min)message=label+' must be at least '+min+'.';
  else if(max!=null&&value>max)message=label+' must be at most '+max+'.';
  setFieldError(field,message);
  return !message;
}

function validateSelect(field,label){
  const valid=Boolean(field.input.value);
  setFieldError(field,valid?'':'Choose a '+label.toLowerCase()+'.');
  return valid;
}

function formatHours(value){
  return new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(value)+' h';
}

function resultCard(label,value,emphasis=false){
  return el('div',{class:'freelance-rate-result-card'+(emphasis?' emphasis':'')},[
    el('small',{text:label}),
    el('strong',{text:value})
  ]);
}

function breakdownRow(label,value){
  const row=el('div',{class:'freelance-rate-breakdown-row'});
  row.append(el('dt',{text:label}),el('dd',{text:value}));
  return row;
}

export async function mount(root){
  root.classList.add('freelance-rate-builder');

  const form=el('div',{class:'freelance-rate-form'});

  const incomeSection=section(
    '1. Income goal',
    'Start with the personal income you want available after the planning tax reserve you enter below.'
  );
  const incomeGrid=el('div',{class:'fields'});
  const currencies=supportedCurrencyCodes();
  const currency=makeField({
    id:'freelance-currency',label:'Currency',type:'select',value:'USD',
    options:currencies.map(code=>[code,code]),
    hint:'Currency affects formatting only. No exchange-rate conversion is performed.'
  });
  const targetIncome=makeField({
    id:'freelance-target-income',label:'Desired personal income',value:'5000',min:'0',
    hint:'The personal income you want available after your planning tax reserve.'
  });
  const incomePeriod=makeField({
    id:'freelance-income-period',label:'Income period',type:'select',value:'monthly',
    options:[['monthly','Monthly'],['annual','Annual']]
  });
  incomeGrid.append(currency.wrap,targetIncome.wrap,incomePeriod.wrap);
  incomeSection.append(incomeGrid);

  const costsSection=section(
    '2. Business costs and reserves',
    'Include recurring freelance costs and planning reserves so the rate does not assume every earned unit is take-home income.'
  );
  const costsGrid=el('div',{class:'fields'});
  const expenses=makeField({
    id:'freelance-expenses',label:'Business expenses',value:'500',min:'0',
    hint:'Examples: software, equipment, insurance, accounting, marketing and workspace costs.'
  });
  const expensePeriod=makeField({
    id:'freelance-expense-period',label:'Expense period',type:'select',value:'monthly',
    options:[['monthly','Monthly'],['annual','Annual']]
  });
  const taxReserve=makeField({
    id:'freelance-tax-reserve',label:'Tax planning reserve (%)',value:'20',min:'0',max:'95',
    hint:'A planning percentage only—not a country-specific tax calculation or tax advice.'
  });
  const contingency=makeField({
    id:'freelance-contingency',label:'Contingency / profit buffer (%)',value:'10',min:'0',max:'100',
    hint:'Optional buffer above the minimum revenue requirement for uncertainty, growth or profit.'
  });
  costsGrid.append(expenses.wrap,expensePeriod.wrap,taxReserve.wrap,contingency.wrap);
  costsSection.append(costsGrid);

  const capacitySection=section(
    '3. Working capacity',
    'Use realistic annual availability rather than assuming all 52 weeks are available for client work.'
  );
  const capacityGrid=el('div',{class:'fields'});
  const weeks=makeField({
    id:'freelance-working-weeks',label:'Working weeks per year',value:'48',min:'1',max:'52',
    hint:'Reduce this for holidays, sickness, training or other planned time away.'
  });
  const weeklyHours=makeField({
    id:'freelance-weekly-hours',label:'Total working hours per week',value:'40',min:'0.1',max:'168',
    hint:'Include both client work and non-billable business work.'
  });
  const clientDayHours=makeField({
    id:'freelance-client-day-hours',label:'Billable hours in a client day',value:'8',min:'0.1',max:'24',
    hint:'Used only to convert the hourly rate into a client day rate.'
  });
  capacityGrid.append(weeks.wrap,weeklyHours.wrap,clientDayHours.wrap);
  capacitySection.append(capacityGrid);

  const billableSection=section(
    '4. Billable time',
    'Freelancers also spend time on proposals, administration, marketing, bookkeeping and learning. Only the billable share can normally be charged to clients.'
  );
  const billableGrid=el('div',{class:'fields'});
  const billable=makeField({
    id:'freelance-billable',label:'Billable share of working time (%)',value:'60',min:'1',max:'100',
    hint:'For example, 60% means 60 of every 100 working hours are expected to be client-billable.'
  });
  billableGrid.append(billable.wrap);
  billableSection.append(billableGrid);

  form.append(incomeSection,costsSection,capacitySection,billableSection);
  root.append(form);

  const resultTitleId='freelance-rate-result-title';
  const result=el('section',{
    id:'freelance-rate-result',class:'result-panel freelance-rate-result',hidden:true,
    tabindex:'-1','aria-labelledby':resultTitleId
  });
  root.append(result);

  const fields=[
    currency,targetIncome,incomePeriod,expenses,expensePeriod,
    taxReserve,contingency,weeks,weeklyHours,clientDayHours,billable
  ];

  function clearErrors(){
    for(const field of fields)setFieldError(field);
  }

  function validate(){
    clearErrors();
    let valid=true;
    valid=validateSelect(currency,'Currency')&&valid;
    valid=validateNumber(targetIncome,{label:'Desired personal income',positive:true})&&valid;
    valid=validateSelect(incomePeriod,'Income period')&&valid;
    valid=validateNumber(expenses,{label:'Business expenses',min:0})&&valid;
    valid=validateSelect(expensePeriod,'Expense period')&&valid;
    valid=validateNumber(taxReserve,{label:'Tax planning reserve',min:0,max:95})&&valid;
    valid=validateNumber(contingency,{label:'Contingency / profit buffer',min:0,max:100})&&valid;
    valid=validateNumber(weeks,{label:'Working weeks per year',min:1,max:52})&&valid;
    valid=validateNumber(weeklyHours,{label:'Total working hours per week',min:0.1,max:168})&&valid;
    valid=validateNumber(clientDayHours,{label:'Billable hours in a client day',min:0.1,max:24})&&valid;
    valid=validateNumber(billable,{label:'Billable share of working time',min:1,max:100})&&valid;
    if(!valid){
      const first=root.querySelector('[aria-invalid="true"]');
      if(first)setTimeout(()=>first.focus(),0);
      throw Error('Check the highlighted rate-planning fields and try again.');
    }
  }

  function calculate(){
    validate();
    const estimate=calculateFreelanceRate({
      currency:currency.input.value,
      targetPersonalIncome:targetIncome.input.value,
      incomePeriod:incomePeriod.input.value,
      businessExpenses:expenses.input.value,
      expensePeriod:expensePeriod.input.value,
      taxReservePercent:taxReserve.input.value,
      contingencyPercent:contingency.input.value,
      workingWeeksPerYear:weeks.input.value,
      weeklyHours:weeklyHours.input.value,
      billablePercent:billable.input.value,
      clientDayHours:clientDayHours.input.value
    });

    const money=minor=>formatMoney(minor,estimate.currency);
    const buffer=Number(contingency.input.value);
    const dayHours=Number(clientDayHours.input.value);

    result.replaceChildren();
    result.append(
      el('h2',{id:resultTitleId,text:'Your freelance rate estimate'}),
      el('p',{
        class:'freelance-rate-result-intro',
        text:'The minimum rate covers the income goal, planning tax reserve and business expenses at your estimated billable capacity. The recommended rate adds your contingency / profit buffer.'
      })
    );

    const cards=el('div',{class:'freelance-rate-results-grid'});
    cards.append(
      resultCard('Minimum sustainable hourly rate',money(estimate.minimumHourlyRateMinor)),
      resultCard('Recommended hourly rate',money(estimate.recommendedHourlyRateMinor),true),
      resultCard('Recommended client day rate ('+new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(dayHours)+' billable h)',money(estimate.recommendedClientDayRateMinor)),
      resultCard('Annual billable hours',formatHours(estimate.annualBillableHours))
    );
    result.append(cards);

    const breakdown=el('section',{class:'freelance-rate-breakdown'});
    breakdown.append(el('h3',{text:'How the estimate was built'}));
    const list=el('dl');
    list.append(
      breakdownRow('Personal income goal (annual)',money(estimate.targetPersonalIncomeAnnualMinor)),
      breakdownRow('Personal income required before tax reserve',money(estimate.grossPersonalIncomeAnnualMinor)),
      breakdownRow('Business expenses (annual)',money(estimate.businessExpensesAnnualMinor)),
      breakdownRow('Minimum annual revenue required',money(estimate.minimumRevenueAnnualMinor)),
      breakdownRow('Recommended annual revenue with '+new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(buffer)+'% buffer',money(estimate.recommendedRevenueAnnualMinor)),
      breakdownRow('Annual working capacity',formatHours(estimate.annualAvailableHours)),
      breakdownRow('Annual billable capacity',formatHours(estimate.annualBillableHours))
    );
    breakdown.append(list);
    result.append(breakdown);

    result.append(el('p',{
      class:'freelance-rate-disclaimer',
      text:'Planning estimate only. Tax rules, benefits, payment fees, bad debt, market demand and local legal requirements vary. The tax reserve is a user-entered planning assumption, not tax advice.'
    }));

    result.hidden=false;
    status('Freelance rate estimate updated.');
    setTimeout(()=>result.focus(),0);
  }

  function reset(){
    for(const field of fields){
      if(field.input.tagName==='SELECT'){
        const selected=[...field.input.options].find(option=>option.defaultSelected);
        if(selected)field.input.value=selected.value;
      }else{
        field.input.value=field.input.defaultValue;
      }
      setFieldError(field);
    }
    result.hidden=true;
    result.replaceChildren();
    status('Rate-planning inputs reset.');
    setTimeout(()=>currency.input.focus(),0);
  }

  root.insertBefore(el('div',{class:'actions freelance-rate-actions'},[
    action('Calculate freelance rate',calculate,true),
    action('Reset',reset)
  ]),result);

  notice(
    root,
    'This calculator runs locally in your browser. It estimates a sustainable freelance rate from the assumptions you enter and does not send your financial inputs to a server.'
  );
  setupStatus(root);
}
