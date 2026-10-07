const FALLBACK_CURRENCIES=[
  'AED','AUD','BDT','BHD','BRL','CAD','CHF','CNY','CZK','DKK','EGP','EUR','GBP','GHS','HKD','HUF','IDR','ILS','INR','JPY','KES','KRW','KWD','LKR','MAD','MXN','MYR','NGN','NOK','NZD','OMR','PHP','PKR','PLN','QAR','RON','SAR','SEK','SGD','THB','TRY','TWD','TZS','UGX','USD','VND','ZAR'
];

const POW10=[1n];
function pow10(scale){
  if(!Number.isInteger(scale)||scale<0||scale>30)throw Error('Unsupported decimal precision.');
  while(POW10.length<=scale)POW10.push(POW10[POW10.length-1]*10n);
  return POW10[scale];
}

function decimal(value,{name='Value',positive=false,maxScale=12}={}){
  const text=String(value??'').trim();
  if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text))throw Error(name+' must be a valid non-negative number.');
  const [wholeRaw,fraction='']=text.split('.');
  if(fraction.length>maxScale)throw Error(name+' has too many decimal places.');
  const whole=wholeRaw||'0';
  const digits=(whole+fraction).replace(/^0+(?=\d)/,'')||'0';
  const result={int:BigInt(digits),scale:fraction.length,text};
  if(positive&&result.int===0n)throw Error(name+' must be greater than zero.');
  return result;
}

function compareDecimal(value,limit){
  return value.int*pow10(limit.scale)-limit.int*pow10(value.scale);
}

function boundedDecimal(value,{name,positive=false,min,max,maxScale=12}={}){
  const parsed=decimal(value,{name,positive,maxScale});
  if(min!=null&&compareDecimal(parsed,decimal(min,{name,maxScale}))<0)throw Error(name+' must be at least '+min+'.');
  if(max!=null&&compareDecimal(parsed,decimal(max,{name,maxScale}))>0)throw Error(name+' must be at most '+max+'.');
  return parsed;
}

function ceilDivide(numerator,denominator){
  if(numerator<0n||denominator<=0n)throw Error('Invalid calculation values.');
  return numerator===0n?0n:(numerator+denominator-1n)/denominator;
}

function roundHalfUp(numerator,denominator){
  if(numerator<0n||denominator<=0n)throw Error('Invalid calculation values.');
  const quotient=numerator/denominator,remainder=numerator%denominator;
  return remainder*2n>=denominator?quotient+1n:quotient;
}

function safeNumber(value,name='Result'){
  if(value>BigInt(Number.MAX_SAFE_INTEGER))throw Error(name+' is too large for safe calculation.');
  return Number(value);
}

function availableCurrencyCodes(){
  let codes=[];
  try{
    if(typeof Intl.supportedValuesOf==='function')codes=Intl.supportedValuesOf('currency');
  }catch{}
  if(!codes.length)codes=FALLBACK_CURRENCIES;
  return [...new Set(codes.map(code=>String(code).trim().toUpperCase()).filter(code=>/^[A-Z]{3}$/.test(code)))].sort();
}

export function supportedCurrencyCodes(){
  return availableCurrencyCodes();
}

export function normalizeCurrency(currency){
  const code=String(currency||'').trim().toUpperCase();
  if(!/^[A-Z]{3}$/.test(code)||!availableCurrencyCodes().includes(code))throw Error('Choose a supported ISO currency.');
  return code;
}

export function currencyFractionDigits(currency){
  const code=normalizeCurrency(currency);
  return new Intl.NumberFormat('en',{style:'currency',currency:code}).resolvedOptions().maximumFractionDigits;
}

export function amountToMinorUnits(amount,currency){
  const parsed=decimal(amount,{name:'Amount',maxScale:12});
  const digits=currencyFractionDigits(currency);
  return safeNumber(roundHalfUp(parsed.int*pow10(digits),pow10(parsed.scale)),'Amount');
}

