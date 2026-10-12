// Blueprint Task 8 — isolated lifecycle, cancellation and recovery.
export function createRunController(){
  let current=null;
  return {
    get state(){return current?.status??'idle';},
    start(){
      if(current?.status==='running')throw Error('processing-already-in-progress');
      const token={status:'running',controller:new AbortController()};
      current=token;return token.controller.signal;
    },
    cancel(){
      if(!current||current.status!=='running')return false;
      current.status='cancelled';current.controller.abort();return true;
    },
    complete(signal){
      if(!current||current.controller.signal!==signal||
         current.status!=='running'||signal.aborted)return false;
      current.status='completed';return true;
    },
    fail(signal){
      if(!current||current.controller.signal!==signal||current.status!=='running')
        return false;
      current.status='failed';return true;
    },
    reset(){
      if(current?.status==='running')throw Error('cannot-reset-running-job');
      current=null;return true;
    }
  };
}
