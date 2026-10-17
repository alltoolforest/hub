import { operandsToValues } from '../parser/tokenizer.js';
import { multiply, IDENTITY, translate } from '../utils/matrices.js';
import { decodePdfString } from '../fonts/glyph-decoder.js';
import { advanceForString, tjAdjustment } from './text-advance.js';

function clone(m){return m?m.slice():null;}
function textRenderingMatrix(state){
  const fs=state.fontSize||0; const hz=(state.horizontalScale??100)/100;
  return multiply([fs*hz,0,0,fs,0,state.rise||0], multiply(state.textMatrix||IDENTITY,state.ctm||IDENTITY));
}
function moveText(state,tx,ty){
  state.textLineMatrix=multiply(translate(tx,ty),state.textLineMatrix||IDENTITY);
  state.textMatrix=clone(state.textLineMatrix);
}
function nextLine(state){moveText(state,0,-(state.leading||0));}
function advanceText(state,amount){ state.textMatrix=multiply(translate(amount,0),state.textMatrix||IDENTITY); }

export function interpretTextRuns(instructions,{fontResolver,streamRef=null,streamIndex=0,initialCtm=IDENTITY}={}){
  const state={font:null,fontSize:0,charSpacing:0,wordSpacing:0,horizontalScale:100,leading:0,rise:0,renderingMode:0,textMatrix:null,textLineMatrix:null,ctm:(initialCtm||IDENTITY).slice()};
  const gs=[]; const runs=[]; let textObjectIndex=-1; let lastPos=null;
  for(let operatorIndex=0;operatorIndex<instructions.length;operatorIndex++){
    const instr=instructions[operatorIndex]; const a=operandsToValues(instr.args);
    switch(instr.op){
      case 'q': gs.push({ctm:state.ctm.slice()}); break;
      case 'Q': {const x=gs.pop(); if(x) state.ctm=x.ctm;} break;
      case 'cm': if(a.length>=6) state.ctm=multiply([a[0],a[1],a[2],a[3],a[4],a[5]],state.ctm); break;
      case 'BT': textObjectIndex++; state.textMatrix=IDENTITY.slice(); state.textLineMatrix=IDENTITY.slice(); lastPos=null; break;
      case 'ET': state.textMatrix=null; state.textLineMatrix=null; lastPos=null; break;
      case 'Tf': state.font=a[0]; state.fontSize=a[1]||0; break;
      case 'Tc': state.charSpacing=a[0]||0; break;
      case 'Tw': state.wordSpacing=a[0]||0; break;
      case 'Tz': state.horizontalScale=a[0]||100; break;
      case 'TL': state.leading=a[0]||0; break;
      case 'Ts': state.rise=a[0]||0; break;
      case 'Tr': state.renderingMode=a[0]||0; break;
      case 'Tm': if(a.length>=6){state.textMatrix=[a[0],a[1],a[2],a[3],a[4],a[5]];state.textLineMatrix=state.textMatrix.slice();lastPos={start:instr.start,end:instr.end};} break;
      case 'Td': if(state.textLineMatrix){moveText(state,a[0]||0,a[1]||0);lastPos={start:lastPos?.start??instr.start,end:instr.end};} break;
      case 'TD': state.leading=-(a[1]||0); if(state.textLineMatrix){moveText(state,a[0]||0,a[1]||0);lastPos={start:lastPos?.start??instr.start,end:instr.end};} break;
      case 'T*': if(state.textLineMatrix){nextLine(state);lastPos={start:lastPos?.start??instr.start,end:instr.end};} break;
      case "'":
      case '"':
      case 'Tj': {
        if(instr.op==="'") nextLine(state);
        if(instr.op==='"'){state.wordSpacing=a[0]||0;state.charSpacing=a[1]||0;nextLine(state);}
        const obj=instr.op==='"'?a[2]:a[0]; const bytes=obj?.str||new Uint8Array(); const font=fontResolver?.(state.font)||null;
        const decoded=decodePdfString(bytes,font); const trm=textRenderingMatrix(state); const startTextMatrix=clone(state.textMatrix);
        const advance=advanceForString(bytes,font,state,decoded.text||'');
        advanceText(state,advance); const endTextMatrix=clone(state.textMatrix);
        runs.push({kind:'Tj',parts:[bytes],rawArray:null,text:decoded.text||'',decodeSuccess:decoded.success,fontName:state.font,fontContext:font,fontSize:state.fontSize,charSpacing:state.charSpacing,wordSpacing:state.wordSpacing,horizontalScale:state.horizontalScale,rise:state.rise,renderingMode:state.renderingMode,trm,textMatrix:startTextMatrix,endTextMatrix,advance,ctm:clone(state.ctm),streamRef,streamIndex,textObjectIndex,operatorIndex,instrStart:instr.start,instrEnd:instr.end,opStart:instr.opStart,posStart:lastPos?.start??null,posEnd:lastPos?.end??null});
        lastPos=null; break;
      }
      case 'TJ': {
        const arr=a[0]||[]; const trm=textRenderingMatrix(state); const font=fontResolver?.(state.font)||null; const parts=[]; let text=''; let ok=true; const startTextMatrix=clone(state.textMatrix);
        for(const el of arr){
          if(el&&el.str){parts.push(el.str);const d=decodePdfString(el.str,font);text+=d.text||'';ok&&=!!d.success;advanceText(state,advanceForString(el.str,font,state,d.text||''));}
          else if(typeof el==='number') advanceText(state,tjAdjustment(el,state));
        }
        const endTextMatrix=clone(state.textMatrix); const advance=(endTextMatrix?.[4]??0)-(startTextMatrix?.[4]??0);
        runs.push({kind:'TJ',parts,rawArray:arr,text,decodeSuccess:ok,fontName:state.font,fontContext:font,fontSize:state.fontSize,charSpacing:state.charSpacing,wordSpacing:state.wordSpacing,horizontalScale:state.horizontalScale,rise:state.rise,renderingMode:state.renderingMode,trm,textMatrix:startTextMatrix,endTextMatrix,advance,ctm:clone(state.ctm),streamRef,streamIndex,textObjectIndex,operatorIndex,instrStart:instr.start,instrEnd:instr.end,opStart:instr.opStart,posStart:lastPos?.start??null,posEnd:lastPos?.end??null});
        lastPos=null; break;
      }
      default: break;
    }
  }
  return runs;
}
