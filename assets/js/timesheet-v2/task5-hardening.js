import { MAX_PERIODS_PER_DAY } from "./contracts.js";
import { createTask2State, appendPeriod, updatePeriod } from "./task2-state.js";
import { calculateTimesheet } from "./engine.js";
import { validateTimesheetState } from "./task3-validation.js";
import { buildTimesheetReport } from "./task4-report.js";

export const TIMESHEET_PRIVACY_NOTICE =
  "Your timesheet is calculated in this browser. Saved weeks use this browser's local storage on this device. Core timesheet calculations do not send your entries to a server.";

export const MAX_EXPECTED_PERIODS = 7 * MAX_PERIODS_PER_DAY;
export const PERFORMANCE_BUDGET_MS = 75;

export function buildMaximumLoadState() {
  let state=createTask2State({
    weekStartDate:"2026-10-05",
    overtimeThresholdHours:40,
    roundingMinutes:0,
  });

  for(let dayIndex=0;dayIndex<7;dayIndex+=1){
    state.days[dayIndex].included=true;
    while(state.days[dayIndex].periods.length<MAX_PERIODS_PER_DAY){
      state=appendPeriod(state,dayIndex);
    }
    state=updatePeriod(state,dayIndex,0,{start:"00:00",end:"04:00",unpaidBreakMinutes:0,nextDay:false});
    state=updatePeriod(state,dayIndex,1,{start:"05:00",end:"09:00",unpaidBreakMinutes:0,nextDay:false});
    state=updatePeriod(state,dayIndex,2,{start:"10:00",end:"14:00",unpaidBreakMinutes:0,nextDay:false});
  }
  return state;
}

export function inspectMaximumLoadPerformance(now=()=>globalThis.performance?.now?.() ?? Date.now()) {
  const state=buildMaximumLoadState();
  const start=now();
  const validation=validateTimesheetState(state);
  const calculated=calculateTimesheet(state);
  const report=buildTimesheetReport(state);
  const elapsed=Math.max(0,now()-start);

  return Object.freeze({
    pass:validation.ok &&
      report.days.reduce((sum,day)=>sum+day.periods.length,0)===MAX_EXPECTED_PERIODS &&
      calculated.totals.totalMinutes===7*12*60 &&
      elapsed<=PERFORMANCE_BUDGET_MS,
    elapsedMs:elapsed,
    periodCount:report.days.reduce((sum,day)=>sum+day.periods.length,0),
    totalMinutes:calculated.totals.totalMinutes,
    budgetMs:PERFORMANCE_BUDGET_MS,
  });
}
