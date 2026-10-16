import {mountFindReplace} from '../find-replace.js';
import {load} from '../../core.js';
import {readDocx, writeDocx, updateDocxText, documentBlocks, snapshotDocx, restoreDocx, replaceDocxRange} from '../docx-package.js';

export async function open(file, format) {
  if (format === 'docx') {
    const zip = await load('zip');
    const model = await readDocx(file, zip, DOMParser);
    return {
      format,
      snapshot() { return snapshotDocx(model); },
      restore(snapshot) { restoreDocx(model, snapshot); },
      render(host, onChange) {
        host.replaceChildren();
        const note = document.createElement('p');
        note.className = 'notice';
        note.textContent = 'Text flows as you type. This is an approximate page preview. Unchanged text keeps its original run formatting in the exported DOCX; inserted text inherits the run at the insertion point. Complex paragraphs are protected from editing.';
        host.append(note);
        let refreshSearch = () => {};
        const fields = new Map();
        const page = document.createElement('div'); page.className = 'document-v2-page';
        function editable(paragraph) {
          const wrap = document.createElement('div');
          if (paragraph.pageBreak) {
            const marker = document.createElement('div'); marker.className = 'document-v2-break';
            marker.textContent = 'Explicit page break'; wrap.append(marker);
          }
          const field = document.createElement('div');
          field.className = 'document-v2-paragraph';
          fields.set(paragraph.index, field);
          field.contentEditable = paragraph.protected ? 'false' : 'true';
          field.setAttribute('role', 'textbox');
          field.setAttribute('aria-label', `Paragraph ${paragraph.index + 1}`);
          field.setAttribute('aria-multiline', 'true');
          field.textContent = model.text[paragraph.index];
          if (!paragraph.protected) {
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
          wrap.append(field); return wrap;
        }
        for (const block of documentBlocks(model)) {
          if (block.kind === 'paragraph') page.append(editable(block.paragraph));
          else {
            const table = document.createElement('table'); table.className = 'document-v2-doc-table';
            for (const cells of block.rows) {
              const tr = document.createElement('tr');
              for (const content of cells) {
                const td = document.createElement('td');
                content.forEach(paragraph => td.append(editable(paragraph)));
                tr.append(td);
              }
              table.append(tr);
            }
            page.append(table);
          }
        }
        host.append(page);
        refreshSearch = mountFindReplace(host, {
          entries: () => model.text.map((text, id) => ({id, text, protected:model.protected[id] || !fields.has(id)})),
          replace: ({id, start, end}, value) => { replaceDocxRange(model, id, start, end, value); fields.get(id).textContent = model.text[id]; },
          reveal: ({id, start, end}) => {
            const field = fields.get(id); field.focus(); field.scrollIntoView?.({block:'nearest'});
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
      export() { return writeDocx(model, zip, DOMParser, XMLSerializer); }
    };
  }
  if (format !== 'txt') throw new Error(`${format.toUpperCase()} editing is still under construction in this isolated workstream.`);
  const text = new TextDecoder('utf-8', {fatal:true}).decode(await file.arrayBuffer());
  return {
    format, text,
    snapshot() { return this.text; },
    restore(snapshot) { this.text = String(snapshot); },
    render(host, onChange) {
      const textarea = document.createElement('textarea');
      textarea.className = 'document-v2-text';
      textarea.setAttribute('aria-label', 'Document text');
      textarea.spellcheck = true;
      textarea.value = this.text;
      let refreshSearch = () => {};
      textarea.addEventListener('input', () => { this.text = textarea.value; onChange(); refreshSearch(); });
      host.replaceChildren(textarea);
      refreshSearch = mountFindReplace(host, {
        entries: () => [{id:0, text:this.text}],
        replace: ({start, end}, value) => { this.text = this.text.slice(0, start) + value + this.text.slice(end); textarea.value = this.text; },
        reveal: ({start, end}) => { textarea.focus(); textarea.setSelectionRange(start, end); }
      }, onChange);
      textarea.focus();
    },
    async export() {
      const bytes = new TextEncoder().encode(this.text);
      const decoded = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
      if (decoded !== this.text) throw new Error('Text export validation failed. Your draft is retained.');
      return new Blob([bytes], {type: 'text/plain;charset=utf-8'});
    }
  };
}
