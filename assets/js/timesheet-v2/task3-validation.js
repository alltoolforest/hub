import { DAYS_PER_WEEK, MAX_PERIODS_PER_DAY, ROUNDING_MODE, DISPLAY_FORMAT, WEEK_START } from "./contracts.js";
import { calculateDay, calculateTimesheet, findOverlaps } from "./engine.js";
import { buildWeekDates } from "./week-model.js";

const TIME=/^(?:[01]\d|2[0-3]):[0-5]\d$/;

function issue(code,message,details={}) {
  return Object.freeze({code,message,...details});
}

export function validatePeriodInput(period,dayIndex,periodIndex) {
  const issues=[];
  if (!TIME.test(String(period?.start||""))) issues.push(issue("invalid_start","Enter a valid start time.",{dayIndex,periodIndex,field:"start"}));
  if (!TIME.test(String(period?.end||""))) issues.push(issue("invalid_end","Enter a valid end time.",{dayIndex,periodIndex,field:"end"}));
  const breakMinutes=Number(period?.unpaidBreakMinutes);
  if (!Number.isFinite(breakMinutes)||breakMinutes<0||breakMinutes>1440) {
    issues.push(issue("invalid_break","Unpaid break must be between 0 and 1440 minutes.",{dayIndex,periodIndex,field:"unpaidBreakMinutes"}));
  }
  return issues;
}

export function validateDayState(day,dayIndex,roundingMinutes=0) {
  const issues=[];
  if (!day?.included) return {ok:true,issues:Object.freeze([]),result:null};
  if (!Array.isArray(day.periods)||day.periods.length<1||day.periods.length>MAX_PERIODS_PER_DAY) {
    issues.push(issue("invalid_period_count",`Use between 1 and ${MAX_PERIODS_PER_DAY} work periods.`,{dayIndex}));
    return {ok:false,issues:Object.freeze(issues),result:null};
  }

  day.periods.forEach((period,periodIndex)=>issues.push(...validatePeriodInput(period,dayIndex,periodIndex)));
  if (issues.length) return {ok:false,issues:Object.freeze(issues),result:null};

  const overlaps=findOverlaps(day.periods);
  if (overlaps.length) {
    const [a,b]=overlaps[0];
    issues.push(issue("overlap",`Work periods ${a+1} and ${b+1} overlap.`,{dayIndex,periodIndexes:[a,b]}));
    return {ok:false,issues:Object.freeze(issues),result:null};
  }

  try {
    return {ok:true,issues:Object.freeze([]),result:calculateDay(day,roundingMinutes)};
  } catch(error) {
    issues.push(issue("invalid_period",error.message||"This work period is invalid.",{dayIndex}));
    return {ok:false,issues:Object.freeze(issues),result:null};
  }
}

export function validateTimesheetState(state) {
  const globalIssues=[];
  if (!state||typeof state!=="object") {
    return {ok:false,globalIssues:Object.freeze([issue("invalid_state","Saved timesheet data is invalid.")]),dayResults:Object.freeze([])};
  }

  if (![WEEK_START.MONDAY,WEEK_START.SUNDAY].includes(state.weekStart)) globalIssues.push(issue("invalid_week_start","Week start setting is invalid."));
  if (!Object.values(ROUNDING_MODE).includes(Number(state.roundingMinutes))) globalIssues.push(issue("invalid_rounding","Rounding setting is invalid."));
  if (!Object.values(DISPLAY_FORMAT).includes(state.displayFormat)) globalIssues.push(issue("invalid_display_format","Display format is invalid."));

  const threshold=Number(state.overtimeThresholdHours);
  if (!Number.isFinite(threshold)||threshold<0||threshold>168) globalIssues.push(issue("invalid_threshold","Weekly overtime threshold must be between 0 and 168 hours."));

  let dates=null;
  try { dates=buildWeekDates(state.weekStartDate,state.weekStart); }
  catch { globalIssues.push(issue("invalid_week_date","Week starting date is invalid.")); }

  if (!Array.isArray(state.days)||state.days.length!==DAYS_PER_WEEK) {
    globalIssues.push(issue("invalid_days","Timesheet must contain exactly seven days."));
  }

  if (globalIssues.length) return {ok:false,globalIssues:Object.freeze(globalIssues),dayResults:Object.freeze([])};

  const dayResults=state.days.map((day,index)=>validateDayState({...day,...dates[index]},index,Number(state.roundingMinutes)));
  const ok=dayResults.every(item=>item.ok);

  return {
    ok,
    globalIssues:Object.freeze([]),
    dayResults:Object.freeze(dayResults),
  };
}

export function assertRestorableState(state) {
  const validation=validateTimesheetState(state);
  if (!validation.ok) {
    const first=validation.globalIssues[0]||validation.dayResults.flatMap(item=>item.issues)[0];
    throw new Error(first?.message||"Saved timesheet is invalid.");
  }
  calculateTimesheet(state);
  return state;
}
