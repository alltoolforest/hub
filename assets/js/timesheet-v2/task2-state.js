import { DISPLAY_FORMAT, ROUNDING_MODE, WEEK_START, MAX_PERIODS_PER_DAY } from "./contracts.js";
import { addPeriod, removePeriod, calculateTimesheet } from "./engine.js";
import { createTimesheetState, buildWeekDates } from "./week-model.js";

function clonePeriod(period) {
  return {
    start:String(period?.start ?? "09:00"),
    end:String(period?.end ?? "17:00"),
    unpaidBreakMinutes:Number(period?.unpaidBreakMinutes ?? 0),
    nextDay:Boolean(period?.nextDay),
  };
}

function cloneDay(day) {
  return {
    index:Number(day?.index ?? 0),
    name:String(day?.name ?? ""),
    date:String(day?.date ?? ""),
    included:Boolean(day?.included),
    periods:(day?.periods || []).map(clonePeriod),
  };
}

export function cloneState(state) {
  return {
    ...state,
    days:(state?.days || []).map(cloneDay),
  };
}

export function createTask2State(seed = {}) {
  return createTimesheetState(seed);
}

export function setWeekStart(state, weekStart) {
  if (![WEEK_START.MONDAY,WEEK_START.SUNDAY].includes(weekStart)) throw new Error("Unsupported week start.");
  const next=cloneState(state);
  const dates=buildWeekDates(next.weekStartDate,weekStart);
  next.weekStart=weekStart;
  next.weekStartDate=dates[0].date;
  next.days=next.days.map((day,index)=>({...day,...dates[index]}));
  return next;
}

export function setWeekStartDate(state, value) {
  const next=cloneState(state);
  const dates=buildWeekDates(value,next.weekStart);
  next.weekStartDate=dates[0].date;
  next.days=next.days.map((day,index)=>({...day,...dates[index]}));
  return next;
}

export function setOvertimeThreshold(state, hours) {
  const next=cloneState(state);
  next.overtimeThresholdHours=Number(hours);
  return next;
}

export function setRounding(state, minutes) {
  const step=Number(minutes);
  if (!Object.values(ROUNDING_MODE).includes(step)) throw new Error("Unsupported rounding setting.");
  const next=cloneState(state);
  next.roundingMinutes=step;
  return next;
}

export function setDisplayFormat(state, format) {
  if (!Object.values(DISPLAY_FORMAT).includes(format)) throw new Error("Unsupported display format.");
  const next=cloneState(state);
  next.displayFormat=format;
  return next;
}

export function setDayIncluded(state, dayIndex, included) {
  const next=cloneState(state);
  if (!next.days[dayIndex]) throw new Error("Invalid day.");
  next.days[dayIndex].included=Boolean(included);
  return next;
}

export function updatePeriod(state, dayIndex, periodIndex, patch={}) {
  const next=cloneState(state);
  const period=next.days?.[dayIndex]?.periods?.[periodIndex];
  if (!period) throw new Error("Invalid work period.");
  if ("start" in patch) period.start=String(patch.start);
  if ("end" in patch) period.end=String(patch.end);
  if ("unpaidBreakMinutes" in patch) period.unpaidBreakMinutes=Number(patch.unpaidBreakMinutes);
  if ("nextDay" in patch) period.nextDay=Boolean(patch.nextDay);
  return next;
}

export function appendPeriod(state, dayIndex) {
  const next=cloneState(state);
  if (!next.days[dayIndex]) throw new Error("Invalid day.");
  next.days[dayIndex]=addPeriod(next.days[dayIndex]);
  return next;
}

export function deletePeriod(state, dayIndex, periodIndex) {
  const next=cloneState(state);
  if (!next.days[dayIndex]) throw new Error("Invalid day.");
  next.days[dayIndex]=removePeriod(next.days[dayIndex],periodIndex);
  return next;
}

export function getTask2ViewModel(state) {
  const result=calculateTimesheet(state);
  const preferDecimal=state.displayFormat===DISPLAY_FORMAT.DECIMAL;
  return {
    ...result,
    days:result.days.map((day)=>({
      ...day,
      displayTotal:preferDecimal?`${day.result.decimalHours} h`:day.result.hoursMinutes,
    })),
    totals:{
      ...result.totals,
      displayRegular:preferDecimal?`${result.totals.regularDecimalHours} h`:result.totals.regularHoursMinutes,
      displayOvertime:preferDecimal?`${result.totals.overtimeDecimalHours} h`:result.totals.overtimeHoursMinutes,
      displayTotal:preferDecimal?`${result.totals.totalDecimalHours} h`:result.totals.totalHoursMinutes,
    },
  };
}

export { MAX_PERIODS_PER_DAY };
