import {canShareSectionPage} from '../word-sections.js';
import {paintTablePreview,paintCellPreview} from '../word-table-preview.js';
import {editWordPackage,mountWordAdvanced} from '../word-advanced.js';
import {mountLayoutControls} from '../word-layout.js';
import {openText} from './text.js';
import {readPreviewImages,showFontAvailability} from '../word-preview.js';
import {mergeSourceParagraph,canStructure,mountStructure,structureParts,structureText,replaceStructure} from '../word-structure.js';
import {paginateWord} from '../word-pagination.js';
import {wordFlowGroup} from '../word-flow-selection.js';
import {wordToolbar} from '../word-toolbar.js';
import {styleWordNode} from '../word-format.js';
import {mountFindReplace} from '../find-replace.js';
import {load} from '../../core.js';
import {readDocx, writeDocx, updateDocxText, documentBlocks, snapshotDocx, restoreDocx, replaceDocxRange} from '../docx-package.js';

export async function open(file, format) {
  if (format === 'docx') {
    const zip = await load('zip');
    let model = await readDocx(file, zip, DOMParser);
    let images=await readPreviewImages(model,DOMParser);
    let disposeLayout=()=>{};
    let operations=[],closed=false,advancedBusy=false,revision=0;
    const encode=bytes=>{let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);};
    const decode=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
    const api={
      format,
      snapshot() { return {...snapshotDocx(model),wordOperations:structuredClone(operations)}; },
      async restore(snapshot) {
        revision++;
        const next=snapshot.wordOperations||[];if(!Array.isArray(next)||next.length>30||JSON.stringify(next).length>30_000_000)throw new Error('Invalid advanced Word recovery.');
        if(JSON.stringify(next)!==JSON.stringify(operations)){
          let candidate=await readDocx(file,zip,DOMParser);
          for(const entry of next){restoreDocx(candidate,entry.snapshot);const command={...entry.command};if(command.bytes)command.bytes=decode(command.bytes);const bytes=await editWordPackage(candidate,zip,DOMParser,XMLSerializer,command);candidate=await readDocx(bytes,zip,DOMParser);}
          restoreDocx(candidate,snapshot);const nextImages=await readPreviewImages(candidate,DOMParser);model=candidate;images=nextImages;operations=structuredClone(next);
        }else restoreDocx(model,snapshot);
      },
      render(host, onChange) {
        disposeLayout();const advancedPanel=host.querySelector('[data-word-advanced]');if(advancedPanel)host.dataset.wordAdvancedOpen=String(advancedPanel.open);host.replaceChildren();host.dataset.wordRevision=String(operations.length);
        const note = document.createElement('p');
        note.className = 'notice';
        note.textContent = 'Fonts and sizes are read from the document. Text flows between preview pages as you edit; browser pagination can differ from Word, especially when fonts are unavailable. New text inherits its surrounding run. Select text to format a range in ordinary paragraphs; with no selection, formatting applies to the paragraph. Complex content is preserved in export and may not be fully shown in this preview.';
        host.append(note);showFontAvailability(host,model);
        const formatting=wordToolbar(host,model,onChange);
        const disposeParagraphLayout=mountLayoutControls(host,model,onChange);
        const commitAdvanced=async command=>{
          if(advancedBusy||closed)throw new Error('Word operation is unavailable.');if(operations.length>=30)throw new Error('This session has reached 30 advanced changes. Export and reopen to continue.');
          advancedBusy=true;const startedRevision=revision;const before=snapshotDocx(model),signature=JSON.stringify(before);
          try{const bytes=await editWordPackage(model,zip,DOMParser,XMLSerializer,command),candidate=await readDocx(bytes,zip,DOMParser),nextImages=await readPreviewImages(candidate,DOMParser);
            if(closed||revision!==startedRevision||JSON.stringify(snapshotDocx(model))!==signature)throw new Error('Document changed while applying this operation. Retry with the current text.');
            const saved={...command};if(saved.bytes)saved.bytes=encode(saved.bytes);const next=[...operations,{snapshot:before,command:saved}];if(JSON.stringify(next).length>30_000_000)throw new Error('Advanced recovery budget reached. Export and reopen to continue.');
            model=candidate;images=nextImages;operations=next;api.render(host,onChange);onChange();
          }finally{advancedBusy=false;}
        };
        mountWordAdvanced(host,model,commitAdvanced,DOMParser).catch(error=>{note.textContent=error.message;});
        let refreshSearch = () => {};
        const fields = new Map(),structured=new Map(),additionFields=new Map();
        const page = document.createElement('div'); page.className = 'document-v2-page';
        function editable(paragraph) {
          const wrap = document.createElement('div');
          if (paragraph.pageBreak) {
            const marker = document.createElement('div'); marker.className = 'document-v2-break';
            marker.textContent = 'Explicit page break'; wrap.append(marker);
          }
          if(canStructure(model,paragraph.index)){
            if(paragraph.pageBreak)wrap.style.breakBefore='column';
            const view=mountStructure({model,index:paragraph.index,container:wrap,formatting,onStatus:message=>{note.textContent=message;},onChange:()=>{onChange();refreshSearch();},onBoundary:(index,direction)=>{const merged=mergeSourceParagraph(model,index,direction);if(!merged)return;structured.get(merged.left).refresh();structured.get(merged.right).refresh();onChange();refreshSearch();structured.get(merged.left).focus(merged.part,merged.offset);},register:(id,field)=>fields.set(id,field)});structured.set(paragraph.index,view);return wrap;
          }
          const field = document.createElement('div');
          field.className = 'document-v2-paragraph';
          fields.set(paragraph.index, field);
          if(!paragraph.protected)field.dataset.wordSource=String(paragraph.index);
          field.contentEditable = paragraph.protected ? 'false' : 'true';
          field.setAttribute('role', 'textbox');
          field.setAttribute('aria-label', `Paragraph ${paragraph.index + 1}`);
          field.setAttribute('aria-multiline', 'true');
          field.textContent = model.text[paragraph.index];
          if(!paragraph.protected)formatting.paint(field,paragraph.index);
          if (!paragraph.protected) {
            const activate=()=>{
              const selection=window.getSelection(),range=document.createRange();let offset=0;
              if(selection?.anchorNode&&field.contains(selection.anchorNode)){range.selectNodeContents(field);range.setEnd(selection.anchorNode,selection.anchorOffset);offset=range.toString().length;}
              let run=0;while(run<model.runs[paragraph.index].length-1&&offset>model.runs[paragraph.index][run].length){offset-=model.runs[paragraph.index][run].length;run++;}
              const info=model.formatting.formats[paragraph.index];
              formatting.activate({apply:format=>{model.overrides[paragraph.index]=format;formatting.paint(field,paragraph.index);}},model.overrides[paragraph.index]||info.runs[run]||info.base);
            };
            field.addEventListener('focus',activate);field.addEventListener('keyup',activate);field.addEventListener('mouseup',activate);
            field.addEventListener('blur',()=>formatting.paint(field,paragraph.index));
            const insertPlain = text => {
              const selection = getSelection();
              if (!selection?.rangeCount || !field.contains(selection.anchorNode)) return;
              const range = selection.getRangeAt(0);
              range.deleteContents();
              const node = document.createTextNode(text);
              range.insertNode(node);
              range.setStartAfter(node); range.collapse(true);
              selection.removeAllRanges(); selection.addRange(range);
              field.dispatchEvent(new Event('input', {bubbles:true}));
            };
            field.addEventListener('beforeinput', event => {
              if (event.inputType === 'insertParagraph') { event.preventDefault(); insertPlain('\n'); }
            });
            field.addEventListener('paste', event => {
              event.preventDefault(); insertPlain(event.clipboardData.getData('text/plain'));
            });
            field.addEventListener('drop', event => event.preventDefault());
            field.addEventListener('input', () => { updateDocxText(model, paragraph.index, field.textContent); onChange(); refreshSearch(); });
          } else { field.setAttribute('aria-readonly','true'); field.textContent += ' [Protected content retained in export]'; }
          if(paragraph.pageBreak)wrap.style.breakBefore='column';
          if(model.numbering[paragraph.index]){const marker=document.createElement('span');marker.textContent=model.numbering[paragraph.index];marker.setAttribute('aria-label','List marker');marker.style.marginRight='8pt';wrap.style.display='flex';field.style.flex='1';wrap.append(marker);}
          wrap.append(field);
          for(const image of images.get(paragraph.index)||[]){const img=document.createElement('img');img.src=image.src;img.alt=image.alt;img.style.width=image.width+'px';img.style.maxWidth='100%';img.style.height='auto';if(image.height)img.style.aspectRatio=image.width+' / '+image.height;wrap.append(img);}
          return wrap;
        }
        function renderBlocks(blocks,parent){
          let flow=null;
          for(const block of blocks){
            if(block.kind==='paragraph'){
              if(canStructure(model,block.paragraph.index)){
                if(!flow||block.paragraph.pageBreak){flow=wordFlowGroup({model,views:structured,onChange:()=>{onChange();refreshSearch();},onStatus:message=>{note.textContent=message;},formatting,onHistory:action=>host.closest('#document-v2')?.querySelector(`[data-action=${action}]`)?.click()});parent.append(flow);}
                flow.append(editable(block.paragraph));
              }else{flow=null;parent.append(editable(block.paragraph));}
              continue;
            }
            flow=null;
            const table=document.createElement('table');table.className='document-v2-doc-table';paintTablePreview(table,block.preview);
            for(const [rowIndex,cells] of block.rows.entries()){const tr=document.createElement('tr');Object.assign(tr.style,cells[0]?.rowPreview||{});let column=0;const columns=cells.reduce((n,c)=>n+c.colspan,0);
              for(const cell of cells){const start=column;column+=cell.colspan;if(cell.hidden)continue;const td=document.createElement('td');td.colSpan=cell.colspan;td.rowSpan=cell.rowspan;paintCellPreview(td,cell.preview,block.preview,{Top:rowIndex===0,Bottom:rowIndex+cell.rowspan===block.rows.length,Left:start===0,Right:column===columns});renderBlocks(cell.blocks,td);tr.append(td);}
              table.append(tr);
            }
            parent.append(table);
          }
        }
        const sectionPages=[],blocks=documentBlocks(model),sections=model.formatting.sections||[];let remaining=[...blocks];
        function lastIndex(block){return block.kind==='paragraph'?block.paragraph.index:Math.max(-1,...block.rows.flatMap(row=>row.flatMap(cell=>cell.blocks.map(lastIndex))));}
        if(sections.length>1){for(const section of sections){const previous=sectionPages.at(-1),shared=previous&&canShareSectionPage(sections[section.index-1],section),target=sectionPages.length?document.createElement('div'):page;target.className=shared?'document-v2-continuous-section':'document-v2-page';target.dataset.wordSection=String(section.index);const owned=[];while(remaining.length&&lastIndex(remaining[0])<=section.endParagraph)owned.push(remaining.shift());renderBlocks(owned,target);if(shared)previous.page.append(target);else sectionPages.push({page:target,geometry:section});}if(remaining.length)renderBlocks(remaining,sectionPages.at(-1).page);}else{renderBlocks(blocks,page);sectionPages.push({page,geometry:sections[0]||model.formatting.page});}
        const additions=document.createElement('div');sectionPages.at(-1).page.append(additions);
        function renderAddition(item,index){
          const field=document.createElement('div');field.className='document-v2-paragraph';field.contentEditable='true';field.setAttribute('role','textbox');field.setAttribute('aria-multiline','true');field.setAttribute('aria-label',`New paragraph ${index+1}`);field.textContent=item.text;styleWordNode(field,item.format);additionFields.set(index,field);
          field.addEventListener('focus',()=>formatting.activate({apply:format=>{item.format=format;styleWordNode(field,format);}},item.format));
          field.addEventListener('beforeinput',event=>{
            const selection=window.getSelection();if(!selection?.rangeCount)return;const range=selection.getRangeAt(0);if(!field.contains(range.startContainer)||!field.contains(range.endContainer))return;
            const prefix=range.cloneRange();prefix.selectNodeContents(field);prefix.setEnd(range.startContainer,range.startOffset);const start=prefix.toString().length,end=start+range.toString().length,position=model.additions.indexOf(item);
            if(event.inputType==='insertParagraph'){
              event.preventDefault();const right={text:item.text.slice(end),format:{...item.format}};item.text=item.text.slice(0,start);model.additions.splice(position+1,0,right);refreshAdditions(position+1,0);
            }else if(event.inputType==='deleteContentBackward'&&start===0&&end===0&&position>0){
              event.preventDefault();const previous=model.additions[position-1],offset=previous.text.length;
              if(JSON.stringify(previous.format)!==JSON.stringify(item.format)){note.textContent='These paragraphs have different formatting; merging them is not supported yet.';return;}
              previous.text+=item.text;model.additions.splice(position,1);refreshAdditions(position-1,offset);
            }
          });
          field.addEventListener('paste',event=>{
            event.preventDefault();const selection=window.getSelection();if(!selection?.rangeCount||!field.contains(selection.anchorNode))return;const range=selection.getRangeAt(0);range.deleteContents();const text=document.createTextNode(event.clipboardData.getData('text/plain'));range.insertNode(text);range.setStartAfter(text);range.collapse(true);selection.removeAllRanges();selection.addRange(range);field.dispatchEvent(new Event('input'));
          });
          field.addEventListener('drop',event=>event.preventDefault());field.addEventListener('input',()=>{item.text=field.textContent;onChange();refreshSearch();});additions.append(field);return field;
        }
        function refreshAdditions(index,offset){
          additions.replaceChildren();additionFields.clear();model.additions.forEach(renderAddition);onChange();refreshSearch();const field=additionFields.get(index);field?.focus();
          if(field){const range=document.createRange();if(field.firstChild)range.setStart(field.firstChild,Math.min(offset,field.firstChild.length));else range.selectNodeContents(field);range.collapse(true);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);}
        }
        function addParagraph(format){const item={text:'',format:{...format}};model.additions.push(item);const field=renderAddition(item,model.additions.length-1);onChange();refreshSearch();field.focus();}
        model.additions.forEach(renderAddition);
        const add=document.createElement('button');add.type='button';add.textContent='Add paragraph at document end';add.addEventListener('click',async()=>{try{await commitAdvanced({type:'paragraph',format:formatting.values()});[...host.querySelectorAll('[data-word-source]')].at(-1)?.focus();}catch(error){note.textContent=error.message;}});formatting.toolbar.append(add);if(model.additions.length){const integrate=document.createElement('button');integrate.type='button';integrate.textContent='Integrate recovered end paragraphs';integrate.addEventListener('click',()=>commitAdvanced({type:'integrate'}).catch(error=>{note.textContent=error.message;}));formatting.toolbar.append(integrate);}
        const pagination=sectionPages.map(({page,geometry})=>paginateWord(host,page,geometry));disposeLayout=()=>{for(const dispose of pagination)dispose();disposeParagraphLayout();};
        refreshSearch = mountFindReplace(host, {
          entries: () => [...model.text.flatMap((text,id)=>structured.has(id)?structureParts(model,id).map((part,i)=>({id:`${id}:${i}`,text:structureText(part),protected:false})):[{id,text,protected:model.protected[id]||!fields.has(id)}]),...model.additions.map((item,i)=>({id:`new:${i}`,text:item.text,protected:false}))],
          replace: ({id, start, end}, value) => {
            if(typeof id==='string'){
              const [group,part]=id.split(':');if(group==='new'){const item=model.additions[Number(part)];item.text=item.text.slice(0,start)+value+item.text.slice(end);additionFields.get(Number(part)).textContent=item.text;}
              else{replaceStructure(model,Number(group),Number(part),start,end,value);structured.get(Number(group)).refresh();}
            }else{replaceDocxRange(model, id, start, end, value); formatting.paint(fields.get(id),id);}
          },
          reveal: ({id, start, end}) => {
            const field = typeof id==='string'&&id.startsWith('new:')?additionFields.get(Number(id.slice(4))):fields.get(id); field.focus(); field.scrollIntoView?.({block:'nearest'});
            // Browsers may split editable content into multiple text nodes.
            const walker = document.createTreeWalker(field, 4);
            const range = document.createRange();
            let node, offset = 0, started = false;
            while ((node = walker.nextNode())) {
              const limit = offset + node.textContent.length;
              if (!started && start <= limit) { range.setStart(node, start - offset); started = true; }
              if (started && end <= limit) { range.setEnd(node, end - offset); break; }
              offset = limit;
            }
            if (!started || !node) return;
            const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
          }
        }, onChange);
      },
      dispose(){closed=true;disposeLayout();},
      export() { if(advancedBusy)throw new Error('Wait for the current Word operation to finish.');return writeDocx(model, zip, DOMParser, XMLSerializer); }
    };
    return api;
  }
  if (format !== 'txt') throw new Error(`${format.toUpperCase()} editing is still under construction in this isolated workstream.`);
  return openText(file);
}