export function formatMoney(minorUnits,currency,locale){
  const code=normalizeCurrency(currency);
  if(!Number.isSafeInteger(minorUnits)||minorUnits<0)throw Error('Money value is outside the supported range.');
  const digits=currencyFractionDigits(code),scale=pow10(digits),minor=BigInt(minorUnits);
  const major=minor/scale,fraction=(minor%scale).toString().padStart(digits,'0');
  const formatter=new Intl.NumberFormat(locale||undefined,{
    style:'currency',currency:code,minimumFractionDigits:digits,maximumFractionDigits:digits
  });
  return formatter.formatToParts(major).map(part=>part.type==='fraction'?fraction:part.value).join('');
}

function annualizeMinor(amountMinor,period){
  if(period==='annual')return BigInt(amountMinor);
  if(period==='monthly')return BigInt(amountMinor)*12n;
  throw Error('Period must be monthly or annual.');
}

function percent(value,name,{max='100',allowHundred=true}={}){
  const parsed=boundedDecimal(value,{name,min:'0',max,maxScale:6});
  const hundred=100n*pow10(parsed.scale);
  if(!allowHundred&&parsed.int>=hundred)throw Error(name+' must be below 100%.');
  return parsed;
}

function fractionToNumber(numerator,denominator){
  return Number(numerator)/Number(denominator);
}

function moneyResult(big,name){
  return safeNumber(big,name);
}

export function calculateFreelanceRate(input={}){
  const currency=normalizeCurrency(input.currency||'USD');
  const incomePeriod=input.incomePeriod||'monthly';
  const expensePeriod=input.expensePeriod||incomePeriod;
  const targetIncomeMinor=amountToMinorUnits(input.targetPersonalIncome??0,currency);
  if(targetIncomeMinor<=0)throw Error('Target personal income must be greater than zero.');
  const expensesMinor=amountToMinorUnits(input.businessExpenses??0,currency);

  const tax=percent(input.taxReservePercent??0,'Tax reserve',{max:'95',allowHundred:false});
  const buffer=percent(input.contingencyPercent??0,'Contingency buffer',{max:'100'});
  const weeks=boundedDecimal(input.workingWeeksPerYear??48,{name:'Working weeks per year',positive:true,min:'1',max:'52',maxScale:6});
  const weeklyHours=boundedDecimal(input.weeklyHours??40,{name:'Weekly work hours',positive:true,min:'0.1',max:'168',maxScale:6});
  const billable=percent(input.billablePercent??60,'Billable share',{max:'100'});
  if(billable.int===0n)throw Error('Billable share must be greater than zero.');
  const clientDay=boundedDecimal(input.clientDayHours??8,{name:'Client day hours',positive:true,min:'0.1',max:'24',maxScale:6});

  const targetAnnual=annualizeMinor(targetIncomeMinor,incomePeriod);
  const expensesAnnual=annualizeMinor(expensesMinor,expensePeriod);

  const taxScale=pow10(tax.scale),hundredTax=100n*taxScale;
  const grossPersonalAnnual=tax.int===0n
    ?targetAnnual
    :ceilDivide(targetAnnual*hundredTax,hundredTax-tax.int);
  const minimumRevenueAnnual=grossPersonalAnnual+expensesAnnual;

  const bufferScale=pow10(buffer.scale),hundredBuffer=100n*bufferScale;
  const recommendedRevenueAnnual=buffer.int===0n
    ?minimumRevenueAnnual
    :ceilDivide(minimumRevenueAnnual*(hundredBuffer+buffer.int),hundredBuffer);

  const availableNumerator=weeks.int*weeklyHours.int;
  const availableDenominator=pow10(weeks.scale+weeklyHours.scale);
  const billableNumerator=availableNumerator*billable.int;
  const billableDenominator=availableDenominator*100n*pow10(billable.scale);
  if(billableNumerator<=0n)throw Error('Annual billable hours must be greater than zero.');

  const minimumHourly=ceilDivide(minimumRevenueAnnual*billableDenominator,billableNumerator);
  const recommendedHourly=ceilDivide(recommendedRevenueAnnual*billableDenominator,billableNumerator);

  const clientDayDenominator=pow10(clientDay.scale);
  const minimumDay=ceilDivide(minimumHourly*clientDay.int,clientDayDenominator);
  const recommendedDay=ceilDivide(recommendedHourly*clientDay.int,clientDayDenominator);

  const result={
    currency,
    fractionDigits:currencyFractionDigits(currency),
    targetPersonalIncomeAnnualMinor:moneyResult(targetAnnual,'Annual target income'),
    grossPersonalIncomeAnnualMinor:moneyResult(grossPersonalAnnual,'Annual gross personal income'),
    businessExpensesAnnualMinor:moneyResult(expensesAnnual,'Annual business expenses'),
    minimumRevenueAnnualMinor:moneyResult(minimumRevenueAnnual,'Annual minimum revenue'),
    recommendedRevenueAnnualMinor:moneyResult(recommendedRevenueAnnual,'Annual recommended revenue'),
    minimumMonthlyRevenueMinor:moneyResult(ceilDivide(minimumRevenueAnnual,12n),'Monthly minimum revenue'),
    recommendedMonthlyRevenueMinor:moneyResult(ceilDivide(recommendedRevenueAnnual,12n),'Monthly recommended revenue'),
    minimumHourlyRateMinor:moneyResult(minimumHourly,'Minimum hourly rate'),
    recommendedHourlyRateMinor:moneyResult(recommendedHourly,'Recommended hourly rate'),
    minimumClientDayRateMinor:moneyResult(minimumDay,'Minimum client day rate'),
    recommendedClientDayRateMinor:moneyResult(recommendedDay,'Recommended client day rate'),
    annualAvailableHours:fractionToNumber(availableNumerator,availableDenominator),
    annualBillableHours:fractionToNumber(billableNumerator,billableDenominator),
    assumptions:{
      incomePeriod,
      expensePeriod,
      taxReservePercent:String(input.taxReservePercent??0),
      contingencyPercent:String(input.contingencyPercent??0),
      workingWeeksPerYear:String(input.workingWeeksPerYear??48),
      weeklyHours:String(input.weeklyHours??40),
      billablePercent:String(input.billablePercent??60),
      clientDayHours:String(input.clientDayHours??8)
    }
  };
  return result;
}

