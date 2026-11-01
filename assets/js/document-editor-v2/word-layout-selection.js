// Moving a table row can collapse native ranges. Original text nodes survive
// pagination, so restore anchor/focus directly, including backward selections.
export function captureLayoutSelection(root){
 const selection=root.ownerDocument.defaultView.getSelection();
 if(!selection?.rangeCount||!root.contains(selection.anchorNode)||!root.contains(selection.focusNode))return ()=>{};
 const {anchorNode,anchorOffset,focusNode,focusOffset}=selection;
 function logical(node,offset){const field=(node.nodeType===1?node:node.parentElement)?.closest('[data-word-source]');if(!field||!root.contains(field))return null;const range=root.ownerDocument.createRange();range.selectNodeContents(field);range.setEnd(node,offset);return {field,offset:range.toString().length};}
 const anchor=logical(anchorNode,anchorOffset),focus=logical(focusNode,focusOffset);
 function resolve(node,offset,saved){if(root.contains(node))return [node,offset];if(!saved||!root.contains(saved.field))return null;const walker=root.ownerDocument.createTreeWalker(saved.field,4);let current,at=saved.offset;while((current=walker.nextNode())){if(at<=current.length)return [current,at];at-=current.length;}return [saved.field,saved.field.childNodes.length];}
 return ()=>{
  const a=resolve(anchorNode,anchorOffset,anchor),f=resolve(focusNode,focusOffset,focus);if(!a||!f)return;
  selection.setBaseAndExtent(...a,...f);
 };
}
