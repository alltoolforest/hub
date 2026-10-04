import {
  WEEK_START,
  DAY_NAMES_MONDAY_FIRST,
  DAY_NAMES_SUNDAY_FIRST,
  DAYS_PER_WEEK,
  MAX_PERIODS_PER_DAY,
  TASK1_VERSION,
} from "./contracts.js";

function parseIsoDate(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error("Week start must use YYYY-MM-DD.");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) throw new Error("Enter a valid week start date.");

  return date;
}

function isoDate(date) {
  return date.toISOString().slice(0,10);
}

export function isCorrectWeekStart(dateText, weekStart) {
  const date = parseIsoDate(dateText);
  const weekday = date.getUTCDay();
  return weekStart === WEEK_START.SUNDAY ? weekday === 0 : weekday === 1;
}

export function normalizeWeekStartDate(dateText, weekStart = WEEK_START.MONDAY) {
  if (![WEEK_START.MONDAY, WEEK_START.SUNDAY].includes(weekStart)) {
    throw new Error("Unsupported week start.");
  }
  const date = parseIsoDate(dateText);
  const weekday = date.getUTCDay();
  const target = weekStart === WEEK_START.SUNDAY ? 0 : 1;
  const delta = (weekday - target + 7) % 7;
  date.setUTCDate(date.getUTCDate() - delta);
  return isoDate(date);
}

export function buildWeekDates(weekStartDate, weekStart = WEEK_START.MONDAY) {
  const normalized = normalizeWeekStartDate(weekStartDate, weekStart);
  const base = parseIsoDate(normalized);
  const names = weekStart === WEEK_START.SUNDAY ? DAY_NAMES_SUNDAY_FIRST : DAY_NAMES_MONDAY_FIRST;

  return Object.freeze(Array.from({length:DAYS_PER_WEEK},(_,index)=>{
    const date = new Date(base);
    date.setUTCDate(base.getUTCDate()+index);
    return Object.freeze({
      index,
      name:names[index],
      date:isoDate(date),
    });
  }));
}

export function createEmptyPeriod() {
  return {
    start:"09:00",
    end:"17:00",
    unpaidBreakMinutes:0,
    nextDay:false,
  };
}

export function createEmptyDay(dayMeta, included = true) {
  return {
    ...dayMeta,
    included,
    periods:[createEmptyPeriod()],
  };
}

export function createTimesheetState({
  weekStartDate,
  weekStart = WEEK_START.MONDAY,
  overtimeThresholdHours = 40,
  roundingMinutes = 0,
  displayFormat = "hours_minutes",
} = {}) {
  const today = new Date();
  const fallback = new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate())).toISOString().slice(0,10);
  const dates = buildWeekDates(weekStartDate || fallback, weekStart);

  return {
    version:TASK1_VERSION,
    weekStart,
    weekStartDate:dates[0].date,
    overtimeThresholdHours:Number(overtimeThresholdHours),
    roundingMinutes:Number(roundingMinutes),
    displayFormat,
    days:dates.map((meta,index)=>createEmptyDay(meta,index<5)),
  };
}

export function validatePeriodCount(periods) {
  if (!Array.isArray(periods) || periods.length < 1 || periods.length > MAX_PERIODS_PER_DAY) {
    throw new Error(`Each included day must have between 1 and ${MAX_PERIODS_PER_DAY} work periods.`);
  }
}
