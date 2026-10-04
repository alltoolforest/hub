import { WEEK_START, DISPLAY_FORMAT } from "./contracts.js";
import { createTimesheetState, buildWeekDates } from "./week-model.js";
import { calculatePeriod, calculateTimesheet, addPeriod, removePeriod, findOverlaps } from "./engine.js";
import { decimalHours, formatHoursMinutes } from "./time-math.js";

const assert=(condition,message)=>{if(!condition)throw new Error(message);};

function stateFor(date="2026-10-05",weekStart=WEEK_START.MONDAY){
  return createTimesheetState({weekStartDate:date,weekStart,overtimeThresholdHours:40,roundingMinutes:0,displayFormat:DISPLAY_FORMAT.HOURS_MINUTES});
}

export function runTask1Regression(){
  const normal=calculatePeriod({start:"09:00",end:"17:00",unpaidBreakMinutes:30,nextDay:false},0);
  assert(normal.rawMinutes===450,"09:00-17:00 minus 30 must equal 450 minutes.");
  assert(normal.hoursMinutes==="7h 30m","450 minutes should display as 7h 30m.");
  assert(normal.decimalHours===7.5,"450 minutes should equal 7.5 decimal hours.");

  const overnight=calculatePeriod({start:"22:00",end:"06:00",unpaidBreakMinutes:30,nextDay:true},0);
  assert(overnight.rawMinutes===450,"Overnight duration should equal 450 minutes.");

  const equalSame=calculatePeriod({start:"09:00",end:"09:00",unpaidBreakMinutes:0,nextDay:false},0);
  const equalNext=calculatePeriod({start:"09:00",end:"09:00",unpaidBreakMinutes:0,nextDay:true},0);
  assert(equalSame.rawMinutes===0,"Equal same-day times must mean zero.");
  assert(equalNext.rawMinutes===1440,"Equal next-day times must mean 24 hours.");

  let threw=false;
  try{calculatePeriod({start:"09:00",end:"10:00",unpaidBreakMinutes:61,nextDay:false},0)}catch{threw=true}
  assert(threw,"Break longer than shift must fail.");

  const rounded5=calculatePeriod({start:"09:00",end:"10:02",unpaidBreakMinutes:0,nextDay:false},5);
  const rounded6=calculatePeriod({start:"09:00",end:"10:02",unpaidBreakMinutes:0,nextDay:false},6);
  const rounded10=calculatePeriod({start:"09:00",end:"10:06",unpaidBreakMinutes:0,nextDay:false},10);
  const rounded15=calculatePeriod({start:"09:00",end:"10:08",unpaidBreakMinutes:0,nextDay:false},15);
  assert(rounded5.roundedMinutes===60,"Nearest 5-minute rounding failed.");
  assert(rounded6.roundedMinutes===60,"Nearest 6-minute rounding failed.");
  assert(rounded10.roundedMinutes===70,"Nearest 10-minute rounding failed.");
  assert(rounded15.roundedMinutes===75,"Nearest 15-minute rounding failed.");

  const multi=stateFor();
  multi.days[0].periods=[
    {start:"08:00",end:"12:00",unpaidBreakMinutes:0,nextDay:false},
    {start:"13:00",end:"17:00",unpaidBreakMinutes:0,nextDay:false},
  ];
  const multiResult=calculateTimesheet(multi);
  assert(multiResult.days[0].result.totalMinutes===480,"Two periods should aggregate to 8 hours.");

  const overlap=[
    {start:"08:00",end:"12:00",unpaidBreakMinutes:0,nextDay:false},
    {start:"11:30",end:"15:00",unpaidBreakMinutes:0,nextDay:false},
  ];
  assert(findOverlaps(overlap).length===1,"Overlapping periods must be detected.");

  threw=false;
  const badOverlap=stateFor();
  badOverlap.days[0].periods=overlap;
  try{calculateTimesheet(badOverlap)}catch{threw=true}
  assert(threw,"Overlapping periods must be rejected.");

  const overtime=stateFor();
  for(let i=0;i<5;i+=1) overtime.days[i].periods=[{start:"09:00",end:"18:00",unpaidBreakMinutes:30,nextDay:false}];
  const overtimeResult=calculateTimesheet(overtime);
  assert(overtimeResult.totals.totalMinutes===2550,"Five 8.5-hour days should total 42.5 hours.");
  assert(overtimeResult.totals.overtimeMinutes===150,"42.5 hours at 40-hour threshold should produce 2.5 overtime hours.");
  assert(overtimeResult.totals.regularMinutes===2400,"Regular time should remain 40 hours.");

  const zeroThreshold=stateFor();
  zeroThreshold.overtimeThresholdHours=0;
  zeroThreshold.days.forEach(day=>day.included=false);
  zeroThreshold.days[0].included=true;
  zeroThreshold.days[0].periods=[{start:"09:00",end:"10:00",unpaidBreakMinutes:0,nextDay:false}];
  assert(calculateTimesheet(zeroThreshold).totals.overtimeMinutes===60,"Zero threshold should classify all work as overtime.");

  const monday=buildWeekDates("2026-10-07",WEEK_START.MONDAY);
  assert(monday[0].date==="2026-10-05"&&monday[0].name==="Monday","Monday week normalization failed.");
  const sunday=buildWeekDates("2026-10-07",WEEK_START.SUNDAY);
  assert(sunday[0].date==="2026-10-04"&&sunday[0].name==="Sunday","Sunday week normalization failed.");

  const yearCross=buildWeekDates("2026-12-31",WEEK_START.MONDAY);
  assert(yearCross[0].date==="2026-12-28"&&yearCross[6].date==="2027-01-03","Year crossover week failed.");
  const leap=buildWeekDates("2028-02-29",WEEK_START.MONDAY);
  assert(leap.some(day=>day.date==="2028-02-29"),"Leap-day week must preserve February 29.");

  const limits=stateFor();
  let day=limits.days[0];
  day=addPeriod(day,{start:"12:00",end:"13:00",unpaidBreakMinutes:0,nextDay:false});
  day=addPeriod(day,{start:"14:00",end:"15:00",unpaidBreakMinutes:0,nextDay:false});
  assert(day.periods.length===3,"Three periods should be supported.");
  threw=false;try{addPeriod(day)}catch{threw=true}
  assert(threw,"A fourth period must be rejected.");
  day=removePeriod(day,2);
  assert(day.periods.length===2,"Period removal failed.");

  assert(formatHoursMinutes(90)==="1h 30m","Hours/minutes formatter failed.");
  assert(decimalHours(90)===1.5,"Decimal formatter equivalence failed.");

  return {
    pass:true,
    normalShift:true,
    overnight:true,
    equalTimes:true,
    breakValidation:true,
    multiPeriod:true,
    overlapGuard:true,
    overtime:true,
    zeroThreshold:true,
    weekStartMonday:true,
    weekStartSunday:true,
    yearCrossover:true,
    leapYear:true,
    rounding:[5,6,10,15],
    maxPeriods:3,
    formatEquivalence:true,
    roundingPolicy:"per_period_after_unpaid_break_before_daily_and_weekly_aggregation",
  };
}
