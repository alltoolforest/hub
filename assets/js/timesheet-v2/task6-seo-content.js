export const TIMESHEET_SEO = Object.freeze({
  title:"Timesheet & Work Hours Calculator | AllToolForest",
  description:"Track weekly work hours, unpaid breaks, overnight shifts and user-defined overtime. Save locally, export CSV, and print or save your timesheet as PDF.",
  canonicalPath:"/hub/work/timesheet/",
  h1:"Timesheet & Work Hours",
  og:Object.freeze({
    title:"Timesheet & Work Hours Calculator | AllToolForest",
    description:"Calculate weekly work hours, unpaid breaks, overnight shifts and user-defined overtime in your browser.",
    type:"website",
  }),
  structuredData:null,
  structuredDataReason:"No schema is required for launch; avoid adding structured data that does not accurately represent the page.",
});

export const TIMESHEET_GUIDANCE_SECTIONS = Object.freeze([
  Object.freeze({
    id:"how-it-works",
    heading:"How the Timesheet & Work Hours calculator works",
    body:"Choose your week, add one or more work periods for each included day, enter unpaid breaks, and review the calculated daily and weekly totals. The tool supports overnight shifts, optional time rounding, local draft saving, CSV export, and Print / Save PDF.",
  }),
  Object.freeze({
    id:"calculate-work-hours",
    heading:"How work hours are calculated",
    body:"Each work period is calculated from its start and end time. Unpaid break minutes are deducted from that period. Daily totals are the sum of the included work periods, and the weekly total is the sum of the included days.",
  }),
  Object.freeze({
    id:"unpaid-breaks",
    heading:"How unpaid breaks are deducted",
    body:"Enter the total unpaid break for each work period. Unpaid breaks reduce worked time. A break cannot be longer than its work period.",
  }),
  Object.freeze({
    id:"overnight-shifts",
    heading:"How overnight shifts work",
    body:"Enable Ends next day when a shift crosses midnight. For example, a shift from 22:00 to 06:00 is treated as an overnight period instead of an invalid same-day end time.",
  }),
  Object.freeze({
    id:"decimal-hours",
    heading:"Decimal hours vs hours and minutes",
    body:"You can view totals as hours and minutes or as decimal hours. For example, 7 hours 30 minutes equals 7.5 decimal hours. Decimal time should not be read as clock minutes: 7.30 hours is not the same as 7 hours 30 minutes.",
  }),
  Object.freeze({
    id:"weekly-overtime",
    heading:"How weekly overtime is calculated",
    body:"Overtime is calculated only from the weekly threshold you choose. The tool does not apply country, state, union, employer, daily-overtime, double-time, weekend-premium, or payroll rules automatically.",
  }),
  Object.freeze({
    id:"rounding",
    heading:"How time rounding works",
    body:"Rounding is optional and defaults to none. When enabled, each work period is rounded after its unpaid break is deducted and before daily and weekly totals are added together.",
  }),
  Object.freeze({
    id:"who-it-is-for",
    heading:"Timesheets for employees, freelancers and shift workers",
    body:"The tool is designed for people who need a simple weekly record of worked time without creating an account. It can be used for personal records, freelance work, shift tracking, or preparing a timesheet for review.",
  }),
  Object.freeze({
    id:"privacy",
    heading:"Privacy",
    body:"Timesheet calculations run in your browser. If you choose Save this week, the saved draft is stored in this browser on this device. Core timesheet calculations do not send your entries to a server.",
  }),
]);

export const TIMESHEET_FAQ = Object.freeze([
  Object.freeze({
    question:"Can I track more than one work period in a day?",
    answer:"Yes. The launch version supports up to three work periods per day, which can be useful for split shifts or separate blocks of work.",
  }),
  Object.freeze({
    question:"Can I track an overnight shift?",
    answer:"Yes. Mark the work period as ending the next day so a shift that crosses midnight is calculated correctly.",
  }),
  Object.freeze({
    question:"Does the tool know my legal overtime rules?",
    answer:"No. You choose the weekly overtime threshold yourself. The calculator does not provide jurisdiction-specific employment-law or payroll calculations.",
  }),
  Object.freeze({
    question:"Can I save and export my timesheet?",
    answer:"Yes. You can save one weekly draft in this browser, copy a text summary, download CSV, and use Print / Save PDF.",
  }),
]);

export const TIMESHEET_INTERNAL_LINKS = Object.freeze([
  Object.freeze({href:"../../calculators/time-duration/",label:"Time & Duration Calculator"}),
  Object.freeze({href:"../../work/freelance-rate/",label:"Freelance Rate Calculator"}),
  Object.freeze({href:"../../work/invoice/",label:"Invoice Builder"}),
]);
