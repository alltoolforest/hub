// PDF Compressor v2: isolated production-page mounting surface.
// No shared PDF engine or other AllToolForest tool is imported or mutated.
// The build step must supply a pinned, hash-checked local dist/worker.js.
import {mountCompressor} from './compressor-ui.mjs';
import {createWorkerBridge} from './worker-bridge.mjs';
import {detectDeviceProfile} from './device-policy.mjs';

export async function mount(root){
 if(!root)throw new TypeError('PDF Compressor workspace is missing');
 const profile=detectDeviceProfile();
 const engine=createWorkerBridge({
   fileInput:true,profile:profile.id,
   workerFactory:()=>new Worker(new URL('./dist/worker.js',import.meta.url),{type:'classic'}),
   onProgress:stage=>app?.progress(stage)
 });
 let app=null;
 app=mountCompressor(root,{engine,limits:profile.limits});
 return app;
}
