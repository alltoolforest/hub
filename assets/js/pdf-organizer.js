// Organize PDF Pages — Task 3 visual workspace.
// The UI reflects OrganizerSession; DOM order is never the PDF export source of truth.
import {
  el, notice, setupStatus, status, fileInput, pdfLib, output,
  downloads, clearOutputs, safeName, load, url
} from './core.js';
import {OrganizerSession, browserDeviceHints} from './pdf-organizer-lifecycle.js';
import {OrganizerThumbnails} from './pdf-organizer-thumbnails.js';

async function openPreviewDocument(bytes) {
  const pdfjs = await load('pdfjs');
  pdfjs.GlobalWorkerOptions.workerSrc = url('assets/vendor/pdf.worker.mjs');
  return pdfjs.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    cMapUrl: url('assets/vendor/cmaps/'), cMapPacked: true,
    standardFontDataUrl: url('assets/vendor/standard_fonts/'),
    wasmUrl: url('assets/vendor/wasm/')
  }).promise;
}

export async function mount(root) {
  root.classList.add('pdf-organizer');
  const input = fileInput(root, '.pdf', false, 'Open a PDF');
  const current = el('p', {class: 'pdf-organizer-current', text: 'No PDF selected.'});
  const help = el('p', {
    id: 'pdf-organizer-help', class: 'pdf-organizer-help',
    text: 'Drag the grip to reorder pages. On a phone, hold the grip and move it onto another page. You can also use Move earlier, Move later, or Move to position. Rotate and remove actions change the exported PDF, not the original.'
  });
  const grid = el('ul', {class: 'pdf-organizer-grid', 'aria-label': 'PDF pages', 'aria-describedby': 'pdf-organizer-help'});
  const feedback = el('p', {class: 'pdf-organizer-announcement', role: 'status', 'aria-live': 'polite'});
  root.append(current, help, grid, feedback);
  notice(root, 'Your PDF stays in this browser. Original page content is used for export. Some documents with forms, bookmarks, internal navigation, or digital signatures cannot be changed safely.');

  const actions = el('div', {class: 'actions'});
  const makeButton = (label, onClick, primary = false, accessibleName = label) => {
    const button = el('button', {type: 'button', text: label,
      class: primary ? 'primary' : '', 'aria-label': accessibleName});
    button.addEventListener('click', onClick);
    return button;
  };
  let session;
  let documentId = -1;
  let renderedRevision = -1;
  const cards = new Map();
  let draggedKey = null;
  let touchDrag = null;

  const renderer = new OrganizerThumbnails({
    openDocument: openPreviewDocument,
    onError: message => { feedback.textContent = message; }
  });

  const exportButton = makeButton('Create PDF', () => {
    clearOutputs();
    void session.exportPdf();
  }, true, 'Save the current organized PDF');
  const resetButton = makeButton('Reset', () => session.reset());
  const cancelButton = makeButton('Cancel processing', () => session.cancel());
  actions.append(exportButton, resetButton, cancelButton);
  root.append(actions);
  setupStatus(root);
  downloads(root);

  const originalKey = target => target?.closest?.('[data-page-key]')?.dataset?.pageKey;
  function indexOf(originalIndex) {
    return session.snapshot().plan.findIndex(item => item.index === originalIndex);
  }
  function apply(originalIndex, action) {
    const from = indexOf(originalIndex);
    if (from < 0) return false;
    const updated = session.change(action, from);
    if (updated) clearOutputs();
    return updated;
  }
  function move(originalIndex, targetIndex) {
    const from = indexOf(originalIndex);
    if (from < 0) return false;
    const moved = session.moveTo(from, targetIndex);
    if (moved) clearOutputs();
    return moved;
  }
  function moveOnto(sourceKey, targetKey) {
    const sourceIndex = Number(sourceKey);
    const targetIndex = indexOf(Number(targetKey));
    if (!Number.isSafeInteger(sourceIndex) || targetIndex < 0) return false;
    const moved = move(sourceIndex, targetIndex);
    if (moved) cards.get(sourceIndex)?.handle.focus({preventScroll: true});
    return moved;
  }

  function createCard(item) {
    const originalIndex = item.index;
    const card = el('li', {class: 'pdf-page-card', 'data-page-key': String(originalIndex)});
    const handle = makeButton('⋮⋮', () => {}, false,
      'Drag original page ' + (originalIndex + 1) + ' to a new position');
    handle.classList.add('pdf-page-grip');
    handle.setAttribute('aria-describedby', 'pdf-organizer-help');
    handle.title = 'Drag page to reorder';
    card.draggable = false;
    handle.draggable = true; // Only the explicit grip starts a desktop drag.
    card.addEventListener('dragstart', event => {
      if (session.snapshot().busy) { event.preventDefault(); return; }
      draggedKey = String(originalIndex);
      event.dataTransfer?.setData('text/plain', draggedKey);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      card.classList.add('is-dragging');
    });
    card.addEventListener('dragover', event => {
      if (draggedKey === null || session.snapshot().busy) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      card.classList.add('is-drop-target');
    });
    card.addEventListener('dragleave', () => card.classList.remove('is-drop-target'));
    card.addEventListener('drop', event => {
      event.preventDefault();
      const key = draggedKey;
      draggedKey = null;
      for (const c of cards.values()) c.card.classList.remove('is-drop-target', 'is-dragging');
      if (key !== null) moveOnto(key, String(originalIndex));
    });
    card.addEventListener('dragend', () => {
      draggedKey = null;
      for (const c of cards.values()) c.card.classList.remove('is-drop-target', 'is-dragging');
    });

    handle.addEventListener('pointerdown', event => {
      if (!['touch', 'pen'].includes(event.pointerType) || session.snapshot().busy) return;
      touchDrag = {id: event.pointerId, source: originalIndex,
        target: originalIndex, startX: event.clientX, startY: event.clientY, moving: false};
      handle.setPointerCapture?.(event.pointerId);
    });
    handle.addEventListener('pointermove', event => {
      if (!touchDrag || touchDrag.id !== event.pointerId) return;
      if (!touchDrag.moving && Math.hypot(event.clientX - touchDrag.startX,
        event.clientY - touchDrag.startY) < 8) return;
      touchDrag.moving = true;
      card.classList.add('is-dragging');
      const targetKey = originalKey(document.elementFromPoint(event.clientX, event.clientY));
      if (targetKey === undefined) return;
      touchDrag.target = Number(targetKey);
      for (const c of cards.values()) c.card.classList.toggle('is-drop-target',
        String(c.key) === targetKey && c.key !== originalIndex);
    });
    function finishPointer(event, cancelled = false) {
      if (!touchDrag || touchDrag.id !== event.pointerId) return;
      const ending = touchDrag;
      touchDrag = null;
      for (const c of cards.values()) c.card.classList.remove('is-dragging', 'is-drop-target');
      try { if (handle.hasPointerCapture?.(event.pointerId)) handle.releasePointerCapture(event.pointerId); } catch {}
      if (!cancelled && ending.moving && ending.target !== ending.source) {
        moveOnto(String(ending.source), String(ending.target));
      }
    }
    handle.addEventListener('pointerup', event => finishPointer(event));
    handle.addEventListener('pointercancel', event => finishPointer(event, true));

    const preview = el('div', {class: 'pdf-page-preview', 'aria-label':
      'Preview of original page ' + (originalIndex + 1)});
    const caption = el('p', {class: 'pdf-page-caption'});
    const controls = el('div', {class: 'pdf-page-controls'});
    const earlier = makeButton('↑', () => apply(originalIndex, 'up'), false,
      'Move original page ' + (originalIndex + 1) + ' earlier');
    const later = makeButton('↓', () => apply(originalIndex, 'down'), false,
      'Move original page ' + (originalIndex + 1) + ' later');
    const rotate = makeButton('↻ Rotate', () => apply(originalIndex, 'rotate'), false,
      'Rotate original page ' + (originalIndex + 1) + ' clockwise 90 degrees');
    const toggle = makeButton('Remove', () => apply(originalIndex, 'toggle'));
    controls.append(earlier, later, rotate, toggle);
    const positionBox = el('details', {class: 'pdf-page-move'});
    const summary = el('summary', {text: 'Move to position'});
    const positionInputId = 'pdf-page-destination-' + originalIndex;
    const positionLabel = el('label', {text: 'Destination position', for: positionInputId});
    const positionInput = el('input', {id: positionInputId, type: 'number', min: 1, step: 1,
      'aria-label': 'New position for original page ' + (originalIndex + 1)});
    const jump = makeButton('Move', () => {
      const target = Number(positionInput.value);
      if (!Number.isSafeInteger(target) || target < 1 || target > session.snapshot().plan.length) {
        feedback.textContent = 'Enter a destination between 1 and ' +
          session.snapshot().plan.length + '.';
        positionInput.focus(); return;
      }
      if (move(originalIndex, target - 1)) {
        positionBox.open = false;
        cards.get(originalIndex)?.handle.focus({preventScroll: true});
      }
    }, false, 'Move original page ' + (originalIndex + 1) + ' to entered position');
    positionInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); jump.click(); }
    });
    positionBox.append(summary, positionLabel, positionInput, jump);
    card.append(handle, preview, caption, controls, positionBox);
    const entry = {key: originalIndex, card, handle, preview, caption, earlier,
      later, rotate, toggle, positionInput, jump};
    renderer.observe(originalIndex, item.rotation, preview);
    return entry;
  }

  function draw(view) {
    if (view.documentId !== documentId) {
      documentId = view.documentId;
      cards.clear();
      renderer.close();
      if (view.filename) {
        // PDF.js gets a copy because its worker may transfer the input buffer.
        const source = session.previewSource();
        if (source) void renderer.open(source, documentId);
      }
    }
    if (renderedRevision === view.revision) return;
    let outputPosition = 0;
    const count = view.plan.filter(item => item.keep).length;
    const nodes = [];
    for (const [i, item] of view.plan.entries()) {
      let entry = cards.get(item.index);
      if (!entry) {
        entry = createCard(item);
        cards.set(item.index, entry);
      }
      entry.card.dataset.position = String(i);
      entry.card.classList.toggle('is-removed', !item.keep);
      entry.card.setAttribute('aria-label', 'Original page ' + (item.index + 1) +
        ', position ' + (i + 1) + ', ' + (item.keep ? 'included' : 'removed'));
      entry.caption.textContent = item.keep ?
        'Original ' + (item.index + 1) + ' · Output ' + (++outputPosition) +
          ' of ' + count + ' · ' + item.rotation + '°' :
        'Original ' + (item.index + 1) + ' · Removed · ' + item.rotation + '°';
      entry.toggle.textContent = item.keep ? 'Remove' : 'Restore';
      entry.toggle.setAttribute('aria-label',
        (item.keep ? 'Remove' : 'Restore') + ' original page ' + (item.index + 1));
      entry.earlier.disabled = view.busy || i === 0;
      entry.later.disabled = view.busy || i === view.plan.length - 1;
      entry.rotate.disabled = view.busy;
      entry.toggle.disabled = view.busy;
      entry.handle.disabled = view.busy;
      entry.positionInput.disabled = view.busy;
      entry.jump.disabled = view.busy;
      entry.positionInput.max = String(view.plan.length);
      entry.positionInput.value = String(i + 1);
      renderer.update(item.index, item.rotation);
      nodes.push(entry.card);
    }
    // Moving nodes with replaceChildren may temporarily drop browser focus.
    // Restore the focused control (or its page grip if it became disabled).
    const focused = document.activeElement;
    const focusedKey = originalKey(focused);
    const restoreFocus = Boolean(focused && grid.contains(focused));
    grid.replaceChildren(...nodes);
    if (restoreFocus && focusedKey !== undefined) {
      const next = focused.isConnected && !focused.disabled ?
        focused : cards.get(Number(focusedKey))?.handle;
      next?.focus?.({preventScroll: true});
    }
    renderedRevision = view.revision;
    feedback.textContent = view.filename ?
      count + ' pages included · ' + (view.plan.length - count) + ' removed. ' +
      'Arranged pages are saved in the displayed output order.' : '';
  }

  function onChange(view) {
    if (view.revision !== renderedRevision) {
      clearOutputs();
      draw(view);
    }
    current.textContent = view.filename ?
      'Selected: ' + view.filename + ' · ' + view.pageCount + ' original pages' :
      'No PDF selected.';
    input.disabled = view.activity === 'exporting' || view.phase === 'cancelling';
    exportButton.disabled = view.busy || !view.filename;
    resetButton.disabled = view.busy || !view.filename;
    cancelButton.disabled = !view.busy || view.phase === 'cancelling';
    for (const [i, page] of view.plan.entries()) {
      const entry = cards.get(page.index);
      if (!entry) continue;
      entry.earlier.disabled = view.busy || i === 0;
      entry.later.disabled = view.busy || i === view.plan.length - 1;
      entry.rotate.disabled = view.busy;
      entry.toggle.disabled = view.busy;
      entry.handle.disabled = view.busy;
      entry.positionInput.disabled = view.busy;
      entry.jump.disabled = view.busy;
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
    limits.maxPages + ' pages per operation. Limits will be reviewed after device testing.');

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    if (file) void session.openFile(file);
  });
  onChange(session.snapshot());
  window.addEventListener('pagehide', () => {
    renderer.dispose();
    session.dispose();
    clearOutputs();
  }, {once: true});
}
