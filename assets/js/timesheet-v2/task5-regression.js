import { createTask2State, appendPeriod, updatePeriod } from "./task2-state.js";
import { createTimesheetStore, TIMESHEET_STORAGE_KEY } from "./task3-storage.js";
import { safeCsvCell, buildPrintableTimesheetHtml } from "./task4-export.js";
import { TIMESHEET_PRIVACY_NOTICE, MAX_EXPECTED_PERIODS, inspectMaximumLoadPerformance } from "./task5-hardening.js";

const assert=(condition,message)=>{if(!condition)throw new Error(message);};

function memoryStorage(){
  const map=new Map([["unrelated.key","keep-me"]]);
  return {
    getItem:key=>map.has(key)?map.get(key):null,
    setItem:(key,value)=>map.set(key,String(value)),
    removeItem:key=>map.delete(key),
    has:key=>map.has(key),
    value:key=>map.get(key),
  };
}

export function runTask5Regression(){
  assert(TIMESHEET_PRIVACY_NOTICE.includes("calculated in this browser"),"Privacy notice must disclose browser-local calculation.");
  assert(TIMESHEET_PRIVACY_NOTICE.includes("local storage"),"Privacy notice must disclose local storage.");
  assert(TIMESHEET_PRIVACY_NOTICE.includes("do not send your entries to a server"),"Privacy notice must describe network behavior.");

  const storage=memoryStorage();
  const store=createTimesheetStore(storage);
  const state=createTask2State({weekStartDate:"2026-10-05"});
  assert(store.save(state).ok,"Valid state should save.");
  assert(storage.has(TIMESHEET_STORAGE_KEY),"Scoped storage key must be present.");
  assert(store.clear().ok,"Clear should succeed.");
  assert(!storage.has(TIMESHEET_STORAGE_KEY),"Clear must remove the timesheet key.");
  assert(storage.value("unrelated.key")==="keep-me","Clear must not remove unrelated browser storage.");

  assert(safeCsvCell("=HYPERLINK(\"https://example.test\")").startsWith("\"'="),"CSV formula injection must remain neutralized.");
  assert(safeCsvCell("@SUM(A1:A2)").startsWith("\"'@"),"CSV @ formula injection must remain neutralized.");

  let printState=createTask2State({weekStartDate:"2026-10-05"});
  printState=updatePeriod(printState,0,0,{start:"09:00",end:"17:00",unpaidBreakMinutes:30,nextDay:false});
  const html=buildPrintableTimesheetHtml(printState);
  assert(!/<script\b/i.test(html),"Printable output must not contain executable script tags.");
  assert(html.includes("No employment-law or pay-premium rules are applied."),"Print safety disclaimer must remain present.");

  let maxState=createTask2State({weekStartDate:"2026-10-05"});
  for(let day=0;day<7;day+=1){
    maxState=appendPeriod(maxState,day);
    maxState=appendPeriod(maxState,day);
  }
  assert(maxState.days.reduce((sum,day)=>sum+day.periods.length,0)===MAX_EXPECTED_PERIODS,"Maximum supported state should contain 21 periods.");

  let tick=0;
  const perf=inspectMaximumLoadPerformance(()=>{tick+=5;return tick;});
  assert(perf.pass,"Maximum-load calculation/report pipeline must stay inside the performance budget.");
  assert(perf.periodCount===21,"Performance test must exercise all 21 periods.");

  return {
    pass:true,
    privacyDisclosure:true,
    scopedClear:true,
    unrelatedStoragePreserved:true,
    csvInjectionGuard:true,
    printScriptGuard:true,
    printDisclaimer:true,
    maxPeriods:21,
    performanceBudgetMs:perf.budgetMs,
    performance:true,
  };
}
