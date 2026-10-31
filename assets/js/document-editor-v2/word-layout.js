const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const child=(node,name)=>[...(node?.children||[])].find(n=>n.namespaceURI===W&&n.localName===name);
export const defaultLayout={alignment:'left',before:0,after:0,left:0,right:0,first:0,line:1,lineRule:'auto'};
export function readLayout(pr,base=defaultLayout){
  const out={...base},jc=child(pr,'jc')?.getAttributeNS(W,'val');
  if(['left','right','center','both'].includes(jc))out.alignment=jc;
  const spacing=child(pr,'spacing'),indent=child(pr,'ind');
  for(const key of ['before','after'])if(spacing?.hasAttributeNS(W,key))out[key]=Number(spacing.getAttributeNS(W,key))/20;
  if(spacing?.hasAttributeNS(W,'line')){out.lineRule=spacing.getAttributeNS(W,'lineRule')||'auto';out.line=Number(spacing.getAttributeNS(W,'line'))/(out.lineRule==='auto'?240:20);}
  for(const key of ['left','right'])if(indent?.hasAttributeNS(W,key))out[key]=Number(indent.getAttributeNS(W,key))/20;
  if(indent?.hasAttributeNS(W,'firstLine'))out.first=Number(indent.getAttributeNS(W,'firstLine'))/20;
  if(indent?.hasAttributeNS(W,'hanging'))out.first=-Number(indent.getAttributeNS(W,'hanging'))/20;
  for(const key of ['keepNext','keepLines','pageBreakBefore','widowControl']){const n=child(pr,key);if(n)out[key]=!['0','false','off'].includes(n.getAttributeNS(W,'val'));}
  return out;
}
export function validateLayout(value){
  if(!value||!['left','right','center','both'].includes(value.alignment)||!['auto','exact','atLeast'].includes(value.lineRule))throw new Error('Invalid paragraph layout.');
  for(const key of ['before','after','left','right','first','line'])if(!Number.isFinite(value[key])||value[key]<(key==='first'?-720:key==='line'?.1:0)||value[key]>(key==='line'&&value.lineRule==='auto'?10:720))throw new Error('Paragraph spacing or indentation is outside the supported range.');
  const result=Object.fromEntries(Object.keys(defaultLayout).map(key=>[key,value[key]]));for(const key of ['keepNext','keepLines','pageBreakBefore','widowControl'])if(value[key]!=null){if(typeof value[key]!=='boolean')throw new Error('Invalid paragraph pagination setting.');result[key]=value[key];}return result;
}
export function paintLayout(node,layout){
  node.style.textAlign=layout.alignment==='both'?'justify':layout.alignment;
  node.style.marginTop=layout.before+'pt';node.style.marginBottom=layout.after+'pt';
  node.style.marginLeft=layout.left+'pt';node.style.marginRight=layout.right+'pt';node.style.textIndent=layout.first+'pt';
  node.style.lineHeight=layout.lineRule==='auto'?String(layout.line):layout.lineRule==='atLeast'?`max(1em, ${layout.line}pt)`:layout.line+'pt';
  node.style.breakInside=layout.keepLines?'avoid':'auto';node.style.breakAfter=layout.keepNext?'avoid':'auto';node.style.breakBefore=layout.pageBreakBefore?'column':'auto';node.style.widows=node.style.orphans=layout.widowControl===false?'1':'2';
}
export function writeLayout(xml,paragraph,value){
  const layout=validateLayout(value);let pr=child(paragraph,'pPr');if(!pr){pr=xml.createElementNS(W,'w:pPr');paragraph.insertBefore(pr,paragraph.firstChild);}
  // Insert supported properties in their Word schema order without discarding unrelated properties.
  const order=['pStyle','keepNext','keepLines','pageBreakBefore','framePr','widowControl','numPr','suppressLineNumbers','pBdr','shd','tabs','suppressAutoHyphens','kinsoku','wordWrap','overflowPunct','topLinePunct','autoSpaceDE','autoSpaceDN','bidi','adjustRightInd','snapToGrid','spacing','ind','contextualSpacing','mirrorIndents','suppressOverlap','jc','textDirection','textAlignment','textboxTightWrap','outlineLvl','divId','cnfStyle','rPr','sectPr','pPrChange'];
  function property(name,attrs,remove=[]){let el=child(pr,name);if(!el){el=xml.createElementNS(W,'w:'+name);pr.insertBefore(el,[...pr.children].find(n=>order.indexOf(n.localName)>order.indexOf(name))||null);}for(const key of remove)el.removeAttributeNS(W,key);for(const [key,value]of Object.entries(attrs))el.setAttributeNS(W,'w:'+key,String(value));}
  for(const key of ['keepNext','keepLines','pageBreakBefore','widowControl'])if(layout[key]!=null)property(key,{val:layout[key]?'1':'0'});
  property('jc',{val:layout.alignment});
  property('spacing',{before:Math.round(layout.before*20),after:Math.round(layout.after*20),line:Math.round(layout.line*(layout.lineRule==='auto'?240:20)),lineRule:layout.lineRule,beforeAutospacing:0,afterAutospacing:0},['beforeLines','afterLines']);
  property('ind',{left:Math.round(layout.left*20),right:Math.round(layout.right*20),[layout.first<0?'hanging':'firstLine']:Math.round(Math.abs(layout.first)*20)},['firstLine','hanging','leftChars','rightChars','firstLineChars','hangingChars','start','end','startChars','endChars']);
}
export function restoreLayouts(model,values={}){
  if(!values||Array.isArray(values)||typeof values!=='object')throw new Error('Invalid paragraph layouts.');
  const result={};for(const [key,value]of Object.entries(values)){const index=Number(key);if(!Number.isInteger(index)||String(index)!==key||index<0||index>=model.text.length||model.protected[index])throw new Error('Invalid paragraph layout target.');result[index]=validateLayout(value);}return result;
}
export function mountLayoutControls(host,model,onChange){
  const panel=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Paragraph layout';panel.append(summary);
  const note=document.createElement('p');note.textContent='Applies to selected source paragraphs, including their split parts. Negative first-line indent creates a hanging indent. Exact and minimum line spacing use points; multiple uses a ratio. Browser preview approximates Word layout.';panel.append(note);
  const row=document.createElement('div');row.className='document-v2-actions';panel.append(row);const controls={};
  for(const [key,label,options]of [['alignment','Alignment',['left','center','right','both']],['before','Space before (pt)'],['after','Space after (pt)'],['left','Left indent (pt)'],['right','Right indent (pt)'],['first','First-line indent (pt)'],['lineRule','Line spacing',['auto','exact','atLeast']],['line','Line spacing value']]){
    const wrap=document.createElement('label'),input=document.createElement(options?'select':'input');if(options)for(const value of options){const option=document.createElement('option');option.value=value;option.textContent=({auto:'Multiple',exact:'Exact',atLeast:'Minimum',both:'Justify'})[value]||value;input.append(option);}else{input.type='number';input.step='.05';}input.setAttribute('aria-label',label);wrap.append(label+' ',input);row.append(wrap);controls[key]=input;
  }
  let indexes=[];const status=document.createElement('p');status.setAttribute('role','status');const apply=document.createElement('button');apply.type='button';apply.textContent='Apply paragraph layout';row.append(apply);panel.append(status);host.append(panel);
  function track(event){if(!event.target.closest?.('.document-v2-page'))return;const selection=window.getSelection();if(!selection?.rangeCount)return;const range=selection.getRangeAt(0),fields=[...host.querySelectorAll('[data-word-source]')];indexes=[...new Set(fields.filter(field=>range.intersectsNode(field)).map(field=>Number(field.dataset.wordSource)))];if(!indexes.length)return;const layout=model.layouts[indexes[0]]||model.formatting.formats[indexes[0]].layout;for(const key of Object.keys(controls))controls[key].value=layout[key];}
  for(const event of ['mouseup','keyup','focusin'])host.addEventListener(event,track);
  apply.addEventListener('click',()=>{try{if(!indexes.length)throw new Error('Select an existing editable paragraph first.');const value=validateLayout(Object.fromEntries(Object.entries(controls).map(([key,input])=>[key,['alignment','lineRule'].includes(key)?input.value:Number(input.value)])));const next=restoreLayouts(model,{...model.layouts,...Object.fromEntries(indexes.map(index=>[index,{...model.formatting.formats[index].layout,...model.layouts[index],...value}]))});model.layouts=next;for(const field of host.querySelectorAll('[data-word-source]')){const index=Number(field.dataset.wordSource);if(indexes.includes(index))paintLayout(field,next[index]);}onChange();status.textContent='Paragraph layout updated.';}catch(error){status.textContent=error.message;}});
  return ()=>{for(const event of ['mouseup','keyup','focusin'])host.removeEventListener(event,track);};
}
