const copy = value => JSON.parse(JSON.stringify(value));
export function scanPageDraft(index,state,editedBlob) {
  return {index,pixelWidth:state.pixelWidth,pixelHeight:state.pixelHeight,
    words:copy(state.words),edits:copy(state.edits),additions:copy(state.additions),
    additionChanges:state.additionChanges,edited:state.edited,editedBlob};
}
export async function validateScanDraft(draft,source,pageCount) {
  if(!draft||draft.version!==1||draft.source!==source||!Array.isArray(draft.pages)||draft.pages.length>pageCount||
    !Number.isInteger(draft.pageIndex)||draft.pageIndex<0||draft.pageIndex>=pageCount)
    throw new Error('The scanned PDF draft does not match this document.');
  const indexes=new Set(),pages=[];
  let encodedBytes=0;
  for(const saved of draft.pages){
    if(!saved||!Number.isInteger(saved.index)||saved.index<0||saved.index>=pageCount||indexes.has(saved.index)||
      !Number.isInteger(saved.pixelWidth)||!Number.isInteger(saved.pixelHeight)||saved.pixelWidth<=0||saved.pixelHeight<=0||
      saved.pixelWidth*saved.pixelHeight>16_000_000||Math.max(saved.pixelWidth,saved.pixelHeight)>16384||
      !(saved.words===null||Array.isArray(saved.words))||!Array.isArray(saved.edits)||!Array.isArray(saved.additions)||
      !Number.isInteger(saved.additionChanges)||saved.additionChanges<0||typeof saved.edited!=='boolean')
      throw new Error('Invalid scanned PDF draft page.');
    indexes.add(saved.index);
    const rectValid=rect=>rect&&['x0','y0','x1','y1'].every(key=>Number.isFinite(rect[key]))&&
      rect.x0>=0&&rect.y0>=0&&rect.x1>rect.x0&&rect.y1>rect.y0&&rect.x1<=saved.pixelWidth&&rect.y1<=saved.pixelHeight;
    if((saved.words||[]).some(word=>typeof word.text!=='string'||!rectValid(word.bbox))||
      saved.edits.some(edit=>!rectValid(edit.bbox)||typeof edit.newText!=='string'||!edit.patchRect||
        !['x','y','width','height'].every(key=>Number.isFinite(edit.patchRect[key]))||edit.patchRect.x<0||edit.patchRect.y<0||edit.patchRect.width<=0||edit.patchRect.height<=0||
        edit.patchRect.x+edit.patchRect.width>saved.pixelWidth||edit.patchRect.y+edit.patchRect.height>saved.pixelHeight))
      throw new Error('Invalid OCR text or patch geometry.');
    if(saved.editedBlob){
      if(!(saved.editedBlob instanceof Blob))throw new Error('Invalid scanned PDF pixel data.');
      encodedBytes+=saved.editedBlob.size;
      if(encodedBytes>128*1024*1024)throw new Error('The scan draft exceeds the recovery memory budget.');
      const bytes=new Uint8Array(await saved.editedBlob.slice(0,24).arrayBuffer());
      if(bytes.length<24||[137,80,78,71,13,10,26,10].some((value,index)=>bytes[index]!==value))throw new Error('Scan recovery requires lossless PNG data.');
      const view=new DataView(bytes.buffer);
      if(view.getUint32(16)!==saved.pixelWidth||view.getUint32(20)!==saved.pixelHeight)throw new Error('Scan draft dimensions do not match.');
    }else if(saved.edits.length)throw new Error('The scan draft is missing edited pixels.');
    pages.push(scanPageDraft(saved.index,saved,saved.editedBlob||null));
  }
  return {version:1,source,pageIndex:draft.pageIndex,pages};
}
