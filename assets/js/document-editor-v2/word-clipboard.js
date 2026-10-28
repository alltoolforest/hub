import {validateWordFormat} from './word-format.js';
// Parse inert clipboard markup. Never install pasted HTML, resources or event
// handlers in the editor. Only text and explicit font properties enter the model.
export function readWordClipboard(html,text,base,Parser=DOMParser){
 if(typeof html!=='string'||html.length>2_000_000)throw new Error('Clipboard content is too large.');
 if(!html)return null;const doc=new Parser().parseFromString(html,'text/html'),parts=[{runs:[]}];let total=0;
 const current=()=>parts.at(-1),line=()=>{if(current().runs.length)parts.push({runs:[]});};
 function walk(node,inherited,depth=0){
  if(depth>128)throw new Error('Clipboard nesting is too deep.');
  if(node.nodeType===3){const value=node.textContent;if(!value.trim()&&/[\r\n]/.test(value)&&(!node.parentElement||['BODY','DIV','UL','OL','TABLE','TBODY'].includes(node.parentElement.tagName)))return;if((total+=value.length)>1_000_000)throw new Error('Clipboard text is too large.');if(value)current().runs.push({text:value,format:{...inherited}});return;}
  if(node.nodeType!==1||['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','IMG','SVG','MATH','LINK','META','NOSCRIPT'].includes(node.tagName))return;
  const f={...inherited},s=node.style;if(['B','STRONG'].includes(node.tagName)||/^(bold|[6-9]00)$/.test(s.fontWeight))f.bold=true;if(s.fontWeight==='normal'||s.fontWeight==='400')f.bold=false;if(['I','EM'].includes(node.tagName)||s.fontStyle==='italic')f.italic=true;if(s.fontStyle==='normal')f.italic=false;
  if(s.fontFamily){const family=s.fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g,'');if(family&&family.length<=120&&!/[\x00-\x1f]/.test(family))f.font=family;}
  const size=/^([\d.]+)(pt|px)$/.exec(s.fontSize);if(size){const points=Number(size[1])*(size[2]==='px'?.75:1);if(Number.isFinite(points)&&points>=1&&points<=1638)f.size=points;}
  const color=s.color.match(/^rgb\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)\s*\)$/);if(color)f.color='#'+color.slice(1).map(n=>Number(n).toString(16).padStart(2,'0')).join('');else if(/^#[\da-f]{6}$/i.test(s.color))f.color=s.color;
  const format=validateWordFormat(f),block=['P','DIV','LI','H1','H2','H3','H4','H5','H6','TR'].includes(node.tagName);if(block)line();const initial=current();if(node.tagName==='BR'){current().runs.push({text:'\n',format});return;}for(const child of node.childNodes)walk(child,format,depth+1);if(block){if(current()===initial&&!initial.runs.length)initial.runs.push({text:'',format});line();}
 }
 for(const node of doc.body.childNodes)walk(node,base);if(!parts.at(-1).runs.length)parts.pop();if(!parts.length)return null;if(parts.length>10000)throw new Error('Too many clipboard paragraphs.');return parts;
}
export function copyWordSelection(event){const selection=window.getSelection();if(!event.clipboardData||!selection?.rangeCount)return;const range=selection.getRangeAt(0),container=document.createElement('div');container.append(range.cloneContents());for(const n of container.querySelectorAll('*')){for(const attr of [...n.attributes])if(attr.name!=='style')n.removeAttribute(attr.name);}event.clipboardData.setData('text/plain',selection.toString());event.clipboardData.setData('text/html',container.innerHTML);event.preventDefault();}
