import {mountFindReplace} from '../find-replace.js';
const normalize=text=>text.replace(/\r\n?/g,'\n');

export async function openText(file){
  const source=new Uint8Array(await file.arrayBuffer());
  const bom=source[0]===239&&source[1]===187&&source[2]===191;
  const original=new TextDecoder('utf-8',{fatal:true}).decode(source);
  if(original.includes('\0'))throw new Error('This file contains binary data and is not text.');
  const initial=normalize(original),endings=original.match(/\r\n|\r|\n/g)||[];
  const counts=new Map();for(const ending of endings)counts.set(ending,(counts.get(ending)||0)+1);
  const newline=[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]||'\n';
  let text=initial,wrap=true,size=16;
  return {
    format:'txt',snapshot(){return text;},
    restore(value){if(typeof value!=='string'||value.includes('\0'))throw new Error('Invalid text draft.');text=normalize(value);},
    render(host,onChange){
      host.replaceChildren();
      const note=document.createElement('p');note.className='notice';
      const endingName=newline==='\r\n'?'Windows CRLF':newline==='\r'?'CR':'LF';
      note.textContent=`UTF-8 plain text · ${endingName} line endings${bom?' · BOM retained':''}. View controls do not change your text.`+(counts.size>1?' Mixed line endings are preserved until editing; edited exports use the most common ending.':'');
      const controls=document.createElement('div');controls.className='document-v2-actions';
      const field=document.createElement('textarea');field.className='document-v2-text';field.setAttribute('aria-label','Document text');field.spellcheck=true;field.value=text;
      const applyView=()=>{field.wrap=wrap?'soft':'off';field.style.whiteSpace=wrap?'pre-wrap':'pre';field.style.fontSize=size+'px';field.style.fontFamily='monospace';};applyView();
      const wrapLabel=document.createElement('label'),wrapInput=document.createElement('input');wrapInput.type='checkbox';wrapInput.setAttribute('aria-label','Wrap lines');wrapInput.checked=wrap;wrapLabel.append(wrapInput,' Wrap lines');wrapInput.addEventListener('change',()=>{wrap=wrapInput.checked;applyView();});
      const sizeLabel=document.createElement('label'),fontSize=document.createElement('select');sizeLabel.append('Text size ',fontSize);for(const n of [12,14,16,18,20,24]){const option=document.createElement('option');option.value=n;option.textContent=n+' px';fontSize.append(option);}fontSize.value=size;fontSize.addEventListener('change',()=>{size=Number(fontSize.value);applyView();});
      const lineLabel=document.createElement('label'),line=document.createElement('input');line.type='number';line.min='1';line.step='1';line.value='1';lineLabel.append('Go to line ',line);
      const go=document.createElement('button');go.type='button';go.textContent='Go';
      const status=document.createElement('p');status.setAttribute('role','status');
      const update=()=>{const position=field.selectionStart,prefix=text.slice(0,position),lines=text.split('\n').length;status.textContent=`${[...text].length} characters · ${text.trim()?text.trim().split(/\s+/u).length:0} words · ${lines} lines · Line ${prefix.split('\n').length}, column ${[...prefix.slice(prefix.lastIndexOf('\n')+1)].length+1}`;};
      go.addEventListener('click',()=>{const n=Number(line.value),lines=text.split('\n');if(!Number.isInteger(n)||n<1||n>lines.length){status.textContent=`Enter a line from 1 to ${lines.length}.`;return;}const offset=lines.slice(0,n-1).reduce((sum,value)=>sum+value.length+1,0);field.focus();field.setSelectionRange(offset,offset);update();});
      controls.append(wrapLabel,sizeLabel,lineLabel,go);host.append(note,controls,field,status);
      let refresh=()=>{};
      field.addEventListener('input',()=>{text=field.value;onChange();refresh();update();});
      for(const event of ['click','keyup','select'])field.addEventListener(event,update);
      refresh=mountFindReplace(host,{
        entries:()=>[{id:0,text}],
        replace:({start,end},value)=>{text=text.slice(0,start)+normalize(value)+text.slice(end);field.value=text;update();},
        reveal:({start,end})=>{field.focus();field.setSelectionRange(start,end);update();}
      },onChange);
      update();field.focus();
    },
    async export(){
      if(text===initial)return new Blob([source],{type:'text/plain;charset=utf-8'});
      const output=text.replace(/\n/g,newline),bytes=new TextEncoder().encode(output);
      if(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes)!==output)throw new Error('Text export validation failed. Your draft is retained.');
      return new Blob(bom?[new Uint8Array([239,187,191]),bytes]:[bytes],{type:'text/plain;charset=utf-8'});
    }
  };
}
