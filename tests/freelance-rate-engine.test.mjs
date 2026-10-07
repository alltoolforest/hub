import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  supportedCurrencyCodes,
  normalizeCurrency,
  currencyFractionDigits,
  amountToMinorUnits,
  formatMoney,
  calculateFreelanceRate,
  calculateCurrentMonthlyEstimate
} from '../assets/js/freelance-rate-engine.js';

const approx=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<=tolerance,`Expected ${actual} ≈ ${expected}`);

for(const code of ['USD','EUR','GBP','INR','JPY','KWD']){
  assert.ok(supportedCurrencyCodes().includes(code),'Expected supported currency '+code);
}
assert.equal(normalizeCurrency('usd'),'USD');
assert.equal(currencyFractionDigits('USD'),2);
assert.equal(currencyFractionDigits('JPY'),0);
assert.equal(currencyFractionDigits('KWD'),3);
assert.equal(amountToMinorUnits('12.345','USD'),1235);
assert.equal(amountToMinorUnits('12.4','JPY'),12);
assert.equal(amountToMinorUnits('1.2345','KWD'),1235);
assert.match(formatMoney(7032,'USD','en-US'),/70\.32/);
assert.match(formatMoney(5730,'JPY','ja-JP'),/5,730/);
assert.match(formatMoney(10417,'KWD','en-US'),/10\.417/);

const baseline=calculateFreelanceRate({
  currency:'USD',
  targetPersonalIncome:'5000',
  incomePeriod:'monthly',
  businessExpenses:'500',
  expensePeriod:'monthly',
  taxReservePercent:'20',
  workingWeeksPerYear:'48',
  weeklyHours:'40',
  billablePercent:'60',
  contingencyPercent:'10',
  clientDayHours:'8'
});
assert.equal(baseline.targetPersonalIncomeAnnualMinor,6000000);
assert.equal(baseline.grossPersonalIncomeAnnualMinor,7500000);
assert.equal(baseline.businessExpensesAnnualMinor,600000);
assert.equal(baseline.minimumRevenueAnnualMinor,8100000);
assert.equal(baseline.recommendedRevenueAnnualMinor,8910000);
assert.equal(baseline.minimumMonthlyRevenueMinor,675000);
assert.equal(baseline.recommendedMonthlyRevenueMinor,742500);
assert.equal(baseline.minimumHourlyRateMinor,7032);
assert.equal(baseline.recommendedHourlyRateMinor,7735);
assert.equal(baseline.minimumClientDayRateMinor,56256);
assert.equal(baseline.recommendedClientDayRateMinor,61880);
assert.equal(baseline.annualAvailableHours,1920);
assert.equal(baseline.annualBillableHours,1152);

const annualEquivalent=calculateFreelanceRate({
  currency:'USD',
  targetPersonalIncome:'60000',
  incomePeriod:'annual',
  businessExpenses:'6000',
  expensePeriod:'annual',
  taxReservePercent:'20',
  workingWeeksPerYear:'48',
  weeklyHours:'40',
  billablePercent:'60',
  contingencyPercent:'10',
  clientDayHours:'8'
});
assert.deepEqual(
  {
    min:annualEquivalent.minimumHourlyRateMinor,
    rec:annualEquivalent.recommendedHourlyRateMinor,
    revenue:annualEquivalent.recommendedRevenueAnnualMinor
  },
  {
    min:baseline.minimumHourlyRateMinor,
    rec:baseline.recommendedHourlyRateMinor,
    revenue:baseline.recommendedRevenueAnnualMinor
  }
);

const jpy=calculateFreelanceRate({
  currency:'JPY',
  targetPersonalIncome:'500000',
  incomePeriod:'monthly',
  businessExpenses:'50000',
  expensePeriod:'monthly',
  taxReservePercent:'0',
  workingWeeksPerYear:'48',
  weeklyHours:'40',
  billablePercent:'60',
  contingencyPercent:'0',
  clientDayHours:'8'
});
assert.equal(jpy.minimumRevenueAnnualMinor,6600000);
assert.equal(jpy.minimumHourlyRateMinor,5730);
assert.equal(jpy.recommendedHourlyRateMinor,5730);

const kwd=calculateFreelanceRate({
  currency:'KWD',
  targetPersonalIncome:'1000',
  incomePeriod:'monthly',
  businessExpenses:'0',
  expensePeriod:'monthly',
  taxReservePercent:'0',
  workingWeeksPerYear:'48',
  weeklyHours:'40',
  billablePercent:'60',
  contingencyPercent:'0',
  clientDayHours:'8'
});
assert.equal(kwd.minimumRevenueAnnualMinor,12000000);
assert.equal(kwd.minimumHourlyRateMinor,10417);
assert.match(formatMoney(kwd.minimumHourlyRateMinor,'KWD','en-US'),/10\.417/);

const noTax=calculateFreelanceRate({
  currency:'USD',targetPersonalIncome:'5000',businessExpenses:'500',
  taxReservePercent:'0',workingWeeksPerYear:'48',weeklyHours:'40',
  billablePercent:'60',contingencyPercent:'0',clientDayHours:'8'
});
assert.equal(noTax.grossPersonalIncomeAnnualMinor,noTax.targetPersonalIncomeAnnualMinor);
assert.equal(noTax.minimumRevenueAnnualMinor,6600000);
assert.equal(noTax.minimumHourlyRateMinor,noTax.recommendedHourlyRateMinor);

