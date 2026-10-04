import { MINUTES_PER_DAY } from "./contracts.js";

export function parseTimeToMinutes(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error("Enter time in HH:MM format.");

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error("Enter a valid 24-hour time.");
  }
  return hours * 60 + minutes;
}

export function calculateRawPeriodMinutes({
  start,
  end,
  unpaidBreakMinutes = 0,
  nextDay = false,
} = {}) {
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  const breakMinutes = Number(unpaidBreakMinutes);

  if (!Number.isFinite(breakMinutes) || breakMinutes < 0 || breakMinutes > MINUTES_PER_DAY) {
    throw new Error("Unpaid break must be between 0 and 1440 minutes.");
  }

  let shiftMinutes = endMinutes - startMinutes;
  if (nextDay) shiftMinutes += MINUTES_PER_DAY;

  if (shiftMinutes < 0) {
    throw new Error("End time is earlier than start time. Enable next-day end for an overnight shift.");
  }
  if (breakMinutes > shiftMinutes) {
    throw new Error("Unpaid break cannot exceed the work period duration.");
  }

  return shiftMinutes - breakMinutes;
}

export function roundMinutes(value, increment = 0) {
  const minutes = Number(value);
  const step = Number(increment);
  if (!Number.isFinite(minutes) || minutes < 0) throw new Error("Minutes must be a non-negative number.");
  if (![0,5,6,10,15].includes(step)) throw new Error("Unsupported rounding increment.");
  if (step === 0) return minutes;
  return Math.round(minutes / step) * step;
}

export function formatHoursMinutes(totalMinutes) {
  const minutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h ${String(remainder).padStart(2,"0")}m`;
}

export function decimalHours(totalMinutes, precision = 2) {
  const value = Number(totalMinutes) / 60;
  if (!Number.isFinite(value)) throw new Error("Cannot format non-finite minutes.");
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
