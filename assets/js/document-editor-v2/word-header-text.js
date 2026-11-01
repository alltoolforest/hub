const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
// Scan the entire story: complex fields can begin/end in different paragraphs.
// Only literal text in the requested paragraph is writable; instructions and
// cached field results remain untouched, including nested fields.
export function headerTextNodes(paragraph){
 if(!paragraph)return [];
 const nodes=[];let depth=0,targetDepth=0;
 function visit(node,insideSimple=false,inTarget=false){
  if(node===paragraph)targetDepth=depth;
  const target=inTarget||node===paragraph;
  for(const child of node.children||[]){
   const word=child.namespaceURI===W,simple=insideSimple||(word&&child.localName==='fldSimple');
   if(word&&child.localName==='fldChar'&&!simple){
    const type=child.getAttributeNS(W,'fldCharType');
    if(type==='begin')depth++;
    else if(type==='end'){if(!depth)throw new Error('Unbalanced header/footer field.');depth--;}
    else if(type==='separate'&&!depth)throw new Error('Unbalanced header/footer field.');
   }else if(word&&child.localName==='t'&&target&&!simple&&!depth)nodes.push(child);
   visit(child,simple,target);
  }
 }
 visit(paragraph.ownerDocument?.documentElement||paragraph);
 if(depth)throw new Error('Unbalanced header/footer field.');
 if(!nodes.length&&targetDepth)throw new Error('This paragraph contains only protected field content.');
 return nodes;
}
