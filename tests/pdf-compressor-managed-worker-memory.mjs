// Sampled managed worker storage only: excludes main, native/GPU/RSS and missed peaks.
export async function startManagedWorkerSampler(browser){
 const root=await browser.newBrowserCDPSession(),sessions=new Map(),pending=new Map();let sequence=0,busy=false,stopped=false,samples=0;
 const peaks={usedBytes:0,backingBytes:0};
 root.on('Target.receivedMessageFromTarget',event=>{const response=JSON.parse(event.message),item=pending.get(response.id);if(item&&item.sessionId===event.sessionId){pending.delete(response.id);clearTimeout(item.timer);item.resolve(response.result??null);}});
 const heap=sessionId=>new Promise(resolve=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);resolve(null);},500);pending.set(id,{resolve,timer,sessionId});root.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method:'Runtime.getHeapUsage'})}).catch(()=>{const item=pending.get(id);if(item){clearTimeout(item.timer);pending.delete(id);resolve(null);}});});
 const sample=async()=>{
  if(busy||stopped)return;busy=true;
  try{
   const {targetInfos}=await root.send('Target.getTargets'),live=new Set();
   for(const target of targetInfos.filter(t=>t.type==='worker')){live.add(target.targetId);if(!sessions.has(target.targetId))try{const {sessionId}=await root.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});sessions.set(target.targetId,sessionId);}catch{}}
   for(const id of sessions.keys())if(!live.has(id))sessions.delete(id);
   const values=(await Promise.all([...sessions.values()].map(heap))).filter(Boolean);if(values.length){samples++;peaks.usedBytes=Math.max(peaks.usedBytes,values.reduce((s,v)=>s+v.usedSize,0));peaks.backingBytes=Math.max(peaks.backingBytes,values.reduce((s,v)=>s+(v.backingStorageSize??0),0));}
  }catch{}finally{busy=false;}
 };
 const timer=setInterval(sample,100);
 return async()=>{stopped=true;clearInterval(timer);while(busy)await new Promise(resolve=>setTimeout(resolve,10));await root.detach();return {samples,peaks,note:'100ms CDP worker samples; managed counters only, not physical RAM. Main/fixture/native/GPU excluded; transient and unresponsive targets may be missed.'};};
}
