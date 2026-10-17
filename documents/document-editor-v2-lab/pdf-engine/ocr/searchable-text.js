import {StandardFonts,degrees} from '../fortress/src/core/pdf-lib.js';
import {patchPlacement} from './patch-placement.js';
// Visible scan pixels remain untouched. The transparent text layer represents
// reviewed OCR words, including edits; removed words are absent from state.words.
export async function addSearchableText(doc,page,state){
  const font=await doc.embedFont(StandardFonts.Helvetica);
  const words=(state.words||[]).filter(word=>word.text?.trim());
  for(const word of words){
    const bbox=word.bbox;
    const placement=patchPlacement({x:bbox.x0,y:bbox.y0,width:bbox.x1-bbox.x0,height:bbox.y1-bbox.y0},state.viewportTransform);
    try{font.encodeText(word.text);}catch{throw new Error('Searchable export cannot encode some recognized characters yet. Keep the draft and turn off searchable text to export the visible edits.');}
    const unitWidth=font.widthOfTextAtSize(word.text,1);
    const size=Math.max(.1,Math.min(placement.height*.8,placement.width/Math.max(unitWidth,.01)));
    page.drawText(word.text,{x:placement.x,y:placement.y,size,font,rotate:degrees(placement.angle),opacity:0});
  }
  return words.map(word=>word.text);
}
