// Branch-only deterministic finance tests for AllToolForest Loan & EMI Calculator.
// Run with: node calculators/loan/loan-engine.test.mjs
const close=(a,b,t=0.02)=>Math.abs(a-b)<=t;
function finalize(P,s){return{payment:s[0]?.payment||0,total:s.reduce((a,x)=>a+x.payment,0),interest:s.reduce((a,x)=>a+x.interest,0),schedule:s,principal:P}}
function equalPrincipal(P,n,totalInterest){let bal=P,s=[];const basePrincipal=P/n,baseInterest=totalInterest/n;for(let i=1;i<=n;i++){const principal=i===n?bal:basePrincipal,interest=baseInterest,payment=principal+interest;bal=Math.max(0,bal-principal);s.push({period:i,payment,principal,interest,balance:bal})}return finalize(P,s)}
function fixedInstallment(P,n,totalInterest){const payment=(P+totalInterest)/n,principal=P/n,interest=totalInterest/n,s=[];let bal=P;for(let i=1;i<=n;i++){const pr=i===n?bal:principal,pay=i===n?pr+interest:payment;bal=Math.max(0,bal-pr);s.push({period:i,payment:pay,principal:pr,interest,balance:bal})}return finalize(P,s)}
function reducing(P,annual,n){if(annual===0)return equalPrincipal(P,n,0);const r=annual/1200,pow=Math.pow(1+r,n),regular=P*r*pow/(pow-1);let bal=P,s=[];for(let i=1;i<=n;i++){const interest=bal*r;let principal=regular-interest,payment=regular;if(i===n||principal>bal){principal=bal;payment=principal+interest}bal=Math.max(0,bal-principal);s.push({period:i,payment,principal,interest,balance:bal})}return finalize(P,s)}
function flat(P,annual,n){return fixedInstallment(P,n,P*(annual/100)*(n/12))}
function interestOnly(P,annual,n){const monthly=P*(annual/1200),s=[];for(let i=1;i<=n;i++){const principal=i===n?P:0,interest=monthly;s.push({period:i,payment:principal+interest,principal,interest,balance:i===n?0:P})}return finalize(P,s)}
const tests=[];
function test(name,fn){try{fn();tests.push([name,true])}catch(e){tests.push([name,false,e.message])}}
function ok(v,msg){if(!v)throw Error(msg)}
test('Reducing: ₹500,000 at 10% for 60 months',()=>{const x=reducing(500000,10,60);ok(close(x.payment,10623.52,0.05),'EMI mismatch '+x.payment);ok(close(x.interest,137411.2,1),'interest mismatch '+x.interest);ok(x.schedule.length===60,'schedule length');ok(close(x.schedule.at(-1).balance,0),'final balance')});
test('Reducing: zero-interest exact principal recovery',()=>{const x=reducing(100000,0,12);ok(close(x.total,100000),'total');ok(close(x.interest,0),'interest');ok(close(x.schedule.reduce((a,r)=>a+r.principal,0),100000),'principal')});
test('Flat: ₹100,000 at 12% for 12 months',()=>{const x=flat(100000,12,12);ok(close(x.interest,12000),'interest');ok(close(x.payment,9333.333333,0.01),'payment');ok(close(x.total,112000),'total')});
test('Interest-only: ₹100,000 at 12% for 12 months',()=>{const x=interestOnly(100000,12,12);ok(close(x.payment,1000),'initial payment');ok(close(x.interest,12000),'interest');ok(close(x.total,112000),'total');ok(close(x.schedule.at(-1).payment,101000),'balloon')});
test('Long tenure remains finite',()=>{const x=reducing(10000000,15,1200);ok(Number.isFinite(x.payment)&&Number.isFinite(x.total),'non-finite');ok(close(x.schedule.at(-1).balance,0),'balance')});
test('Every schedule preserves principal',()=>{for(const x of [reducing(1234567,8.75,241),flat(765432,11.2,37),interestOnly(333333,9.9,19)])ok(close(x.schedule.reduce((a,r)=>a+r.principal,0),x.principal,0.05),'principal mismatch')});
let failed=0;for(const [name,pass,msg] of tests){console.log(pass?'PASS':'FAIL',name,msg||'');if(!pass)failed++}console.log(`${tests.length-failed}/${tests.length} tests passed`);if(failed)process.exitCode=1;