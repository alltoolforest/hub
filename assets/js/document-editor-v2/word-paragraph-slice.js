// Range.cloneContents omits the enclosing run when both endpoints are inside
// one text node. Clone the selected subtree explicitly to retain run styling.
export function sliceParagraphContents(field,start,end){
 const doc=field.ownerDocument,out=doc.createDocumentFragment();let offset=0;
 function visit(node,parent){
  if(node.nodeType===3){const from=offset;offset+=node.length;const value=node.data.slice(Math.max(0,start-from),Math.max(0,Math.min(node.length,end-from)));if(value)parent.append(doc.createTextNode(value));return;}
  if(node.nodeType!==1)return;
  const clone=node.cloneNode(false);clone.removeAttribute('id');for(const child of node.childNodes)visit(child,clone);if(clone.childNodes.length)parent.append(clone);
 }
 for(const child of field.childNodes)visit(child,out);return out;
}
