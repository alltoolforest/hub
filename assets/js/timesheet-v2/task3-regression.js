import { WEEK_START, DISPLAY_FORMAT } from "./contracts.js";
import { createTask2State, updatePeriod, appendPeriod } from "./task2-state.js";
import { validateTimesheetState } from "./task3-validation.js";
import { createTimesheetStore, TIMESHEET_STORAGE_KEY, TIMESHEET_STORAGE_SCHEMA } from "./task3-storage.js";

const assert=(condition,message)=>{if(!condition)throw new Error(message);};

function memoryStorage(){
  const map=new Map();
  return {
    getItem:key=>map.has(key)?map.get(key):null,
    setItem:(key,value)=>map.set(key,String(value)),
    removeItem:key=>map.delete(key),
    setRaw:(key,value)=>map.set(key,String(value)),
    has:key=>map.has(key),
  };
}

export function runTask3Regression(){
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

  const validation=validateTimesheetState(state);
  assert(validation.ok,"Valid state must pass Task 3 validation.");

  const storage=memoryStorage();
  const store=createTimesheetStore(storage);
  const save=store.save(state);
  assert(save.ok,"Valid timesheet should save.");
  assert(storage.has(TIMESHEET_STORAGE_KEY),"Scoped timesheet key should be used.");

  const loaded=store.load();
  assert(loaded.ok&&loaded.state,"Saved timesheet should restore.");
  assert(loaded.state.days[0].periods.length===2,"Restore must preserve multiple periods.");
  assert(loaded.state.weekStartDate==="2026-10-05","Restore must preserve week date.");

  loaded.state.days[0].periods[0].start="07:00";
  assert(state.days[0].periods[0].start==="08:00","Restored state must not alias original state.");

  const overlap=createTask2State({weekStartDate:"2026-10-05"});
  overlap.days[0].periods=[
    {start:"08:00",end:"12:00",unpaidBreakMinutes:0,nextDay:false},
    {start:"11:00",end:"14:00",unpaidBreakMinutes:0,nextDay:false},
  ];
  const overlapValidation=validateTimesheetState(overlap);
  assert(!overlapValidation.ok,"Overlapping periods must be invalid.");
  assert(overlapValidation.dayResults[0].issues.some(x=>x.code==="overlap"),"Overlap issue should be day-specific.");

  const badBreak=createTask2State({weekStartDate:"2026-10-05"});
  badBreak.days[0].periods[0].unpaidBreakMinutes=999;
  const badBreakValidation=validateTimesheetState(badBreak);
  assert(!badBreakValidation.ok,"Break longer than shift must be rejected without erasing state.");
  assert(badBreak.days[1].periods[0].start==="09:00","Another valid day must remain intact.");

  const badThreshold=createTask2State({weekStartDate:"2026-10-05"});
  badThreshold.overtimeThresholdHours=169;
  const thresholdValidation=validateTimesheetState(badThreshold);
  assert(!thresholdValidation.ok&&thresholdValidation.globalIssues.some(x=>x.code==="invalid_threshold"),"Invalid threshold should be a global validation error.");

  storage.setRaw(TIMESHEET_STORAGE_KEY,"{bad json");
  const corrupt=store.load();
  assert(!corrupt.ok&&corrupt.reason==="corrupt_data","Corrupt storage must fail safely.");

  storage.setRaw(TIMESHEET_STORAGE_KEY,JSON.stringify({schema:TIMESHEET_STORAGE_SCHEMA+1,engineVersion:"timesheet-v2-task1",state}));
  const future=store.load();
  assert(!future.ok&&future.reason==="unsupported_schema","Unsupported schema must not be restored.");

  storage.setRaw(TIMESHEET_STORAGE_KEY,JSON.stringify({schema:TIMESHEET_STORAGE_SCHEMA,engineVersion:"old",state}));
  const oldEngine=store.load();
  assert(!oldEngine.ok&&oldEngine.reason==="unsupported_engine_version","Unsupported engine version must not be restored.");

  const unavailable=createTimesheetStore(null);
  assert(!unavailable.save(state).ok,"Unavailable storage must fail safely.");
  assert(!unavailable.load().ok,"Unavailable storage load must fail safely.");

  store.save(state);
  assert(store.clear().ok,"Clear saved timesheet should succeed.");
  assert(!storage.has(TIMESHEET_STORAGE_KEY),"Clear should remove only scoped saved timesheet.");

  return {
    pass:true,
    saveRestore:true,
    multiPeriodRestore:true,
    scopedStorage:true,
    overlapValidation:true,
    breakValidation:true,
    thresholdValidation:true,
    corruptRecovery:true,
    schemaGuard:true,
    engineVersionGuard:true,
    storageUnavailableSafe:true,
    clearSaved:true,
    validStatePreserved:true,
  };
}
