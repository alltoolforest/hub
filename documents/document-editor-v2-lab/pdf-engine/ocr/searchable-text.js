import {createUnicodeSearchFonts,drawUnicodeSearchText} from './unicode-search-font.js';
import {patchPlacement} from './patch-placement.js';
import {renderAddedText} from './added-text.js';
// Visible scan pixels remain untouched. The transparent text layer represents
// reviewed OCR words, including edits; removed words are absent from state.words.
export async function addSearchableText(doc,page,state){
  const words=(state.words||[]).filter(word=>word.text?.trim());
  for(const addition of state.additions||[]){
    const rendered=renderAddedText(addition,state);
    try{words.push(...rendered.searchLines.filter(line=>line.text.trim()));}
    finally{rendered.canvas.width=1;rendered.canvas.height=1;}
  }
  const fonts=createUnicodeSearchFonts(doc,page,words.map(word=>word.text));
  for(const word of words){
    const bbox=word.bbox;
    const placement=patchPlacement({x:bbox.x0,y:bbox.y0,width:bbox.x1-bbox.x0,height:bbox.y1-bbox.y0},state.viewportTransform);
    drawUnicodeSearchText(doc,page,fonts,word.text,placement);
  }
  return words.map(word=>word.text);
}