export function calculateCurrentMonthlyEstimate(input={}){
  const income=boundedDecimal(input.monthlyIncome??0,{name:'Desired monthly income',min:'0',maxScale:12});
  const costs=boundedDecimal(input.monthlyCosts??0,{name:'Monthly business costs',min:'0',maxScale:12});
  const days=boundedDecimal(input.workingDaysPerMonth??22,{name:'Working days per month',positive:true,min:'1',max:'31',maxScale:6});
  const hours=boundedDecimal(input.hoursPerWorkingDay??8,{name:'Hours per working day',positive:true,min:'0.1',max:'24',maxScale:6});
  const billable=percent(input.billablePercent??60,'Billable share',{max:'100'});
  if(billable.int===0n)throw Error('Billable share must be greater than zero.');

  const moneyScale=Math.max(income.scale,costs.scale);
  const totalInt=income.int*pow10(moneyScale-income.scale)+costs.int*pow10(moneyScale-costs.scale);
  const billableNumerator=days.int*hours.int*billable.int;
  const billableDenominator=pow10(days.scale+hours.scale)*100n*pow10(billable.scale);
  const rateNumerator=totalInt*billableDenominator;
  const rateDenominator=pow10(moneyScale)*billableNumerator;
  const hourly=Number(rateNumerator)/Number(rateDenominator);
  const dayHours=Number(hours.int)/Number(pow10(hours.scale));
  const billableHours=Number(billableNumerator)/Number(billableDenominator);
  if(!Number.isFinite(hourly)||!Number.isFinite(billableHours))throw Error('The estimate could not be calculated.');
  return {hourlyRate:hourly,dailyRate:hourly*dayHours,billableHoursPerMonth:billableHours};
}
