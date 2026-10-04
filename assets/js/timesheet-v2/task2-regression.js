import { WEEK_START, DISPLAY_FORMAT } from "./contracts.js";
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
} from "./task2-state.js";

const assert=(condition,message)=>{if(!condition)throw new Error(message);};

export function runTask2Regression(){
  let state=createTask2State({weekStartDate:"2026-10-05",weekStart:WEEK_START.MONDAY});
  assert(state.days.length===7,"Builder state must contain seven days.");

  state=setWeekStart(state,WEEK_START.SUNDAY);
  assert(state.weekStartDate==="2026-10-04","Sunday week-start conversion failed.");
  assert(state.days[0].name==="Sunday","Sunday should be first day.");

  state=setWeekStartDate(state,"2026-10-11");
  assert(state.weekStartDate==="2026-10-11","Explicit week date should persist.");

  state=setWeekStart(state,WEEK_START.MONDAY);
  assert(state.weekStartDate==="2026-10-05","Switching back to Monday should normalize the same week.");

  state=updatePeriod(state,0,0,{start:"08:00",end:"12:00",unpaidBreakMinutes:0,nextDay:false});
  state=appendPeriod(state,0);
  state=updatePeriod(state,0,1,{start:"13:00",end:"17:00",unpaidBreakMinutes:0,nextDay:false});
  let view=getTask2ViewModel(state);
  assert(view.days[0].result.totalMinutes===480,"Split day should total eight hours.");
  assert(view.days[0].displayTotal==="8h 00m","Hours/minutes display failed.");

  state=setDisplayFormat(state,DISPLAY_FORMAT.DECIMAL);
  view=getTask2ViewModel(state);
  assert(view.days[0].displayTotal==="8 h","Decimal display failed.");

  state=setOvertimeThreshold(state,35);
  assert(state.overtimeThresholdHours===35,"Overtime threshold update failed.");

  state=setRounding(state,15);
  assert(state.roundingMinutes===15,"Rounding update failed.");

  state=setDayIncluded(state,1,false);
  assert(state.days[1].included===false,"Include toggle update failed.");

  state=deletePeriod(state,0,1);
  assert(state.days[0].periods.length===1,"Period deletion failed.");

  state=appendPeriod(state,0);
  state=appendPeriod(state,0);
  assert(state.days[0].periods.length===3,"Three periods must be supported.");

  let threw=false;try{state=appendPeriod(state,0)}catch{threw=true}
  assert(threw,"Fourth period must be blocked.");

  const before=state.days[0].periods[0].start;
  const next=updatePeriod(state,0,0,{start:"07:30"});
  assert(state.days[0].periods[0].start===before,"State update must not mutate previous state.");
  assert(next.days[0].periods[0].start==="07:30","Updated period should appear in next state.");

  return {
    pass:true,
    sevenDays:true,
    weekStartSwitch:true,
    dateContext:true,
    multiPeriodControls:true,
    liveViewModel:true,
    displayFormats:true,
    settingsUpdates:true,
    includeToggle:true,
    maxPeriods:3,
    immutableUpdates:true,
  };
}
