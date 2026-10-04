import { DISPLAY_FORMAT, ROUNDING_MODE, WEEK_START } from "./contracts.js";
import {
  createTask2State,
  setWeekStart,
  setWeekStartDate,
  setOvertimeThreshold,
  setRounding,
  setDisplayFormat,
  setDayIncluded,
  updatePeriod,
  appendPeriod,
  deletePeriod,
  getTask2ViewModel,
  MAX_PERIODS_PER_DAY,
} from "./task2-state.js";

function el(tag,attrs={},text=""){
  const node=document.createElement(tag);
  for(const [key,value] of Object.entries(attrs)){
    if(key==="className")node.className=value;
    else if(key==="dataset")Object.assign(node.dataset,value);
    else if(key in node && key!=="form")node[key]=value;
    else node.setAttribute(key,value);
  }
  if(text)node.textContent=text;
  return node;
}

function option(value,label=value){return el("option",{value},label)}

export function mountTimesheetTask2(root,options={}){
  if(!root||typeof document==="undefined")throw new Error("A DOM root is required.");

  let state=createTask2State(options.seed||{});
  root.replaceChildren();
  root.classList.add("tsv2-builder");

  const status=el("p",{className:"tsv2-status",role:"status","aria-live":"polite"});
  const settings=el("section",{className:"tsv2-settings","aria-labelledby":"tsv2-settings-heading"});
  settings.append(el("h2",{id:"tsv2-settings-heading"},"Week settings"));

  const weekDate=el("input",{id:"tsv2-week-date",type:"date"});
  const weekStart=el("select",{id:"tsv2-week-start"});
  weekStart.append(option(WEEK_START.MONDAY,"Monday"),option(WEEK_START.SUNDAY,"Sunday"));
  const threshold=el("input",{id:"tsv2-threshold",type:"number",min:"0",max:"168",step:"0.25",inputMode:"decimal"});
  const rounding=el("select",{id:"tsv2-rounding"});
  [
    [ROUNDING_MODE.NONE,"No rounding"],
    [ROUNDING_MODE.NEAREST_5,"Nearest 5 minutes"],
    [ROUNDING_MODE.NEAREST_6,"Nearest 6 minutes"],
    [ROUNDING_MODE.NEAREST_10,"Nearest 10 minutes"],
    [ROUNDING_MODE.NEAREST_15,"Nearest 15 minutes"],
  ].forEach(([value,label])=>rounding.append(option(String(value),label)));
  const format=el("select",{id:"tsv2-format"});
  format.append(option(DISPLAY_FORMAT.HOURS_MINUTES,"Hours & minutes"),option(DISPLAY_FORMAT.DECIMAL,"Decimal hours"));

  const field=(labelText,input,hint="")=>{
    const wrap=el("div",{className:"tsv2-field"});
    const label=el("label",{htmlFor:input.id},labelText);
    wrap.append(label,input);
    if(hint)wrap.append(el("small",{},hint));
    return wrap;
  };

  settings.append(
    field("Week starting",weekDate),
    field("Week starts on",weekStart),
    field("Weekly overtime threshold (hours)",threshold,"User-defined threshold only; no employment-law rules are applied."),
    field("Rounding",rounding,"Rounding is applied per period after unpaid break deduction."),
    field("Display format",format)
  );

  const daysWrap=el("section",{className:"tsv2-days","aria-label":"Weekly timesheet"});
  const summary=el("section",{className:"tsv2-summary","aria-labelledby":"tsv2-summary-heading"});
  summary.append(el("h2",{id:"tsv2-summary-heading"},"Weekly summary"));
  const summaryGrid=el("div",{className:"tsv2-summary-grid"});
  const regular=el("strong",{id:"tsv2-regular"},"0h 00m");
  const overtime=el("strong",{id:"tsv2-overtime"},"0h 00m");
  const total=el("strong",{id:"tsv2-total"},"0h 00m");
  [["Regular",regular],["Overtime",overtime],["Total",total]].forEach(([label,value])=>{
    const item=el("div",{className:"tsv2-summary-item"});
    item.append(el("small",{},label),value);
    summaryGrid.append(item);
  });
  summary.append(summaryGrid);

  root.append(settings,daysWrap,summary,status);

  function periodRow(dayIndex,periodIndex,period){
    const row=el("div",{className:"tsv2-period",dataset:{dayIndex:String(dayIndex),periodIndex:String(periodIndex)}});
    const title=el("div",{className:"tsv2-period-title"},`Period ${periodIndex+1}`);
    const start=el("input",{type:"time",value:period.start,"aria-label":`Day ${dayIndex+1} period ${periodIndex+1} start time`});
    const end=el("input",{type:"time",value:period.end,"aria-label":`Day ${dayIndex+1} period ${periodIndex+1} end time`});
    const br=el("input",{type:"number",min:"0",max:"1440",step:"1",inputMode:"numeric",value:String(period.unpaidBreakMinutes),"aria-label":`Day ${dayIndex+1} period ${periodIndex+1} unpaid break minutes`});
    const next=el("input",{type:"checkbox",checked:Boolean(period.nextDay),"aria-label":`Day ${dayIndex+1} period ${periodIndex+1} ends next day`});
    const nextLabel=el("label",{className:"tsv2-check"});
    nextLabel.append(next,document.createTextNode(" Ends next day"));
    const remove=el("button",{type:"button",className:"tsv2-remove"},"Remove");
    remove.disabled=state.days[dayIndex].periods.length<=1;

    const update=()=>{
      try{
        state=updatePeriod(state,dayIndex,periodIndex,{
          start:start.value,
          end:end.value,
          unpaidBreakMinutes:br.value,
          nextDay:next.checked,
        });
        refreshTotals();
        clearDayError(dayIndex);
      }catch(error){showDayError(dayIndex,error.message)}
    };
    [start,end,br,next].forEach(input=>input.addEventListener("input",update));
    remove.addEventListener("click",()=>{
      try{
        state=deletePeriod(state,dayIndex,periodIndex);
        renderDays();
        refreshTotals();
      }catch(error){showDayError(dayIndex,error.message)}
    });

    const grid=el("div",{className:"tsv2-period-grid"});
    grid.append(field("Start",start),field("End",end),field("Unpaid break (min)",br),nextLabel);
    row.append(title,grid,remove);
    return row;
  }

  function showDayError(index,message){
    const node=daysWrap.querySelector(`[data-day-error="${index}"]`);
    if(node){node.textContent=message;node.hidden=false}
  }
  function clearDayError(index){
    const node=daysWrap.querySelector(`[data-day-error="${index}"]`);
    if(node){node.textContent="";node.hidden=true}
  }

  function renderDays(){
    daysWrap.replaceChildren();
    state.days.forEach((day,dayIndex)=>{
      const card=el("article",{className:"tsv2-day",dataset:{dayIndex:String(dayIndex)}});
      const head=el("div",{className:"tsv2-day-head"});
      const heading=el("h3",{},`${day.name} · ${day.date}`);
      const include=el("input",{type:"checkbox",checked:day.included,"aria-label":`Include ${day.name}`});
      const includeLabel=el("label",{className:"tsv2-check"});
      includeLabel.append(include,document.createTextNode(" Include"));
      head.append(heading,includeLabel);

      const periods=el("div",{className:"tsv2-periods"});
      day.periods.forEach((period,periodIndex)=>periods.append(periodRow(dayIndex,periodIndex,period)));

      const add=el("button",{type:"button",className:"tsv2-add"},"Add work period");
      add.disabled=day.periods.length>=MAX_PERIODS_PER_DAY;
      const daily=el("div",{className:"tsv2-daily-total"});
      daily.append(el("span",{},"Worked"),el("strong",{dataset:{dayTotal:String(dayIndex)}},"0h 00m"));
      const error=el("p",{className:"tsv2-day-error",role:"alert",dataset:{dayError:String(dayIndex)},hidden:true});

      include.addEventListener("change",()=>{
        state=setDayIncluded(state,dayIndex,include.checked);
        periods.hidden=!include.checked;
        add.hidden=!include.checked;
        refreshTotals();
      });
      add.addEventListener("click",()=>{
        try{
          state=appendPeriod(state,dayIndex);
          renderDays();
          refreshTotals();
        }catch(error){showDayError(dayIndex,error.message)}
      });

      periods.hidden=!day.included;
      add.hidden=!day.included;
      card.append(head,periods,add,daily,error);
      daysWrap.append(card);
    });
  }

  function syncSettings(){
    weekDate.value=state.weekStartDate;
    weekStart.value=state.weekStart;
    threshold.value=String(state.overtimeThresholdHours);
    rounding.value=String(state.roundingMinutes);
    format.value=state.displayFormat;
  }

  function refreshTotals(){
    try{
      const view=getTask2ViewModel(state);
      view.days.forEach((day,index)=>{
        const target=daysWrap.querySelector(`[data-day-total="${index}"]`);
        if(target)target.textContent=day.displayTotal;
        clearDayError(index);
      });
      regular.textContent=view.totals.displayRegular;
      overtime.textContent=view.totals.displayOvertime;
      total.textContent=view.totals.displayTotal;
      status.textContent="Timesheet totals updated.";
      status.classList.remove("error");
    }catch(error){
      status.textContent=error.message;
      status.classList.add("error");
      const match=String(error.message).match(/on (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/);
      if(match){
        const index=state.days.findIndex(day=>day.name===match[1]);
        if(index>=0)showDayError(index,error.message);
      }
    }
  }

  weekDate.addEventListener("change",()=>{
    try{state=setWeekStartDate(state,weekDate.value);renderDays();syncSettings();refreshTotals()}catch(error){status.textContent=error.message;status.classList.add("error")}
  });
  weekStart.addEventListener("change",()=>{
    try{state=setWeekStart(state,weekStart.value);renderDays();syncSettings();refreshTotals()}catch(error){status.textContent=error.message;status.classList.add("error")}
  });
  threshold.addEventListener("input",()=>{state=setOvertimeThreshold(state,threshold.value);refreshTotals()});
  rounding.addEventListener("change",()=>{state=setRounding(state,rounding.value);refreshTotals()});
  format.addEventListener("change",()=>{state=setDisplayFormat(state,format.value);refreshTotals()});

  renderDays();
  syncSettings();
  refreshTotals();

  return {
    getState:()=>state,
    getViewModel:()=>getTask2ViewModel(state),
    rerender:()=>{renderDays();syncSettings();refreshTotals()},
  };
}
