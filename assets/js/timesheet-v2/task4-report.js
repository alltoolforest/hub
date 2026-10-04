import { DISPLAY_FORMAT } from "./contracts.js";
import { calculateTimesheet } from "./engine.js";
import { validateTimesheetState } from "./task3-validation.js";

function displayMinutes(minutes, format) {
  const safe = Math.max(0, Math.round(Number(minutes) || 0));
  if (format === DISPLAY_FORMAT.DECIMAL) {
    const hours = Math.round(((safe / 60) + Number.EPSILON) * 100) / 100;
    return `${hours} h`;
  }
  const hours = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${hours}h ${String(remainder).padStart(2,"0")}m`;
}

function periodLabel(period, calculated, index, format) {
  const endSuffix = period.nextDay ? " (+1 day)" : "";
  const breakText = Number(period.unpaidBreakMinutes) > 0 ? ` · unpaid break ${Number(period.unpaidBreakMinutes)}m` : "";
  return `Period ${index + 1}: ${period.start}–${period.end}${endSuffix}${breakText} · ${displayMinutes(calculated.roundedMinutes, format)}`;
}

export function buildTimesheetReport(state) {
  const validation = validateTimesheetState(state);
  if (!validation.ok) {
    const first = validation.globalIssues[0] || validation.dayResults.flatMap(item=>item.issues)[0];
    throw new Error(first?.message || "Fix timesheet errors before creating a report.");
  }

  const calculated = calculateTimesheet(state);
  const lastDate = calculated.days[calculated.days.length - 1].date;
  const days = calculated.days.map((day,index)=>{
    const sourceDay = state.days[index];
    if (!sourceDay.included) {
      return Object.freeze({
        included:false,
        name:day.name,
        date:day.date,
        periods:Object.freeze([]),
        totalMinutes:0,
        displayTotal:displayMinutes(0,state.displayFormat),
      });
    }
    return Object.freeze({
      included:true,
      name:day.name,
      date:day.date,
      periods:Object.freeze(sourceDay.periods.map((period,periodIndex)=>Object.freeze({
        index:periodIndex + 1,
        start:period.start,
        end:period.end,
        nextDay:Boolean(period.nextDay),
        unpaidBreakMinutes:Number(period.unpaidBreakMinutes),
        rawMinutes:day.result.periods[periodIndex].rawMinutes,
        roundedMinutes:day.result.periods[periodIndex].roundedMinutes,
        display:periodLabel(period,day.result.periods[periodIndex],periodIndex,state.displayFormat),
      }))),
      totalMinutes:day.result.totalMinutes,
      displayTotal:displayMinutes(day.result.totalMinutes,state.displayFormat),
    });
  });

  return Object.freeze({
    weekStartDate:calculated.weekStartDate,
    weekEndDate:lastDate,
    weekStart:calculated.weekStart,
    displayFormat:state.displayFormat,
    roundingMinutes:calculated.roundingMinutes,
    roundingPolicy:calculated.roundingPolicy,
    overtimeThresholdHours:calculated.overtimeThresholdHours,
    days:Object.freeze(days),
    totals:Object.freeze({
      regularMinutes:calculated.totals.regularMinutes,
      overtimeMinutes:calculated.totals.overtimeMinutes,
      totalMinutes:calculated.totals.totalMinutes,
      regular:displayMinutes(calculated.totals.regularMinutes,state.displayFormat),
      overtime:displayMinutes(calculated.totals.overtimeMinutes,state.displayFormat),
      total:displayMinutes(calculated.totals.totalMinutes,state.displayFormat),
      regularHoursMinutes:calculated.totals.regularHoursMinutes,
      overtimeHoursMinutes:calculated.totals.overtimeHoursMinutes,
      totalHoursMinutes:calculated.totals.totalHoursMinutes,
      regularDecimalHours:calculated.totals.regularDecimalHours,
      overtimeDecimalHours:calculated.totals.overtimeDecimalHours,
      totalDecimalHours:calculated.totals.totalDecimalHours,
    }),
  });
}

export function timesheetSummaryText(report) {
  const lines = [
    `Timesheet: ${report.weekStartDate} to ${report.weekEndDate}`,
    "",
  ];

  for (const day of report.days) {
    if (!day.included) continue;
    lines.push(`${day.name} · ${day.date} — ${day.displayTotal}`);
    for (const period of day.periods) lines.push(`  ${period.display}`);
  }

  lines.push(
    "",
    `Regular: ${report.totals.regular}`,
    `Overtime: ${report.totals.overtime}`,
    `Total: ${report.totals.total}`,
    `Overtime threshold: ${report.overtimeThresholdHours} h`,
    `Rounding: ${report.roundingMinutes ? `nearest ${report.roundingMinutes} minutes per period` : "none"}`
  );
  return lines.join("\n");
}
