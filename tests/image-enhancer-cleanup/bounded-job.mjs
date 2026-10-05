// Isolated Task 4 experiment. One cleanup attempt per original/job, including
// concurrent/repeated calls. Create a new job explicitly to retry a failed job.
import {restore} from '../image-enhancer-orchestration/orchestrator.mjs';
const copy=frame=>({...frame,data:frame.data.slice()});
export function createBoundedCleanupJob({source,evidence,registry,maxPixels,signal}){
 const original=copy(source),fixedEvidence={...evidence};let attempt;
 return {async run(){
  attempt??=restore({source:original,evidence:fixedEvidence,registry,maxPixels,signal});
  const result=await attempt;
  return {...result,image:copy(result.image),completed:[...result.completed],diagnostics:[...result.diagnostics]};
 }};
}