const highTax=calculateFreelanceRate({
  currency:'USD',targetPersonalIncome:'5000',businessExpenses:'500',
  taxReservePercent:'50',workingWeeksPerYear:'48',weeklyHours:'40',
  billablePercent:'60',contingencyPercent:'0',clientDayHours:'8'
});
assert.ok(highTax.minimumHourlyRateMinor>noTax.minimumHourlyRateMinor);

const higherCosts=calculateFreelanceRate({
  currency:'USD',targetPersonalIncome:'5000',businessExpenses:'1500',
  taxReservePercent:'0',workingWeeksPerYear:'48',weeklyHours:'40',
  billablePercent:'60',contingencyPercent:'0',clientDayHours:'8'
});
assert.ok(higherCosts.minimumHourlyRateMinor>noTax.minimumHourlyRateMinor);

const lessTime=calculateFreelanceRate({
  currency:'USD',targetPersonalIncome:'5000',businessExpenses:'500',
  taxReservePercent:'0',workingWeeksPerYear:'40',weeklyHours:'40',
  billablePercent:'60',contingencyPercent:'0',clientDayHours:'8'
});
assert.ok(lessTime.minimumHourlyRateMinor>noTax.minimumHourlyRateMinor);
assert.ok(lessTime.annualBillableHours<noTax.annualBillableHours);

const lowerUtilization=calculateFreelanceRate({
  currency:'USD',targetPersonalIncome:'5000',businessExpenses:'500',
  taxReservePercent:'0',workingWeeksPerYear:'48',weeklyHours:'40',
  billablePercent:'40',contingencyPercent:'0',clientDayHours:'8'
});
assert.ok(lowerUtilization.minimumHourlyRateMinor>noTax.minimumHourlyRateMinor);
assert.equal(lowerUtilization.annualBillableHours,768);

const maxBillable=calculateFreelanceRate({
  currency:'USD',targetPersonalIncome:'5000',businessExpenses:'500',
  taxReservePercent:'0',workingWeeksPerYear:'48',weeklyHours:'40',
  billablePercent:'100',contingencyPercent:'0',clientDayHours:'7.5'
});
assert.equal(maxBillable.annualBillableHours,1920);
assert.ok(maxBillable.minimumClientDayRateMinor>=maxBillable.minimumHourlyRateMinor*7.5);

assert.throws(()=>calculateFreelanceRate({currency:'NOT',targetPersonalIncome:'1'}),/supported ISO currency/);
assert.throws(()=>calculateFreelanceRate({currency:'USD',targetPersonalIncome:'0'}),/greater than zero/);
assert.throws(()=>calculateFreelanceRate({currency:'USD',targetPersonalIncome:'1',taxReservePercent:'100'}),/at most 95|below 100/);
assert.throws(()=>calculateFreelanceRate({currency:'USD',targetPersonalIncome:'1',billablePercent:'0'}),/greater than zero/);
assert.throws(()=>calculateFreelanceRate({currency:'USD',targetPersonalIncome:'1',workingWeeksPerYear:'53'}),/at most 52/);
assert.throws(()=>calculateFreelanceRate({currency:'USD',targetPersonalIncome:'1',weeklyHours:'169'}),/at most 168/);
assert.throws(()=>calculateFreelanceRate({currency:'USD',targetPersonalIncome:'1',clientDayHours:'25'}),/at most 24/);

const legacy=calculateCurrentMonthlyEstimate({
  monthlyIncome:'50000',
  monthlyCosts:'5000',
  workingDaysPerMonth:'22',
  hoursPerWorkingDay:'8',
  billablePercent:'60'
});
approx(legacy.billableHoursPerMonth,105.6);
approx(legacy.hourlyRate,55000/105.6);
approx(legacy.dailyRate,(55000/105.6)*8);

for(const values of [
  ['1000','100','20','6','50'],
  ['25000','0','15','7.5','75'],
  ['0','500','10','4','100']
]){
  const [income,costs,days,hours,billable]=values;
  const estimate=calculateCurrentMonthlyEstimate({
    monthlyIncome:income,monthlyCosts:costs,workingDaysPerMonth:days,
    hoursPerWorkingDay:hours,billablePercent:billable
  });
  const expectedHours=Number(days)*Number(hours)*Number(billable)/100;
  approx(estimate.billableHoursPerMonth,expectedHours);
  approx(estimate.hourlyRate,(Number(income)+Number(costs))/expectedHours);
}

const [appSource,moduleSource]=await Promise.all([
  readFile('assets/js/app.js','utf8'),
  readFile('assets/js/freelance-rate.js','utf8')
]);
const isolatedRoute="else if(slug==='freelance-rate')mod=await import('./freelance-rate.js');";
assert.ok(appSource.includes(isolatedRoute),'Freelance Rate must route to its isolated module.');
assert.ok(moduleSource.includes("from './freelance-rate-engine.js'"),'Standalone module must use the dedicated engine.');
assert.ok(moduleSource.includes('Desired personal income'),'Approved Task 2 income-goal workflow must remain present.');
assert.ok(moduleSource.includes('Tax planning reserve (%)'),'Approved Task 2 tax-planning input must remain present.');
assert.ok(moduleSource.includes("supportedCurrencyCodes()"),'Approved Task 2 ISO currency selector must remain present.');
assert.ok(moduleSource.includes('Minimum sustainable hourly rate'),'Approved Task 2 minimum-rate output must remain present.');
assert.ok(moduleSource.includes('Recommended hourly rate'),'Approved Task 2 recommended-rate output must remain present.');

console.log('PASS: Freelance Rate engine, isolation and approved-UX regression passed.');
