import { WEEK_START, DISPLAY_FORMAT } from "./contracts.js";
import { createTask2State, updatePeriod, appendPeriod, setDayIncluded } from "./task2-state.js";
import { buildTimesheetReport, timesheetSummaryText } from "./task4-report.js";
import { safeCsvCell, timesheetCsv, createTimesheetFilename, copyTimesheetSummary, buildPrintableTimesheetHtml } from "./task4-export.js";

const assert=(condition,message)=>{if(!condition)throw new Error(message);};

function sampleState(){
  let state=createTask2State({
    weekStartDate:"2026-10-05",
    weekStart:WEEK_START.MONDAY,
    overtimeThresholdHours:40,
    roundingMinutes:0,
    displayFormat:DISPLAY_FORMAT.HOURS_MINUTES,
  });
  state=updatePeriod(state,0,0,{start:"08:00",end:"12:00",unpaidBreakMinutes:0,nextDay:false});
  state=appendPeriod(state,0);
  state=updatePeriod(state,0,1,{start:"13:00",end:"17:00",unpaidBreakMinutes:0,nextDay:false});
  state=updatePeriod(state,1,0,{start:"22:00",end:"06:00",unpaidBreakMinutes:30,nextDay:true});
  for(let i=2;i<7;i+=1)state=setDayIncluded(state,i,false);
  return state;
}

export async function runTask4Regression(){
  const state=sampleState();
  const report=buildTimesheetReport(state);

  assert(report.weekStartDate==="2026-10-05"&&report.weekEndDate==="2026-10-11","Report week range is wrong.");
  assert(report.days[0].periods.length===2,"Report must preserve multiple periods.");
  assert(report.days[0].totalMinutes===480,"Split day total must match engine.");
  assert(report.days[1].totalMinutes===450,"Overnight day total must match engine.");
  assert(report.totals.totalMinutes===930,"Weekly report total must equal engine total.");
  assert(report.totals.regularMinutes===930&&report.totals.overtimeMinutes===0,"Regular/overtime report totals must match engine.");

  const summary=timesheetSummaryText(report);
  assert(summary.includes("Monday · 2026-10-05 — 8h 00m"),"Copied summary must include daily total.");
  assert(summary.includes("Period 2: 13:00–17:00"),"Copied summary must include period detail.");
  assert(summary.includes("Tuesday · 2026-10-06 — 7h 30m"),"Copied summary must include overnight day.");
  assert(summary.includes("Overtime threshold: 40 h"),"Copied summary must include threshold.");

  let copied="";
  const copy=await copyTimesheetSummary(state,{writeText:async value=>{copied=value;}});
  assert(copy.ok&&copied===summary,"Clipboard export must use the same structured summary.");
  const copyUnavailable=await copyTimesheetSummary(state,null);
  assert(!copyUnavailable.ok&&copyUnavailable.reason==="clipboard_unavailable","Clipboard failure must be explicit.");

  const csv=timesheetCsv(report);
  assert(csv.charCodeAt(0)===0xFEFF,"CSV should include UTF-8 BOM.");
  assert(csv.includes('"Monday"'),"CSV must contain Monday.");
  assert(csv.includes('"22:00"')&&csv.includes('"06:00"'),"CSV must preserve overnight times.");
  assert(csv.includes('"Total minutes","930"'),"CSV weekly total must match report.");
  assert(safeCsvCell("=1+1")==='"\'=1+1"',"CSV formula-leading cells must be neutralized.");
  assert(safeCsvCell("+SUM(A1:A2)")==='"\'+SUM(A1:A2)"',"CSV plus-formula must be neutralized.");
  assert(safeCsvCell("@cmd")==='"\'@cmd"',"CSV at-formula must be neutralized.");
  assert(safeCsvCell("-10")==='"\'-10"',"CSV minus-leading cells must be neutralized.");

  const filename=createTimesheetFilename(report,"csv");
  assert(filename==="timesheet-2026-10-05-to-2026-10-11.csv","CSV filename should include week range.");

  const a4=buildPrintableTimesheetHtml(state,{pageSize:"A4"});
  const letter=buildPrintableTimesheetHtml(state,{pageSize:"LETTER"});
  assert(a4.includes("@page{size:A4"),"A4 print layout required.");
  assert(letter.includes("@page{size:Letter"),"US Letter print layout required.");
  assert(a4.includes("Monday")&&a4.includes("8h 00m"),"Print output must contain day and total.");
  assert(a4.includes("No employment-law or pay-premium rules are applied."),"Print output must preserve overtime disclaimer.");

  let threw=false;
  const invalid=sampleState();
  invalid.days[0].periods[0].unpaidBreakMinutes=999;
  try{buildTimesheetReport(invalid)}catch{threw=true}
  assert(threw,"Invalid timesheet must not export.");

  return {
    pass:true,
    reportIntegrity:true,
    multiPeriod:true,
    overnight:true,
    copySummary:true,
    csv:true,
    csvFormulaGuard:true,
    filename:true,
    printA4:true,
    printLetter:true,
    invalidStateBlocked:true,
  };
}
