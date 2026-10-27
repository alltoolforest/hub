import {replaceWordRange,formatWordRange} from './word-range.js';

// Only adjacent ordinary paragraphs share an editing host. Complex paragraphs,
// tables and intentional page breaks retain their protected host boundaries.
export function wordFlowGroup({model,views,onChange,onStatus,formatting,onHistory}){
  const group=document.createElement('div');group.className='document-v2-word-flow';group.setAttribute('contenteditable','');
  const forwarded=new WeakSet();let inputField=null;
  function endpoint(node,offset,end){
    const list=[...group.querySelectorAll('[data-word-source]')];
    let field=(node.nodeType===1?node:node.parentElement)?.closest('[data-word-source]');
    if(!field||!group.contains(field)){
      field=(end?[...list].reverse():list).find(candidate=>{const range=document.createRange();range.selectNodeContents(candidate);const position=range.comparePoint(node,offset);return end?position>=0:position<=0;});
      if(!field)return null;
      offset=end?field.textContent.length:0;
    }else{const prefix=document.createRange();prefix.selectNodeContents(field);prefix.setEnd(node,offset);offset=prefix.toString().length;}
    return {field,index:Number(field.dataset.wordSource),part:Number(field.dataset.wordPart),offset};
  }
  function selected(){
    const selection=window.getSelection();if(!selection?.rangeCount)return null;const range=selection.getRangeAt(0);
    if(!group.contains(range.startContainer)||!group.contains(range.endContainer))return null;
    const start=endpoint(range.startContainer,range.startOffset,false),end=range.collapsed?start:endpoint(range.endContainer,range.endOffset,true);
    return start&&end?{start,end,cross:start.field!==end.field,normalized:!start.field.contains(range.startContainer)||!end.field.contains(range.endContainer),collapsed:range.collapsed}:null;
  }
  function forward(event,field,type=event.type,inputType=event.inputType){
    const view=group.ownerDocument.defaultView;
    const copy=type==='beforeinput'?new view.InputEvent(type,{inputType,data:event.data,isComposing:event.isComposing,cancelable:true}):new view.Event(type,{cancelable:true});
    if(event.clipboardData)Object.defineProperty(copy,'clipboardData',{value:event.clipboardData});
    forwarded.add(copy);if(!field.dispatchEvent(copy))event.preventDefault();
  }
  function replace(selection,text,options){
    try{
      const result=replaceWordRange(model,selection.start,selection.end,text,options);
      for(const index of result.indexes)views.get(index).refresh();
      onChange();views.get(result.index).focus(result.part,result.offset);inputField=null;
    }catch(error){onStatus(error.message);}
  }
  function restoreSelection(start,end){
    function position(point){
      const field=group.querySelector(`[data-word-source="${point.index}"][data-word-part="${point.part}"]`),walker=document.createTreeWalker(field,4);let offset=point.offset,node;
      while((node=walker.nextNode())){if(offset<=node.length)return [node,offset];offset-=node.length;}
      return [field,field.childNodes.length];
    }
    group.focus();const range=document.createRange();range.setStart(...position(start));range.setEnd(...position(end));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
  }
  function activateRange(selection,format=model.formatting.formats[selection.start.index].base){
    formatting.activate({apply(value){
      const indexes=formatWordRange(model,selection.start,selection.end,value);
      for(const index of indexes)views.get(index).refresh();
      restoreSelection(selection.start,selection.end);
      activateRange(selection,value);
    }},format);
  }
  group.addEventListener('beforeinput',event=>{
    if(forwarded.has(event))return;
    const selection=selected();
    if(!selection){event.preventDefault();onStatus('Select text within one editable paragraph group.');return;}
    if(selection.cross||selection.normalized){
      event.preventDefault();
      if(event.isComposing){onStatus('Finish text composition before replacing a selection across paragraphs.');return;}
      if(selection.normalized&&selection.collapsed&&event.inputType.startsWith('delete')){
        views.get(selection.start.index).focus(selection.start.part,selection.start.offset);
        forward(event,selection.start.field);return;
      }
      if(event.inputType.startsWith('delete'))replace(selection,'');
      else if(['insertText','insertReplacementText'].includes(event.inputType)&&typeof event.data==='string')replace(selection,event.data);
      else if(event.inputType==='insertParagraph')replace(selection,'\n');
      else if(event.inputType==='insertLineBreak')replace(selection,'\n',{splitLines:false});
      else onStatus('Use Delete, Backspace or plain-text typing/paste for selections across paragraphs.');
      return;
    }
    inputField=selection.start.field;
    if(['historyUndo','historyRedo'].includes(event.inputType)){event.preventDefault();onHistory(event.inputType==='historyUndo'?'undo':'redo');return;}
    if(event.inputType.startsWith('format')){event.preventDefault();onStatus('Use the formatting controls above the document.');return;}
    if(selection.start.offset===selection.end.offset&&event.inputType.startsWith('delete')){
      const backward=event.inputType.endsWith('Backward'),forwardDelete=event.inputType.endsWith('Forward');
      if(backward&&selection.start.offset===0||forwardDelete&&selection.start.offset===inputField.textContent.length){forward(event,inputField,'beforeinput',backward?'deleteContentBackward':'deleteContentForward');return;}
    }
    if(event.target===group)forward(event,inputField);
  },true);
  group.addEventListener('input',event=>{
    if(forwarded.has(event))return;
    const field=inputField?.isConnected?inputField:selected()?.start.field;
    if(event.target===group&&field)forward(event,field);inputField=null;
  },true);
  for(const type of ['paste','cut'])group.addEventListener(type,event=>{
    if(forwarded.has(event))return;const selection=selected();if(!selection)return;
    if(selection.cross){
      event.preventDefault();
      if(type==='cut'){
        if(!event.clipboardData){onStatus('Clipboard access is unavailable. Use Delete instead.');return;}
        event.clipboardData.setData('text/plain',window.getSelection().toString());replace(selection,'');
      }else replace(selection,event.clipboardData?.getData('text/plain')??'');
    }else if(event.target===group&&type==='paste')forward(event,selection.start.field);
  },true);
  for(const type of ['keyup','mouseup','focus'])group.addEventListener(type,event=>{
    if(forwarded.has(event))return;const selection=selected();if(!selection)return;
    if(selection.cross)activateRange(selection);
    else if(type==='mouseup'&&selection.normalized&&selection.collapsed)views.get(selection.start.index).focus(selection.start.part,selection.start.offset);
    else if(event.target===group)forward(event,selection.start.field,type);
  },true);
  group.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();onHistory(event.shiftKey?'redo':'undo');}
    else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();onHistory('redo');}
  });
  group.addEventListener('compositionstart',()=>{
    const selection=selected();
    if(selection?.cross)replace(selection,'');
    else if(selection?.normalized)views.get(selection.start.index).focus(selection.start.part,selection.start.offset);
  },true);
  group.addEventListener('drop',event=>event.preventDefault());
  return group;
}
