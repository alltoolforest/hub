// PDF Organizer — Task 2 lifecycle adapter.
// Keep the existing text list. Visual page controls belong to Task 3.
import {
  el, notice, setupStatus, status, fileInput, pdfLib, output,
  downloads, clearOutputs, safeName
} from './core.js';
import {OrganizerSession, browserDeviceHints} from './pdf-organizer-lifecycle.js';

export async function mount(root) {
  const input = fileInput(root, '.pdf', false, 'Open a PDF');
  const list = el('ul', {class: 'file-list'});
  const current = el('p', {class: 'status', text: 'No PDF selected.'});
  root.append(current, list);
  notice(root, 'Your PDF stays in this browser. Reordering and rotating retain original pages. Removing pages from PDFs with forms, bookmarks, or internal navigation may be blocked to prevent broken files. Digitally signed PDFs cannot be re-saved safely.');

  const actions = el('div', {class: 'actions'});
  const makeButton = (label, fn, primary = false) => {
    const button = el('button', {type: 'button', text: label,
      class: primary ? 'primary' : ''});
    button.addEventListener('click', fn);
    return button;
  };
  const createButton = makeButton('Create PDF', () => {
    clearOutputs();
    void session.exportPdf();
  }, true);
  const resetButton = makeButton('Reset', () => session.reset());
  const cancelButton = makeButton('Cancel processing', () => session.cancel());
  actions.append(createButton, resetButton, cancelButton);
  root.append(actions);
  setupStatus(root);
  downloads(root);

  let listedRevision = -1;
  let session;
  function renderPageList(view) {
    list.replaceChildren();
    view.plan.forEach((item, i) => {
      const row = el('li');
      const description = 'Page ' + (item.index + 1) + ' · ' +
        item.rotation + '°' + (item.keep ? '' : ' · Removed');
      const change = operation => {
        if (session.change(operation, i)) clearOutputs();
      };
      const earlier = makeButton('↑', () => change('up'));
      const later = makeButton('↓', () => change('down'));
      const rotate = makeButton('Rotate', () => change('rotate'));
      const toggle = makeButton(item.keep ? 'Remove' : 'Restore',
        () => change('toggle'));
      earlier.disabled = view.busy || i === 0;
      later.disabled = view.busy || i === view.plan.length - 1;
      rotate.disabled = view.busy;
      toggle.disabled = view.busy;
      row.append(el('span', {text: description}),
        earlier, later, rotate, toggle);
      list.append(row);
    });
  }

  function onChange(view) {
    if (view.revision !== listedRevision) {
      // File replacement, page edits and reset immediately revoke old results.
      clearOutputs();
      renderPageList(view);
      listedRevision = view.revision;
    }
    const hasDoc = Boolean(view.filename);
    current.textContent = hasDoc ?
      'Selected: ' + view.filename + ' · ' + view.pageCount + ' pages' :
      'No PDF selected.';
    input.disabled = view.activity === 'exporting' || view.phase === 'cancelling';
    createButton.disabled = view.busy || !hasDoc;
    resetButton.disabled = view.busy || !hasDoc;
    cancelButton.disabled = !view.busy || view.phase === 'cancelling';
    for (const button of list.querySelectorAll('button')) {
      button.disabled = view.busy;
    }
    // Preserve boundary controls as disabled even while idle.
    if (!view.busy && view.plan.length) {
      list.firstElementChild?.querySelector('button')?.setAttribute('disabled', '');
      list.lastElementChild?.querySelectorAll('button')[1]?.setAttribute('disabled', '');
    }
    const progress = view.busy && view.phase !== 'cancelling' ?
      ' (' + view.percent + '%)' : '';
    status(view.message + progress, view.error);
  }

  session = new OrganizerSession({
    loadPdfLibrary: pdfLib,
    device: browserDeviceHints(navigator),
    onChange,
    onResult: (blob, name) => {
      output(blob, safeName(name, '-organized', 'pdf'));
    }
  });
  const limits = session.limits;
  notice(root, 'For stability on this device, PDF input is limited to ' +
    Math.floor(limits.maxBytes / 1024 ** 2) + ' MB and ' +
    limits.maxPages + ' pages per operation. Limits will be reassessed after device testing.');

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    if (file) void session.openFile(file);
  });
  onChange(session.snapshot());
  window.addEventListener('pagehide', () => {
    session.dispose();
    clearOutputs();
  }, {once: true});
}
