import {$,el,notice,setupStatus,status} from '../../assets/js/core.js';
const root=$('#workspace');if(!root)throw Error('Age & Date workspace unavailable.');
const DAY=86400000;
function pad(n){return n<10?'0'+n:String(n)}
function leap(y){return y%4===0&&(y%100!==0||y%400===0)}
function dim(y,m){return [31,leap(y)?29:28,31,30,31,30,31,31,30,31,30,31][m-1]}
function parse(s){const a=String(s).split('-').map(Number);if(a.length!==3||!Number.isInteger(a[0])||a[0]<1||a[0]>9999||a[1]<1||a[1]>12||a[2]<1||a[2]>dim(a[0],a[1]))return null;return{y:a[0],m:a[1],d:a[2]}}
function utcDate(d){const x=new Date(0);x.setUTCFullYear(d.y,d.m-1,d.d);x.setUTCHours(0,0,0,0);return x}
function serial(d){return Math.floor(utcDate(d).getTime()/DAY)}
function cmp(a,b){return serial(a)-serial(b)}
function fmt(d){return d.y+'-'+pad(d.m)+'-'+pad(d.d)}
function unit(n,name){return n+' '+name+(n===1?'':'s')}
function ageText(e){return unit(e.y,'year')+', '+unit(e.m,'month')+', '+unit(e.d,'day')}
function pretty(d){return new Intl.DateTimeFormat(undefined,{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}).format(utcDate(d))}
function weekday(d){return new Intl.DateTimeFormat(undefined,{weekday:'long',timeZone:'UTC'}).format(utcDate(d))}
function fromSerial(n){const x=new Date(n*DAY);return{y:x.getUTCFullYear(),m:x.getUTCMonth()+1,d:x.getUTCDate()}}
function addDays(d,n){const r=fromSerial(serial(d)+n);if(r.y<1||r.y>9999)throw Error('date range');return r}
function addMonths(d,n){const total=d.y*12+(d.m-1)+n,y=Math.floor(total/12),m=total-y*12+1;if(y<1||y>9999)throw Error('date range');return{y:y,m:m,d:Math.min(d.d,dim(y,m))}}
function addYears(d,n){const y=d.y+n;if(y<1||y>9999)throw Error('date range');return{y:y,m:d.m,d:Math.min(d.d,dim(y,d.m))}}
function ageAnniversary(birth,y,rule){return anniversary(birth,y,rule)}
function exactAge(a,b,rule){if(cmp(a,b)>0)return null;let y=b.y-a.y,anchor=ageAnniversary(a,a.y+y,rule);if(cmp(anchor,b)>0){y--;anchor=ageAnniversary(a,a.y+y,rule)}let m=(b.y-anchor.y)*12+(b.m-anchor.m),monthAnchor=addMonths(anchor,m);if(cmp(monthAnchor,b)>0){m--;monthAnchor=addMonths(anchor,m)}return{y:y,m:m,d:cmp(b,monthAnchor)}}
function anniversary(birth,y,rule){if(birth.m===2&&birth.d===29&&!leap(y))return rule==='feb28'?{y:y,m:2,d:28}:{y:y,m:3,d:1};return{y:y,m:birth.m,d:birth.d}}
function nextBirthday(birth,asof,rule){let n=anniversary(birth,asof.y,rule);if(cmp(n,asof)<0)n=anniversary(birth,asof.y+1,rule);return n}
function totalMonths(a,b){let n=(b.y-a.y)*12+(b.m-a.m);let anchor=addMonths(a,n);if(cmp(anchor,b)>0)n--;return n}
const style=el('style',{text:'.ad-task{max-width:560px;margin:0 auto 22px}.ad-task label{font-weight:700}.ad-task select{width:100%;min-height:48px;margin-top:7px}.ad-tabs{display:none}.ad-tabs button{min-height:44px}.ad-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.ad-full{grid-column:1/-1}.ad-results{margin-top:20px}.ad-rule-help{display:block;margin-top:6px;font-size:12px;line-height:1.45;color:var(--muted)}.ad-rule-field select{display:block;width:100%;margin-top:6px}.ad-note{font-size:13px;color:var(--muted);padding:12px;border:1px solid var(--line);border-radius:8px}.ad-results strong{overflow-wrap:anywhere}.ad-convention{display:flex;flex-direction:column;gap:8px}.ad-convention label{display:block;margin:0}.ad-convention select{display:block;width:100%;max-width:100%;min-height:44px;white-space:normal}@media(max-width:700px){.ad-grid{grid-template-columns:1fr}.ad-full{grid-column:auto}.ad-tabs button{flex:1 1 145px}.actions button{width:100%}input,select{font-size:16px}}'});root.prepend(style);
const chooser=el('div',{class:'field ad-task'}),task=el('select',{'aria-label':'What do you want to calculate?'}),form=el('div',{class:'ad-grid'}),results=el('section',{class:'ad-results','aria-live':'polite'});
const modes=[['age','My exact age'],['ondate','My age on another date'],['birthday','My next birthday'],['difference','Difference between two dates'],['adjust','Add or subtract from a date'],['weekday','Weekday and leap-year check']];modes.forEach(([v,l])=>task.append(el('option',{value:v,text:l})));chooser.append(el('label',{text:'What do you want to calculate?'}),task);root.append(chooser,form,results);let mode='age';
const dateInput=v=>el('input',{type:'date',value:v,min:'0001-01-01',max:'9999-12-31'});
const numberInput=v=>el('input',{type:'number',value:String(v),min:'0',max:'1000000',step:'1',inputmode:'numeric'});
const field=(label,c,full,extra)=>{const w=el('div',{class:'field'+(full?' ad-full':'')+(extra?' '+extra:'')});c.setAttribute('aria-label',label);w.append(el('label',{text:label}),c);return w};
function todayLocal(){const x=new Date();return{y:x.getFullYear(),m:x.getMonth()+1,d:x.getDate()}}
function todayString(){return fmt(todayLocal())}
function result(items,note){results.replaceChildren(el('h2',{text:'Result'}));const g=el('div',{class:'result-grid'});items.forEach(i=>g.append(el('div',{class:'result-item'},[el('small',{text:i[0]}),el('strong',{text:i[1]})])));results.append(g);if(note)results.append(el('div',{class:'ad-note',text:note}));status('Calculated. Dates are treated as calendar dates, not times of day.')}
function fail(s){results.replaceChildren();status(s,true)}
function render(){
 form.replaceChildren();results.replaceChildren();
 const today=todayString();
 if(mode==='age'||mode==='ondate'||mode==='birthday'){
  const birth=dateInput('2000-01-01'),asof=dateInput(today),rule=el('select');rule.append(el('option',{value:'mar1',text:'March 1'}),el('option',{value:'feb28',text:'February 28'}));
  form.append(field('Date of birth',birth),field(mode==='birthday'?'From date':'Calculate age on',asof));
  const ruleField=field('Feb 29 birthday convention',rule,true);ruleField.classList.add('ad-rule-field');ruleField.append(el('small',{class:'ad-rule-help',text:'For Feb 29 birthdays, choose the anniversary date used in non-leap years: March 1 or February 28.'}));const syncRule=()=>{const b=parse(birth.value);ruleField.hidden=!(b&&b.m===2&&b.d===29)};birth.addEventListener('change',syncRule);birth.addEventListener('input',syncRule);form.append(ruleField);syncRule();
  const calc=()=>{const b=parse(birth.value),a=parse(asof.value);if(!b||!a){fail('Enter valid calendar dates.');return}if(cmp(b,a)>0){fail('Date of birth cannot be after the calculation date.');return}
   if(mode==='birthday'){const n=nextBirthday(b,a,rule.value),days=cmp(n,a);result([['Next birthday',pretty(n)],['Weekday',weekday(n)],['Days until birthday',String(days)],['Age turning',String(n.y-b.y)]],b.m===2&&b.d===29?'For Feb 29 birthdays, the selected non-leap-year convention is used explicitly.':'A birthday occurring on the selected from-date is shown as 0 days away.');return}
   const e=exactAge(b,a,rule.value),days=cmp(a,b),months=totalMonths(b,a),febNote=b.m===2&&b.d===29?' For Feb 29 births, completed years and the years/months/days breakdown use the selected non-leap-year anniversary convention.':'';result([['Exact age',ageText(e)],['Total completed years',String(e.y)],['Total completed months',String(months)],['Total weeks',Math.floor(days/7).toLocaleString()],['Total days',days.toLocaleString()],['Day of birth',weekday(b)]],'Totals are elapsed units. Total months uses completed calendar-month periods from the original birth date; total weeks shows completed 7-day periods; total days excludes the birth date and counts elapsed date boundaries.'+febNote);
  };form.append(el('div',{class:'actions ad-full'},[el('button',{type:'button',class:'primary',text:'Calculate',onclick:calc})]));
 }else if(mode==='difference'){
  const a=dateInput(today),b=dateInput(today);form.append(field('Start date',a),field('End date',b));const calc=()=>{const x=parse(a.value),y=parse(b.value);if(!x||!y){fail('Enter valid calendar dates.');return}const signed=cmp(y,x),abs=Math.abs(signed),lo=signed>=0?x:y,hi=signed>=0?y:x,e=exactAge(lo,hi,'feb28');result([['Direction',signed===0?'Same date':signed>0?'End is after start':'End is before start'],['Calendar difference',ageText(e)],['Exclusive / elapsed days',abs.toLocaleString()],['Inclusive calendar days',(abs+1).toLocaleString()],['Completed weeks',Math.floor(abs/7).toLocaleString()],['Remaining days after weeks',String(abs%7)]],'Exclusive/elapsed days counts date boundaries crossed. Inclusive calendar days counts both the start and end dates; therefore equal dates are 0 elapsed days but 1 inclusive calendar day.');};form.append(el('div',{class:'actions ad-full'},[el('button',{type:'button',class:'primary',text:'Calculate',onclick:calc})]));
 }else if(mode==='adjust'){
  const base=dateInput(today),op=el('select');op.append(el('option',{value:'add',text:'Add'}),el('option',{value:'sub',text:'Subtract'}));const years=numberInput(0),months=numberInput(0),days=numberInput(0);form.append(field('Starting date',base),field('Operation',op),field('Years',years),field('Months',months),field('Days',days));const calc=()=>{let d=parse(base.value);const ys=Number(years.value),ms=Number(months.value),ds=Number(days.value);if(!d||![ys,ms,ds].every(Number.isInteger)||[ys,ms,ds].some(v=>v<0||v>1000000)){fail('Enter a valid date and whole-number adjustments from 0 to 1,000,000.');return}const sign=op.value==='add'?1:-1;try{d=addYears(d,sign*ys);d=addMonths(d,sign*ms);d=addDays(d,sign*ds)}catch(e){fail('That adjustment is outside the supported calendar range.');return}if(d.y<1||d.y>9999){fail('Result must stay between year 1 and 9999.');return}result([['Adjusted date',pretty(d)],['ISO date',fmt(d)],['Weekday',weekday(d)],['Leap year',leap(d.y)?'Yes':'No']], 'Adjustments are applied in this order: years, then months, then days. If a month/year step lands on a month without the original day (for example Jan 31 + 1 month), it clamps to that month’s final valid day.');};form.append(el('div',{class:'actions ad-full'},[el('button',{type:'button',class:'primary',text:'Calculate',onclick:calc})]));
 }else{
  const d=dateInput(today);form.append(field('Date',d,true));const calc=()=>{const x=parse(d.value);if(!x){fail('Enter a valid calendar date.');return}result([['Date',pretty(x)],['Weekday',weekday(x)],['Leap year',leap(x.y)?'Yes':'No'],['Days in month',String(dim(x.y,x.m))]],'Gregorian calendar rules are used: years divisible by 4 are leap years except century years, unless divisible by 400.');};form.append(el('div',{class:'actions ad-full'},[el('button',{type:'button',class:'primary',text:'Calculate',onclick:calc})]));
 }
}
task.addEventListener('change',()=>{mode=task.value;render()});
setupStatus(root);notice(root,'All calculations use calendar dates only. Time of day, time zone and daylight-saving transitions are intentionally excluded. Date differences show both elapsed/exclusive days and inclusive calendar-day counts.');render();
