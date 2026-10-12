import {restrainedTonePlan} from '../../research/tone-r2.js';
import {finishStrip} from '../../research/finish-r3.js';
import {detailStrip} from '../../research/detail-r4.js';
import {validateFaces} from './photo-faces.js';

export function experimentControls(value={},width,height){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid experiment settings');
 const {tone='pr171',brightness=0,contrast=0,detail=0,faceReview='unreviewed',regions=[]}=value;
 if(!['pr171','restrained'].includes(tone)||![brightness,contrast,detail].every(v=>Number.isFinite(v)&&v>=0&&v<=100))throw new Error('Use experiment controls from 0 to 100');
 if(!['unreviewed','no-faces','protected'].includes(faceReview))throw new Error('Invalid face review');
 const faces=validateFaces(regions,width,height);
 if(faceReview==='no-faces'&&faces.length)throw new Error('Face review conflicts with protected regions');
 if(detail>0&&(faceReview==='unreviewed'||(faceReview==='protected'&&!faces.length)))throw new Error('Review faces and provide protection before enabling detail');
 return {tone,brightness,contrast,detail,faceReview,faces};
}
export function detailDecision(controls,plan,sourceMime){
 if(!controls.detail)return {enabled:false,reason:'Off'};
 if(plan.graphic)return {enabled:false,reason:'Detail withheld for text/graphics'};
 if(plan.portrait&&controls.faceReview!=='protected')return {enabled:false,reason:'Portrait detail requires protected face regions'};
 // The JPEG regression corpus failed R4; do not claim a qualified JPEG gate.
 // File type alone cannot detect artifacts inherited by re-encoded PNG/WebP.
 if(sourceMime==='image/jpeg')return {enabled:false,reason:'Detail withheld for JPEG: quality regression gate unmet'};
 if(plan.noise>2.5||plan.chromaNoise>3||plan.blockStrength>.1)return {enabled:false,reason:'Detail withheld: noise or block-artifact evidence'};
 return {enabled:true,reason:'User-selected research detail; face review acknowledged, source confidence still heuristic'};
}
export function controlledPlan(plan,controls){return controls.tone==='restrained'&&!plan.graphic?restrainedTonePlan(plan):plan;}
export function finishControlled(data,controls){
 return controls.brightness||controls.contrast?finishStrip(data,{brightness:controls.brightness*.0013,contrast:controls.contrast*.0042}):data;
}
// Read original strips with PR171 halo PLUS detail halo. Render the core over
// the expanded detail region, then crop only after the source-guided stage.
// This avoids seams without allocating another full-resolution canvas.
export function renderControlledStrip(engine,input,width,height,start,rows,plan,controls,decision,{offsetY=0,faces=[]}={}){
 const first=decision.enabled?Math.max(0,start-4):start;
 const last=decision.enabled?Math.min(height,start+rows+4):start+rows;
 const core=engine.enhancePhotoStrip(input,width,height,first,last-first,plan,{offsetY,faces});
 const finished=finishControlled(core,controls);
 if(!decision.enabled)return finished;
 return detailStrip(finished,input.subarray(first*width*4,last*width*4),width,last-first,start-first,rows,{offsetY:offsetY+first,noise:Math.max(1,plan.noise),faces:controls.faces,faceReviewComplete:true,amount:controls.detail/100});
}
