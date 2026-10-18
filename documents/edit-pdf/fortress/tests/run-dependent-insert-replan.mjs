import { runDependentInsertReplanRegression } from './dependent-insert-replan-regression.js';

try{
  const cases=await runDependentInsertReplanRegression();
  console.log(`PASS ${cases.length}/${cases.length}`);
  for(const item of cases)console.log(`✓ ${item.name}`);
}catch(error){
  console.error(error?.stack||error);
  process.exitCode=1;
}
