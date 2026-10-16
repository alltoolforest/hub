import {load, openPDF} from '../../core.js';

export async function open(file, format) {
  if (format !== 'pdf') throw new Error('Unsupported PDF format.');
  const bytes = await file.arrayBuffer();
  let renderer = await openPDF(bytes);
  const PdfLib = await load('pdf');
  const source = await PdfLib.PDFDocument.load(bytes, {ignoreEncryption:false});
  if (renderer.numPages !== source.getPageCount()) throw new Error('PDF page counts do not agree.');
  const additions = [];
  let current = 0;
  async function render(host, onChange) {
    host.replaceChildren();
    const note = document.createElement('p');
    note.className = 'notice';
    note.textContent = 'Click a page to place new text. Existing text and page objects stay in the PDF. Native text editing, OCR and controlled reflow are under construction; this lab does not erase or replace existing text.';
    host.append(note);
    const navigation = document.createElement('div'); navigation.className = 'document-v2-actions';
    const previous = document.createElement('button'); previous.type = 'button'; previous.textContent = 'Previous page'; previous.disabled = current === 0;
    const next = document.createElement('button'); next.type = 'button'; next.textContent = 'Next page'; next.disabled = current === renderer.numPages - 1;
    const label = document.createElement('span'); label.textContent = `Page ${current + 1} of ${renderer.numPages}`;
    const rerender = () => render(host, onChange).catch(error => {
      const message = document.createElement('p'); message.className = 'status error'; message.textContent = error.message;
      host.append(message);
    });
    previous.addEventListener('click', () => { current--; rerender(); });
    next.addEventListener('click', () => { current++; rerender(); });
    navigation.append(previous, label, next); host.append(navigation);
    const page = await renderer.getPage(current + 1);
    const nativeText = await page.getTextContent();
    const description = document.createElement('p');
    description.textContent = nativeText.items.some(item => item.str?.trim()) ? 'Selectable text detected on this page.' : 'No selectable text detected; this page may be a scan.';
    host.append(description);
    const scale = Math.min(1.4, Math.max(.6, 850 / page.getViewport({scale:1}).width));
    const viewport = page.getViewport({scale});
    const ratio = Math.min(devicePixelRatio || 1, 2, Math.sqrt(4_000_000 / (viewport.width * viewport.height)));
    const canvas = document.createElement('canvas');
    canvas.className = 'document-v2-pdf-page';
    canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
    canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    const context = canvas.getContext('2d');
    await page.render({canvasContext:context, canvas, viewport, transform:[ratio,0,0,ratio,0,0]}).promise;
    const placement = document.createElement('div'); placement.className = 'document-v2-pdf-wrap'; placement.append(canvas); host.append(placement);
    if (page.rotate % 360) {
      const warning = document.createElement('p'); warning.className = 'notice';
      warning.textContent = 'Adding text to rotated pages is disabled until coordinates can be verified.'; host.append(warning);
    } else canvas.addEventListener('click', event => {
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) * viewport.width / rect.width;
      const y = (event.clientY - rect.top) * viewport.height / rect.height;
      const [pdfX,pdfY] = viewport.convertToPdfPoint(x,y);
      const value = prompt('Text to add at this position:');
      if (!value?.trim()) return;
      additions.push({page:current, x:pdfX, y:pdfY, text:value.trim()});
      onChange();
      rerender();
    });
    const count = additions.filter(item => item.page === current).length;
    const summary = document.createElement('p'); summary.textContent = `${count} new text item${count === 1 ? '' : 's'} on this page.`;
    host.append(summary);
    page.cleanup();
  }
  return {
    format,
    dispose() { return renderer.destroy(); },
    snapshot() { return {current, additions:additions.map(item => ({...item}))}; },
    restore(snapshot) {
      if (!Array.isArray(snapshot.additions)) throw new Error('The PDF draft is invalid.');
      additions.splice(0, additions.length, ...snapshot.additions);
      current = Math.max(0, Math.min(renderer.numPages - 1, snapshot.current || 0));
    },
    render,
    async export() {
      const pdf = await PdfLib.PDFDocument.load(bytes, {ignoreEncryption:false});
      const font = await pdf.embedFont(PdfLib.StandardFonts.Helvetica);
      for (const item of additions) {
        if (item.page < 0 || item.page >= pdf.getPageCount() || !Number.isFinite(item.x) || !Number.isFinite(item.y))
          throw new Error('The PDF draft contains an invalid text position.');
        pdf.getPage(item.page).drawText(item.text, {x:item.x, y:item.y, size:12, font, color:PdfLib.rgb(0,0,0)});
      }
      const output = await pdf.save();
      const check = await openPDF(output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength));
      try {
        if (check.numPages !== renderer.numPages) throw new Error('PDF export changed the page count.');
        for (const item of additions) {
          const page = await check.getPage(item.page + 1);
          const text = await page.getTextContent();
          if (!text.items.some(fragment => fragment.str?.includes(item.text)))
            throw new Error('PDF export lost an added text item.');
          page.cleanup();
        }
      } finally { await check.destroy(); }
      return new Blob([output], {type:'application/pdf'});
    }
  };
}
