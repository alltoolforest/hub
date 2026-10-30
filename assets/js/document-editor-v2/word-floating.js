const WP='http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const kid=(n,name)=>[...n.children].find(c=>c.namespaceURI===WP&&c.localName===name);
export function positionWordImage(doc,drawing,command){
 const original=[...drawing.children].find(n=>n.namespaceURI===WP&&['inline','anchor'].includes(n.localName));if(!original)throw new Error('This drawing cannot be positioned.');
 const make=(name,attrs={})=>{const n=doc.createElementNS(WP,'wp:'+name);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
 if(command.placement==='inline'){const inline=make('inline',{distT:0,distB:0,distL:0,distR:0});for(const n of [...original.children])if(['extent','effectExtent','docPr','cNvGraphicFramePr','graphic'].includes(n.localName))inline.append(n);original.replaceWith(inline);return;}
 if(!['square','topAndBottom','none'].includes(command.wrap)||!['page','margin','column'].includes(command.horizontal)||!['page','margin','paragraph'].includes(command.vertical)||![command.x,command.y].every(n=>Number.isFinite(n)&&Math.abs(n)<=1584))throw new Error('Invalid floating-image position.');
 const anchor=make('anchor',{distT:0,distB:0,distL:91440,distR:91440,simplePos:0,relativeHeight:original.getAttribute('relativeHeight')||0,behindDoc:command.behind?1:0,locked:0,layoutInCell:1,allowOverlap:0});
 anchor.append(make('simplePos',{x:0,y:0}));for(const[axis,relative,value]of [['H',command.horizontal,command.x],['V',command.vertical,command.y]]){const position=make('position'+axis,{relativeFrom:relative}),offset=make('posOffset');offset.textContent=String(Math.round(value*12700));position.append(offset);anchor.append(position);}
 for(const name of ['extent','effectExtent']){const n=kid(original,name);if(n)anchor.append(n);}
 anchor.append(make(command.wrap==='square'?'wrapSquare':command.wrap==='topAndBottom'?'wrapTopAndBottom':'wrapNone',command.wrap==='square'?{wrapText:'bothSides'}:{}));
 for(const n of [...original.children])if(['docPr','cNvGraphicFramePr','graphic'].includes(n.localName))anchor.append(n);original.replaceWith(anchor);
}
