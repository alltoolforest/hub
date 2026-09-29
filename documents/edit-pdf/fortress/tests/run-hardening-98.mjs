import { runHardening98Regressions } from './hardening-98-regression.js';
try{
  const cases=runHardening98Regressions();
  console.log(`PASS ${cases.length}/${cases.length}`);
  for(const item of cases)console.log(`✓ ${item.name}`);
}catch(error){
  console.error('FAIL');
  console.error(error?.stack||error);
  process.exitCode=1;
}
