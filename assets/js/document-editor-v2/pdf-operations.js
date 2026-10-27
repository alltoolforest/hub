// Serialize workspace snapshots/exports so autosave cannot occupy the PDF
// engine while Export is preparing its result. Wait only for applied edits.
export function pdfOperationQueue(getEditor,{timeout=60000,interval=25}={}){
  let tail=Promise.resolve();
  async function ready(){
    const started=Date.now();
    for(;;){
      const editor=getEditor();if(!editor)throw new Error('PDF session is closed.');
      const state=editor.getState();
      if(!state.busy&&!state.viewBusy&&!state.commitPending){
        if(state.hasPendingEdit)throw new Error('Press Done to finish the current PDF edit, or cancel it, before exporting or saving.');
        return;
      }
      if(Date.now()-started>=timeout)throw new Error('The PDF operation is still running. Wait for it to finish, then retry.');
      await new Promise(resolve=>setTimeout(resolve,interval));
    }
  }
  return {ready,run(task){const result=tail.catch(()=>{}).then(async()=>{await ready();return task();});tail=result;return result;}};
}
