import {el,field,read,num,format,action,notice,setupStatus,status} from './core.js';
import {calculateCurrentMonthlyEstimate} from './freelance-rate-engine.js';

export async function mount(root){
  const form=el('div',{class:'fields'});
  const result=el('div',{id:'result',class:'result-panel',hidden:true});
  root.append(form);

  const add=(id,label,type='number',value='',opts={})=>form.append(field(id,label,type,value,opts));
  add('income','Desired monthly income','number',50000);
  add('costs','Monthly business costs','number',5000);
  add('days','Working days per month','number',22,{min:1,max:31});
  add('hours','Hours per working day','number',8,{min:.1,max:24});
  add('billable','Billable share of working time (%)','number',60,{min:1,max:100});

  const display=items=>{
    result.hidden=false;
    result.replaceChildren(el('h2',{text:'Your result'}));
    const grid=el('div',{class:'result-grid'});
    for(const [label,value] of Object.entries(items)){
      grid.append(el('div',{class:'result-item'},[
        el('small',{text:label}),
        el('strong',{text:typeof value==='number'?format(value):value})
      ]));
    }
    result.append(grid);
  };

  const calculate=()=>{
    num('income');
    num('costs');
    num('days',{min:1,max:31});
    num('hours',{min:.1,max:24});
    num('billable',{min:1,max:100});
    const estimate=calculateCurrentMonthlyEstimate({
      monthlyIncome:read('income'),
      monthlyCosts:read('costs'),
      workingDaysPerMonth:read('days'),
      hoursPerWorkingDay:read('hours'),
      billablePercent:read('billable')
    });
    display({
      'Estimated hourly rate':estimate.hourlyRate,
      'Estimated daily rate':estimate.dailyRate,
      'Billable hours per month':estimate.billableHoursPerMonth
    });
  };

  const reset=()=>{
    for(const input of form.querySelectorAll('input')){
      input.value=input.defaultValue;
    }
    result.hidden=true;
    status('Inputs reset.');
  };

  root.append(el('div',{class:'actions'},[
    action('Calculate',calculate,true),
    action('Reset',reset)
  ]),result);

  notice(root,'An estimate before income taxes. Billable share accounts for administration and unpaid time. Daily rate assumes every hour of that client day is billable.');
  setupStatus(root);
}
