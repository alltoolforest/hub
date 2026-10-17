import {pdfSearch} from '../pdf-search.js';
// Adapter for the isolated native/OCR engine. The public Edit PDF is untouched.
const base = new URL('../../../../documents/document-editor-v2-lab/pdf-engine/', import.meta.url);
export async function open(file, format) {
  if(format !== 'pdf')throw new Error('Unsupported PDF format.');
  const [main,hybrid,precision,anchors,smart] = await Promise.all([
    import(new URL('fortress/src/main.js',base)),import(new URL('ocr/hybrid-editor.js',base)),
    import(new URL('fortress/src/font-size-precision.js',base)),import(new URL('fortress/src/insert-anchor-bridge.js',base)),
    import(new URL('fortress/src/smart-line-insertion-v8.js',base))
  ]);
  await main.configurePdfWorker(new URL('../../edit-pdf/fortress/vendor/pdf.worker.compat.mjs',base).href);
  for(const path of ['fortress/src/styles.css','fortress/src/font-size-precision.css','ocr/styles.css']){
    const href=new URL(path,base).href;
    if(![...document.querySelectorAll('link[rel=stylesheet]')].some(link=>link.href===href)){
      const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link);
    }
  }
  let active=null,host=null,notify=()=>{},revision=0,disposed=false;
  async function candidate(draft){
    const shell=document.createElement('div'),app=document.createElement('div'),status=document.createElement('p');
    status.setAttribute('role','status');shell.append(status,app);
    let editor=null,ready=false;
    app.addEventListener('input',()=>{if(ready&&active?.editor===editor)notify();});
    const extensions=[precision.attachPrecisionFontSize({app,getEditor:()=>editor}),anchors.attachInsertAnchorBridge({app,getEditor:()=>editor})];
    const insertion=smart.attachSmartLineInsertion({app,getEditor:()=>editor});extensions.push(insertion);
    const close=async()=>{for(const extension of extensions)extension.destroy();await editor?.destroy();shell.remove();};
    editor=hybrid.createHybridPdfEditor({container:app,
      prepareNativeDocument:value=>insertion.prepareDocument(value),
      onChange:()=>{if(ready&&active?.editor===editor){revision++;notify();}},
      onStatus:message=>{status.textContent=message;},onWarning:warning=>{status.textContent=warning.message||warning.code;},
      onError:error=>{status.textContent=error.message;}});
    try{
      await editor.open(file,draft?.state);
      // The shared workspace owns these actions, including OCR history.
      for(const button of app.querySelectorAll('.hybrid-toolbar button'))if(['Close','Save a copy'].includes(button.textContent))button.hidden=true;
      for(const label of ['Undo','Redo'])for(const button of app.querySelectorAll(`button[aria-label="${label}"]`))button.hidden=true;
      shell.prepend(pdfSearch(editor));
      ready=true;return {shell,editor,close};
    }catch(error){await close();throw error;}
  }
  active=await candidate(null);
  return {
    format,asyncSnapshots:true,
    render(target,onChange){host=target;notify=onChange;host.replaceChildren(active.shell);},
    async snapshot(){return {revision,state:await active.editor.snapshot()};},
    async restore(draft){
      if(disposed)throw new Error('PDF session is closed.');
      if(!draft||!Number.isInteger(draft.revision)||!draft.state)throw new Error('Invalid PDF workspace draft.');
      const next=await candidate(draft),previous=active;
      active=next;revision=draft.revision;host?.replaceChildren(next.shell);
      await previous.close();
    },
    async export(){const result=await active.editor.save();if(!result?.blob)throw new Error('Finish the current PDF edit before exporting.');return result.blob;},
    async dispose(){disposed=true;await active?.close();active=null;}
  };
}
