import {preparePdf} from '../pdf-unlock.js';
import {pdfSearch} from '../pdf-search.js';
import {pdfOcrSearch} from '../pdf-ocr-search.js';
import {createPdfObjectTools} from '../pdf-objects.js';
import {pdfConversionPanel} from '../pdf-conversion.js';
import {pdfOperationQueue} from '../pdf-operations.js';
import {verifyFormPreservation} from '../../../../documents/document-editor-v2-lab/pdf-engine/fortress/src/core/form-protection.js';
// Adapter for the isolated native/OCR engine. The public Edit PDF is untouched.
const base = new URL('../../../../documents/document-editor-v2-lab/pdf-engine/', import.meta.url);
export async function open(file, format, recovery=null) {
  if(format !== 'pdf')throw new Error('Unsupported PDF format.');
  const prepared=await preparePdf(file,{recovery});file=prepared.file;
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
  const operations=pdfOperationQueue(()=>disposed?null:active?.editor);
  const sourceBytes=new Uint8Array(await file.arrayBuffer());
  async function candidate(draft){
    const shell=document.createElement('div'),app=document.createElement('div'),status=document.createElement('p');
    status.setAttribute('role','status');shell.append(status,app);
    let editor=null,ready=false,ocrSearch=null,objects=null,conversion=null;
    app.addEventListener('input',()=>{if(ready&&active?.editor===editor)notify();});
    const extensions=[precision.attachPrecisionFontSize({app,getEditor:()=>editor}),anchors.attachInsertAnchorBridge({app,getEditor:()=>editor})];
    const insertion=smart.attachSmartLineInsertion({app,getEditor:()=>editor});extensions.push(insertion);
    const close=async()=>{conversion?.dispose();ocrSearch?.dispose();await objects?.dispose();for(const extension of extensions)extension.destroy();await editor?.destroy();shell.remove();};
    editor=hybrid.createHybridPdfEditor({container:app,
      prepareNativeDocument:(value,options)=>insertion.prepareDocument(value,options),
      onChange:()=>{if(ready&&active?.editor===editor){revision++;notify();}},
      onStatus:message=>{status.textContent=message;},onWarning:warning=>{status.textContent=warning.message||warning.code;},
      onError:error=>{status.textContent=error.message;}});
    try{
      await editor.open(file,draft?.state);
      if(editor.getState().flags?.hasAcroForm){
        const note=document.createElement('p');note.className='notice';
        note.textContent='This PDF contains form fields. Whole form widgets can follow verified text flow. Field values and appearances are checked before export; edits crossing a widget or uncertain form structures remain protected.';
        shell.prepend(note);
      }
      // The shared workspace owns these actions, including OCR history.
      for(const button of app.querySelectorAll('.hybrid-toolbar button'))if(['Close','Save a copy'].includes(button.textContent))button.hidden=true;
      for(const label of ['Undo','Redo'])for(const button of app.querySelectorAll(`button[aria-label="${label}"]`))button.hidden=true;
      shell.prepend(pdfSearch(editor));
      ocrSearch=pdfOcrSearch(editor);shell.append(ocrSearch);
      objects=await createPdfObjectTools(file,{getEditorState:()=>editor.getState(),onChange:()=>{if(ready&&active?.editor===editor){revision++;notify();}},getBaseBytes:async()=>{const result=await editor.save({allowUnchanged:true});if(!result?.bytes)throw new Error('Finish the current PDF edit before refreshing the preview.');return result;}});
      await objects.restore(draft?.objects);shell.append(objects.panel);
      conversion=pdfConversionPanel(async()=>{
        const startRevision=revision;objects.snapshot();
        const result=await editor.save({allowUnchanged:true});
        if(!result?.bytes)throw new Error('Finish the current PDF edit before converting.');
        const bytes=await objects.apply(result.bytes,{reflowMetrics:result.nativeResult?.reflowMetrics??result.reflowMetrics??editor.getState().reflowMetrics??[],ocrEditedPages:result.ocrEditedPages??editor.getState().ocrEditedPages??[]});
        if(revision!==startRevision||active?.editor!==editor)throw new Error('PDF changed while preparing conversion. Try again.');
        return bytes;
      },file.name);shell.append(conversion);
      ready=true;return {shell,editor,objects,close};
    }catch(error){await close();throw error;}
  }
  active=await candidate(null);
  return {
    format,asyncSnapshots:true,ready:operations.ready,
    render(target,onChange){host=target;notify=onChange;host.replaceChildren(active.shell);},
    snapshot(){return operations.run(async()=>{
      if(disposed)throw new Error('PDF session is closed.');
      const session=active,startRevision=revision,objects=session.objects.snapshot();
      const state=await session.editor.snapshot();
      if(active!==session||revision!==startRevision)throw new Error('PDF changed while saving its draft. Retry after the current edit finishes.');
      return {revision:startRevision,state,objects,...(prepared.unlocked?{unlocked:prepared.unlocked}:{})};
    });},
    async restore(draft){
      if(disposed)throw new Error('PDF session is closed.');
      if(!draft||!Number.isInteger(draft.revision)||!draft.state)throw new Error('Invalid PDF workspace draft.');
      if(prepared.unlocked&&draft.unlocked?.source!==prepared.unlocked.source)throw new Error('Decrypted recovery does not match this file.');
      const next=await candidate(draft),previous=active;
      active=next;revision=draft.revision;host?.replaceChildren(next.shell);
      await previous.close();
    },
    export(){return operations.run(async()=>{
      if(disposed)throw new Error('PDF session is closed.');
      const session=active,startRevision=revision;session.objects.snapshot();
      const result=await session.editor.save({allowUnchanged:true});
      if(!result?.bytes)throw new Error('Finish the current PDF edit before exporting.');
      const bytes=await session.objects.apply(result.bytes,{reflowMetrics:result.nativeResult?.reflowMetrics??result.reflowMetrics??session.editor.getState().reflowMetrics??[],ocrEditedPages:result.ocrEditedPages??session.editor.getState().ocrEditedPages??[]});
      if(active!==session||revision!==startRevision)throw new Error('PDF changed during export. Export again after the current edit finishes.');
      await verifyFormPreservation(sourceBytes,bytes,{reflowMetrics:result.nativeResult?.reflowMetrics??result.reflowMetrics??session.editor.getState().reflowMetrics??[]});
      return new Blob([bytes],{type:'application/pdf'});
    });},
    async dispose(){disposed=true;await active?.close();active=null;}
  };
}
