import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const src=await readFile(new URL('../assets/js/image-enhancer-heic.js',import.meta.url),'utf8'),body=src.slice(src.indexOf('function withTimeout('),src.indexOf('async function sha256Hex'));
const timers=new Map();let id=0;const ctx={setTimeout(f){timers.set(++id,f);return id;},clearTimeout(i){timers.delete(i);}};vm.createContext(ctx);vm.runInContext(body,ctx);
let finish,closed=0;const pending=new Promise(r=>finish=r);const timed=ctx.withTimeout(pending,5,'timeout',v=>v.close());const check=assert.rejects(timed,/timeout/);timers.values().next().value();await check;finish({close(){closed++;}});await Promise.resolve();await Promise.resolve();assert.equal(closed,1);
timers.clear();closed=0;const bitmap={close(){closed++;}};assert.equal(await ctx.withTimeout(Promise.resolve(bitmap),5,'timeout',v=>v.close()),bitmap);assert.equal(closed,0);assert.equal(timers.size,0);
await assert.rejects(ctx.withTimeout(Promise.reject(Error('decode error')),5,'timeout'),/decode error/);assert.equal(timers.size,0);
console.log('PASS HEIC late bitmap release, successful bitmap ownership, rejection and timer cleanup (mock timing)');
