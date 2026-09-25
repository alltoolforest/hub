import { classifyPdfForEditing } from './classifier.js';

const SCANNED_CONFIDENCE_MIN=0.6;

/**
 * Keep routing outside every editing engine.
 * Native/mixed/unknown PDFs stay on the existing Fortress path.
 * Only scan-dominant PDFs with sufficient classifier confidence enter OCR.
 * Classification failure is fail-open to the pre-existing native route so the
 * router cannot make a previously supported PDF unreachable.
 */
export async function choosePdfEditorRoute(source,{scannedConfidenceMin=SCANNED_CONFIDENCE_MIN}={}){
  try{
    const classification=await classifyPdfForEditing(source);
    const confidence=Number(classification?.confidence)||0;
    const mode=classification?.kind==='scanned'&&confidence>=scannedConfidenceMin?'ocr':'native';
    return {mode,classification,classifierError:null};
  }catch(classifierError){
    return {mode:'native',classification:null,classifierError};
  }
}
