import {
  DISPLAY_FORMAT,
  ROUNDING_MODE,
  WEEK_START,
  MAX_PERIODS_PER_DAY,
  MAX_WEEKLY_MINUTES,
} from "./contracts.js";
import {
  calculateRawPeriodMinutes,
  roundMinutes,
  formatHoursMinutes,
  decimalHours,
} from "./time-math.js";
import {
  buildWeekDates,
  normalizeWeekStartDate,
  validatePeriodCount,
} from "./week-model.js";

function validateThreshold(hours) {
  const value = Number(hours);
  if (!Number.isFinite(value) || value < 0 || value > 168) {
    throw new Error("Weekly overtime threshold must be between 0 and 168 hours.");
  }
  return value;
}

function validateRounding(value) {
  const step = Number(value);
  if (!Object.values(ROUNDING_MODE).includes(step)) {
    throw new Error("Unsupported rounding setting.");
  }
  return step;
}

function validateDisplayFormat(value) {
  if (!Object.values(DISPLAY_FORMAT).includes(value)) {
    throw new Error("Unsupported display format.");
  }
  return value;
}

function periodInterval(period) {
  const [sh,sm] = String(period.start).split(":").map(Number);
  const [eh,em] = String(period.end).split(":").map(Number);
  if (![sh,sm,eh,em].every(Number.isFinite)) return null;
  const start = sh*60+sm;
  let end = eh*60+em;
  if (period.nextDay) end += 1440;
  return {start,end};
}

export function findOverlaps(periods = []) {
  const intervals = periods.map((period,index)=>({index,...periodInterval(period)}));
  const overlaps = [];
  for (let i=0;i<intervals.length;i+=1) {
    for (let j=i+1;j<intervals.length;j+=1) {
      const a=intervals[i], b=intervals[j];
      if (a.start < b.end && b.start < a.end) overlaps.push([a.index,b.index]);
    }
  }
  return overlaps;
}

export function calculatePeriod(period, roundingMinutes = 0) {
  const rawMinutes = calculateRawPeriodMinutes(period);
  const roundedMinutes = roundMinutes(rawMinutes, roundingMinutes);
  return Object.freeze({
    rawMinutes,
    roundedMinutes,
    hoursMinutes:formatHoursMinutes(roundedMinutes),
    decimalHours:decimalHours(roundedMinutes),
  });
}

export function calculateDay(day, roundingMinutes = 0) {
  if (!day?.included) {
    return Object.freeze({
      included:false,
      periods:Object.freeze([]),
      totalMinutes:0,
      hoursMinutes:"0h 00m",
      decimalHours:0,
    });
  }

  validatePeriodCount(day.periods);
  const overlaps = findOverlaps(day.periods);
  if (overlaps.length) {
    const [a,b] = overlaps[0];
    throw new Error(`Work periods ${a+1} and ${b+1} overlap on ${day.name || "this day"}.`);
  }

  const periods = day.periods.map((period)=>calculatePeriod(period,roundingMinutes));
  const totalMinutes = periods.reduce((sum,period)=>sum+period.roundedMinutes,0);

  return Object.freeze({
    included:true,
    periods:Object.freeze(periods),
    totalMinutes,
    hoursMinutes:formatHoursMinutes(totalMinutes),
    decimalHours:decimalHours(totalMinutes),
  });
}

export function calculateTimesheet(state = {}) {
  const weekStart = state.weekStart === WEEK_START.SUNDAY ? WEEK_START.SUNDAY : WEEK_START.MONDAY;
  const normalizedWeekStartDate = normalizeWeekStartDate(state.weekStartDate,weekStart);
  const weekDates = buildWeekDates(normalizedWeekStartDate,weekStart);
  const thresholdHours = validateThreshold(state.overtimeThresholdHours);
  const roundingMinutes = validateRounding(state.roundingMinutes ?? 0);
  const displayFormat = validateDisplayFormat(state.displayFormat ?? DISPLAY_FORMAT.HOURS_MINUTES);

  if (!Array.isArray(state.days) || state.days.length !== 7) {
    throw new Error("A timesheet must contain exactly seven days.");
  }

  const days = state.days.map((day,index)=>{
    const result = calculateDay({...day,...weekDates[index]},roundingMinutes);
    return Object.freeze({
      ...weekDates[index],
      result,
    });
  });

  const totalMinutes = days.reduce((sum,day)=>sum+day.result.totalMinutes,0);
  if (totalMinutes > MAX_WEEKLY_MINUTES) {
    throw new Error("Weekly worked time exceeds the supported maximum.");
  }

  const thresholdMinutes = Math.round(thresholdHours*60);
  const overtimeMinutes = Math.max(0,totalMinutes-thresholdMinutes);
  const regularMinutes = totalMinutes-overtimeMinutes;

  return Object.freeze({
    weekStart,
    weekStartDate:normalizedWeekStartDate,
    roundingMinutes,
    roundingPolicy:"per_period_after_unpaid_break_before_daily_and_weekly_aggregation",
    displayFormat,
    overtimeThresholdHours:thresholdHours,
    days:Object.freeze(days),
    totals:Object.freeze({
      regularMinutes,
      overtimeMinutes,
      totalMinutes,
      regularHoursMinutes:formatHoursMinutes(regularMinutes),
      overtimeHoursMinutes:formatHoursMinutes(overtimeMinutes),
      totalHoursMinutes:formatHoursMinutes(totalMinutes),
      regularDecimalHours:decimalHours(regularMinutes),
      overtimeDecimalHours:decimalHours(overtimeMinutes),
      totalDecimalHours:decimalHours(totalMinutes),
    }),
  });
}

export function addPeriod(day, period = {start:"09:00",end:"17:00",unpaidBreakMinutes:0,nextDay:false}) {
  const periods = Array.isArray(day?.periods) ? day.periods : [];
  if (periods.length >= MAX_PERIODS_PER_DAY) throw new Error(`A day supports up to ${MAX_PERIODS_PER_DAY} work periods.`);
  return {...day,periods:[...periods,{...period}]};
}

export function removePeriod(day,index) {
  const periods = Array.isArray(day?.periods) ? day.periods : [];
  if (periods.length <= 1) throw new Error("At least one work period must remain on an included day.");
  if (!Number.isInteger(index) || index < 0 || index >= periods.length) throw new Error("Invalid work-period index.");
  return {...day,periods:periods.filter((_,i)=>i!==index)};
}
