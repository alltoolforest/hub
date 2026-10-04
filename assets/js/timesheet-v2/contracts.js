export const WEEK_START = Object.freeze({
  MONDAY: "monday",
  SUNDAY: "sunday",
});

export const DISPLAY_FORMAT = Object.freeze({
  HOURS_MINUTES: "hours_minutes",
  DECIMAL: "decimal",
});

export const ROUNDING_MODE = Object.freeze({
  NONE: 0,
  NEAREST_5: 5,
  NEAREST_6: 6,
  NEAREST_10: 10,
  NEAREST_15: 15,
});

export const MAX_PERIODS_PER_DAY = 3;
export const DAYS_PER_WEEK = 7;
export const MINUTES_PER_DAY = 1440;
export const MAX_WEEKLY_MINUTES = DAYS_PER_WEEK * MINUTES_PER_DAY;

export const DAY_NAMES_MONDAY_FIRST = Object.freeze([
  "Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday",
]);

export const DAY_NAMES_SUNDAY_FIRST = Object.freeze([
  "Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday",
]);

export const TASK1_VERSION = "timesheet-v2-task1";
