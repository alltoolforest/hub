import { glyphWidth1000 } from '../fonts/font-metrics.js';

export function splitEncodedUnits(bytes,fontContext){
  if(!fontContext?.isComposite) return Array.from(bytes).map((b)=>({code:b,bytes:new Uint8Array([b])}));
  const out=[]; let i=0; const lengths=fontContext.toUnicode?.codeLengths?.length?fontContext.toUnicode.codeLengths:[fontContext.codeWidth||2];
  while(i<bytes.length){
    let picked=null;
    for(const len of lengths){
      if(i+len>bytes.length) continue;
      const chunk=bytes.slice(i,i+len);
      if(!fontContext.toUnicode?.supported || fontContext.toUnicode.decodeCode(chunk)!=null){picked=chunk;break;}
    }
    picked ||= bytes.slice(i,Math.min(bytes.length,i+(fontContext.codeWidth||2)));
    let code=0; for(const b of picked) code=code*256+b;
    out.push({code,bytes:picked}); i+=picked.length;
  }
  return out;
}

export function advanceForString(bytes,fontContext,textState,decodedText=''){
  const units=splitEncodedUnits(bytes,fontContext);
  let advance=0; let charIndex=0;
  for(const unit of units){
    const ch=Array.from(decodedText)[charIndex++] ?? '';
    const width=glyphWidth1000(fontContext,unit.code,ch);
    advance += width/1000*(textState.fontSize||0);
    advance += textState.charSpacing||0;
    if(ch===' ') advance += textState.wordSpacing||0;
  }
  return advance*((textState.horizontalScale??100)/100);
}

export function tjAdjustment(value,textState){
  return (-(value||0)/1000)*(textState.fontSize||0)*((textState.horizontalScale??100)/100);
}
