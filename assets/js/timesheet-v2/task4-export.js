import { buildTimesheetReport, timesheetSummaryText } from "./task4-report.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

export function safeCsvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g,'""')}"`;
}

export function timesheetCsv(report) {
  const rows = [
    ["Week start","Week end","Day","Date","Period","Start","End","Ends next day","Unpaid break minutes","Worked minutes","Worked h:mm","Worked decimal hours"],
  ];

  for (const day of report.days) {
    if (!day.included) continue;
    for (const period of day.periods) {
      const h = Math.floor(period.roundedMinutes / 60);
      const m = period.roundedMinutes % 60;
      rows.push([
        report.weekStartDate,
        report.weekEndDate,
        day.name,
        day.date,
        period.index,
        period.start,
        period.end,
        period.nextDay ? "Yes" : "No",
        period.unpaidBreakMinutes,
        period.roundedMinutes,
        `${h}:${String(m).padStart(2,"0")}`,
        Math.round(((period.roundedMinutes / 60) + Number.EPSILON) * 100) / 100,
      ]);
    }
  }

  rows.push([]);
  rows.push(["Weekly summary","","","","","","","","","","",""]);
  rows.push(["Regular minutes",report.totals.regularMinutes]);
  rows.push(["Overtime minutes",report.totals.overtimeMinutes]);
  rows.push(["Total minutes",report.totals.totalMinutes]);
  rows.push(["Regular hours",report.totals.regularHoursMinutes]);
  rows.push(["Overtime hours",report.totals.overtimeHoursMinutes]);
  rows.push(["Total hours",report.totals.totalHoursMinutes]);
  rows.push(["Regular decimal hours",report.totals.regularDecimalHours]);
  rows.push(["Overtime decimal hours",report.totals.overtimeDecimalHours]);
  rows.push(["Total decimal hours",report.totals.totalDecimalHours]);
  rows.push(["Overtime threshold hours",report.overtimeThresholdHours]);
  rows.push(["Rounding minutes per period",report.roundingMinutes]);

  return "\uFEFF" + rows.map(row=>row.map(safeCsvCell).join(",")).join("\r\n");
}

export function createTimesheetFilename(report, extension) {
  const ext = String(extension || "txt").replace(/[^a-z0-9]/gi,"").toLowerCase() || "txt";
  return `timesheet-${report.weekStartDate}-to-${report.weekEndDate}.${ext}`;
}

export async function copyTimesheetSummary(state, clipboard=globalThis.navigator?.clipboard) {
  const report=buildTimesheetReport(state);
  const text=timesheetSummaryText(report);
  if (!clipboard || typeof clipboard.writeText!=="function") return {ok:false,reason:"clipboard_unavailable",text};
  try {
    await clipboard.writeText(text);
    return {ok:true,text};
  } catch {
    return {ok:false,reason:"clipboard_failed",text};
  }
}

export function createCsvDownload(state, urlApi=globalThis.URL) {
  const report=buildTimesheetReport(state);
  if (typeof Blob==="undefined" || !urlApi || typeof urlApi.createObjectURL!=="function") {
    return {ok:false,reason:"download_unavailable"};
  }
  const blob=new Blob([timesheetCsv(report)],{type:"text/csv;charset=utf-8"});
  const url=urlApi.createObjectURL(blob);
  return {
    ok:true,
    url,
    filename:createTimesheetFilename(report,"csv"),
    revoke:()=>urlApi.revokeObjectURL?.(url),
  };
}

export function buildPrintableTimesheetHtml(state,{pageSize="A4"}={}) {
  const report=buildTimesheetReport(state);
  const size=pageSize==="LETTER"?"Letter":"A4";
  const dayRows=report.days.filter(day=>day.included).map(day=>{
    const periods=day.periods.map(period=>`<div class="period">${escapeHtml(period.display)}</div>`).join("");
    return `<tr><td><strong>${escapeHtml(day.name)}</strong><br><span>${escapeHtml(day.date)}</span></td><td>${periods}</td><td class="number">${escapeHtml(day.displayTotal)}</td></tr>`;
  }).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Timesheet ${escapeHtml(report.weekStartDate)} to ${escapeHtml(report.weekEndDate)}</title><style>
@page{size:${size};margin:14mm}
*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff;font-size:10.5pt;line-height:1.4;margin:0}
h1{font-size:20pt;margin:0 0 4mm}p{margin:0 0 4mm}.meta{font-size:9pt;color:#333}
table{width:100%;border-collapse:collapse;margin-top:5mm}th,td{border:1px solid #bbb;padding:3mm;text-align:left;vertical-align:top}
th{background:#f1f1f1}.number{text-align:right;white-space:nowrap}.period{margin-bottom:1.5mm}.period:last-child{margin-bottom:0}
.summary{margin-top:6mm;display:grid;grid-template-columns:repeat(3,1fr);gap:3mm}.summary div{border:1px solid #bbb;padding:3mm}.summary strong{display:block;font-size:14pt}
.notes{margin-top:5mm;font-size:8.5pt;color:#333}tr,.summary div{break-inside:avoid}
</style></head><body><main><h1>Timesheet &amp; Work Hours</h1><p>${escapeHtml(report.weekStartDate)} to ${escapeHtml(report.weekEndDate)}</p><p class="meta">Overtime threshold: ${escapeHtml(report.overtimeThresholdHours)} hours · Rounding: ${report.roundingMinutes ? `nearest ${escapeHtml(report.roundingMinutes)} minutes per period` : "none"}</p><table><thead><tr><th>Day</th><th>Work periods</th><th>Total</th></tr></thead><tbody>${dayRows}</tbody></table><section class="summary"><div>Regular<strong>${escapeHtml(report.totals.regular)}</strong></div><div>Overtime<strong>${escapeHtml(report.totals.overtime)}</strong></div><div>Total<strong>${escapeHtml(report.totals.total)}</strong></div></section><p class="notes">Overtime is based only on the user-selected weekly threshold. No employment-law or pay-premium rules are applied.</p></main></body></html>`;
}

export function printTimesheet(state,{pageSize="A4",win=globalThis.window}={}) {
  if (!win || typeof win.open!=="function") return {ok:false,reason:"window_unavailable"};
  const popup=win.open("","_blank");
  if (!popup) return {ok:false,reason:"popup_blocked"};
  try { popup.opener=null; } catch {}
  const html=buildPrintableTimesheetHtml(state,{pageSize});
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  const run=()=>{try{popup.focus();popup.print()}catch{}};
  if (popup.document.readyState==="complete") run();
  else popup.addEventListener("load",run,{once:true});
  return {ok:true};
}
