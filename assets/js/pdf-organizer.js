// Task 1 adapter: retain the existing text-based controls.
// Visual thumbnails, adaptive layout and expanded UX belong to Task 3.
import {
  el, action, notice, setupStatus, status, fileInput, bindFile, checkFile,
  pdfLib, output, downloads, clearOutputs, safeName
} from './core.js';
import {initialPlan, changePlan, buildOrganizedPdf} from './pdf-organizer-integrity.js';

export async function mount(root) {
  let source = null;
  let bytes = null;
  let filename = 'document.pdf';
  let plan = [];
  let revision = 0;
  const input = fileInput(root, '.pdf', false, 'Open a PDF');
  const list = el('ul', {class: 'file-list'});
  root.append(list);
  notice(root, 'Your PDF stays in this browser. Reordering and rotating retain original pages. Removing pages from PDFs with forms, bookmarks, or internal navigation may be blocked to prevent broken files. Digitally signed PDFs cannot be re-saved safely.');

  function renderList() {
    list.replaceChildren();
    plan.forEach((item, i) => {
      const row = el('li');
      const description = 'Page ' + (item.index + 1) + ' · ' +
        item.rotation + '°' + (item.keep ? '' : ' · Removed');
      function apply(operation) {
        const updated = changePlan(plan, operation, i);
        if (updated === plan) return;
        plan = updated;
        revision++;
        clearOutputs(); // Previously generated PDFs no longer match this page plan.
        renderList();
        status('Arrangement updated. Select Create PDF to generate the new result.');
      }
      row.append(
        el('span', {text: description}),
        action('↑', () => apply('up')),
        action('↓', () => apply('down')),
        action('Rotate', () => apply('rotate')),
        action(item.keep ? 'Remove' : 'Restore', () => apply('toggle'))
      );
      list.append(row);
    });
  }

  bindFile(input, async selected => {
    const file = selected[0];
    checkFile(file, ['pdf']);
    const newBytes = await file.arrayBuffer();
    const PDF = await pdfLib();
    const candidate = await PDF.PDFDocument.load(newBytes, {updateMetadata: false});
    if (!candidate.getPageCount()) throw Error('This PDF does not contain any pages.');
    const candidatePlan = initialPlan(candidate);
    // Publish the new document together with its new plan, never separately.
    source = candidate;
    bytes = newBytes;
    filename = file.name;
    plan = candidatePlan;
    revision++;
    clearOutputs();
    renderList();
  });

  root.append(el('div', {class: 'actions'}, [
    action('Create PDF', async () => {
      if (!source || !bytes) throw Error('Open a valid PDF first.');
      clearOutputs();
      const currentRevision = revision;
      const PDF = await pdfLib();
      const saved = await buildOrganizedPdf(bytes, plan, PDF);
      if (currentRevision !== revision) {
        throw Error('The page arrangement changed during export. Try again.');
      }
      output(new Blob([saved], {type: 'application/pdf'}),
        safeName(filename, '-organized', 'pdf'));
      status('Organized PDF ready. Review the file before using it.');
    }, true),
    action('Reset', () => {
      source = null;
      bytes = null;
      plan = [];
      revision++;
      list.replaceChildren();
      clearOutputs();
      status('Ready to open a PDF.');
    })
  ]));
  setupStatus(root);
  downloads(root);
}
