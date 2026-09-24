import { pdfRectToScreen, screenPointToPdf } from '../utils/coordinates.js';

export class InlineEditor{
  constructor(layer,{onCommit,onCancel,onInput,onCompositionBlocked}={}){this.layer=layer;this.cb={onCommit,onCancel,onInput,onCompositionBlocked};this.el=null;this.block=null;this.composing=false;this._handlers=[];}
  begin(block,pageMatrix,tap=null){
    this.cancel();this.block=block;const r=pdfRectToScreen(pageMatrix,block.bounds);const el=document.createElement('textarea');el.value=block.text;el.setAttribute('aria-label','Edit PDF text');el.dataset.role='pdf-inline-editor';el.spellcheck=true;
    Object.assign(el.style,{position:'absolute',left:`${r.left}px`,top:`${r.top}px`,width:`${Math.max(r.width,60)}px`,height:`${Math.max(r.height,44)}px`,minHeight:'44px',fontSize:`${Math.max(16,block.fontSize*Math.abs(pageMatrix[3]||1))}px`,lineHeight:'1.2',padding:'2px',border:'2px solid var(--pdf-editor-focus,#2563eb)',borderRadius:'6px',background:'rgba(255,255,255,.97)',color:'var(--pdf-editor-text,#111)',zIndex:'50',resize:'none',boxSizing:'border-box',touchAction:'manipulation'});
    this.layer.appendChild(el);this.el=el;
    // Must remain synchronous with the user gesture.
    el.focus();
    let offset=block.text.length;if(tap)offset=nearestOffset(block,pageMatrix,tap);try{el.setSelectionRange(offset,offset);}catch{}
    this.listen(el,'compositionstart',()=>{this.composing=true;});this.listen(el,'compositionend',()=>{this.composing=false;this.cb.onInput?.(block,el.value);});this.listen(el,'input',()=>{if(!this.composing)this.cb.onInput?.(block,el.value);});
    return el;
  }
  commit(){if(!this.el||!this.block)return null;if(this.composing){this.cb.onCompositionBlocked?.();return {blocked:true};}const b=this.block,v=this.el.value;this.teardown();this.cb.onCommit?.(b,v);return {block:b,newText:v};}
  cancel(){if(!this.el)return;const b=this.block;this.teardown();this.cb.onCancel?.(b);}
  teardown(){for(const [el,t,h] of this._handlers)el.removeEventListener(t,h);this._handlers=[];this.el?.remove();this.el=null;this.block=null;this.composing=false;}
  listen(el,t,h){el.addEventListener(t,h);this._handlers.push([el,t,h]);}
}

function nearestOffset(block,matrix,tap){const p=screenPointToPdf(matrix,tap.x,tap.y);let global=0,best={d:Infinity,o:0};for(const line of block.lines){for(const run of line.runs){const chars=Array.from(run.text||run.item?.str||'');const w=(run.width||0)/Math.max(chars.length,1);for(let i=0;i<=chars.length;i++){const x=run.x+w*i;const d=Math.abs(x-p.x)+Math.abs(line.y-p.y)*.1;if(d<best.d)best={d,o:global+i};}global+=chars.length;}global++;}return Math.min(best.o,block.text.length);}
