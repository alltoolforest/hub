const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const child=(n,name)=>[...(n?.children||[])].find(c=>c.namespaceURI===W&&c.localName===name);
export function readWordSections(xml){
 const paragraphs=[...xml.getElementsByTagNameNS(W,'p')];let previous={width:612,height:792,top:72,bottom:72,left:72,right:72,columns:1,columnGap:36};
 const sections=[...xml.getElementsByTagNameNS(W,'sectPr')].filter(s=>s.parentNode?.localName==='body'||s.parentNode?.localName==='pPr');
 return sections.map((section,index)=>{const page=child(section,'pgSz'),margins=child(section,'pgMar'),cols=child(section,'cols'),geometry={...previous};for(const [key,node,attr,scale]of [['width',page,'w',20],['height',page,'h',20],...['top','bottom','left','right'].map(k=>[k,margins,k,20]),['columns',cols,'num',1],['columnGap',cols,'space',20]])if(node?.hasAttributeNS(W,attr)){const n=Number(node.getAttributeNS(W,attr))/scale;if(Number.isFinite(n)&&n>=0)geometry[key]=n;}geometry.equalWidth=cols?!['0','false','off'].includes(cols.getAttributeNS(W,'equalWidth')):(previous.equalWidth??true);geometry.columnWidths=cols?[...cols.children].filter(n=>n.localName==='col').map(n=>({width:Number(n.getAttributeNS(W,'w'))/20,gap:Number(n.getAttributeNS(W,'space'))/20})):(previous.columnWidths||[]);if(geometry.equalWidth===false&&geometry.columnWidths.length)geometry.columns=geometry.columnWidths.length;previous=geometry;const endParagraph=section.parentNode.localName==='pPr'?paragraphs.indexOf(section.parentNode.parentNode):paragraphs.length-1;return {index,endParagraph,type:child(section,'type')?.getAttributeNS(W,'val')||'nextPage',...geometry};});
}

// Continuous sections with identical page geometry share one fragmentation context.
export function canShareSectionPage(previous,next){return !!previous&&next.type==='continuous'&&previous.equalWidth!==false&&next.equalWidth!==false&&['width','height','top','bottom','left','right','columns','columnGap'].every(k=>previous[k]===next[k]);}
