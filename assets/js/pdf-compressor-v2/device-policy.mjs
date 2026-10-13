// Provisional resource budgets, not measured free RAM or physical-device guarantees.
import {INPUT_LIMITS} from './input-inspector.mjs';
const budget=(id,overrides)=>Object.freeze({id,limits:Object.freeze({...INPUT_LIMITS,...overrides})});
export const DEVICE_PROFILES=Object.freeze({
  standard:budget('standard',{}),
  mobile:budget('mobile',{maxTotalImagePixels:16000000}),
  'mobile-unknown':budget('mobile-unknown',{maxBytes:12*1024*1024,maxPages:200,
    maxObjects:30000,maxGraphEntries:150000,maxImagePixels:6000000,maxTotalImagePixels:12000000}),
  'low-memory':budget('low-memory',{maxBytes:8*1024*1024,maxPages:100,
    maxObjects:25000,maxGraphEntries:125000,maxImagePixels:4000000,maxTotalImagePixels:8000000})
});
export function selectDeviceProfile({deviceMemoryGB,mobile=false}={}){
  const hint=Number.isFinite(deviceMemoryGB)&&deviceMemoryGB>0?deviceMemoryGB:null;
  if(hint!==null&&hint<=2)return DEVICE_PROFILES['low-memory'];
  if(mobile)return DEVICE_PROFILES[hint===null?'mobile-unknown':'mobile'];
  return DEVICE_PROFILES.standard;
}
export function detectDeviceProfile(nav=globalThis.navigator){
  const mobile=Boolean(nav?.userAgentData?.mobile)||/Android|iPhone|iPad|Mobile/i.test(nav?.userAgent??'')||
    (nav?.platform==='MacIntel'&&nav?.maxTouchPoints>1);
  return selectDeviceProfile({deviceMemoryGB:nav?.deviceMemory,mobile});
}
