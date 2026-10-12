// Task 1 only: organizer-specific PDF plan validation and fidelity-preserving export.
// Never mutate the source PDF instance or overwrite user-supplied bytes.
export function initialPlan(document) {
  return document.getPages().map((page, index) => ({
    index,
    rotation: page.getRotation().angle,
    keep: true
  }));
}

export function validatePlan(plan, originalCount) {
  if (!Array.isArray(plan) || !Number.isSafeInteger(originalCount) ||
      originalCount < 1 || plan.length !== originalCount) {
    throw Error('Page arrangement is incomplete. Open the PDF again.');
  }
  const seen = new Set();
  const kept = [];
  for (const page of plan) {
    if (!page || !Number.isSafeInteger(page.index) || page.index < 0 ||
        page.index >= originalCount || seen.has(page.index) ||
        typeof page.keep !== 'boolean' ||
        !Number.isInteger(page.rotation) ||
        page.rotation < 0 || page.rotation >= 360 || page.rotation % 90 !== 0) {
      throw Error('Invalid page arrangement. Open the PDF again.');
    }
    seen.add(page.index);
    if (page.keep) kept.push({index: page.index, rotation: page.rotation});
  }
  if (kept.length === 0) throw Error('Keep at least one page.');
  return kept;
}

export function changePlan(plan, operation, index) {
  if (!Array.isArray(plan) || !Number.isSafeInteger(index) ||
      index < 0 || index >= plan.length) throw Error('Invalid page selection.');
  if (!['up', 'down', 'rotate', 'toggle'].includes(operation)) {
    throw Error('Unknown page operation.');
  }
  const next = plan.map(p => ({...p}));
  if (operation === 'up') {
    if (index === 0) return plan;
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
  } else if (operation === 'down') {
    if (index === next.length - 1) return plan;
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
  } else if (operation === 'rotate') {
    next[index].rotation = (next[index].rotation + 90) % 360;
  } else {
    next[index].keep = !next[index].keep;
  }
  return next;
}

const riskyRemovalEntries = [
  'AcroForm', 'Outlines', 'Names', 'Dests', 'StructTreeRoot',
  'PageLabels', 'OpenAction', 'Threads', 'AF', 'AA'
];

function containsSignature(document, PDF) {
  const name = PDF.PDFName.of;
  if (document.catalog.get(name('Perms'))) return true;
  const form = document.catalog.AcroForm();
  if (!form) return false;
  const fields = document.context.lookup(form.get(name('Fields')));
  if (!fields || typeof fields.size !== 'function') return false;
  const stack = [];
  for (let i = 0; i < fields.size(); i++) stack.push(fields.get(i));
  const visited = new Set();
  while (stack.length) {
    const next = stack.pop();
    const field = document.context.lookup(next);
    if (!field || typeof field.get !== 'function') continue;
    const key = next && typeof next.toString === 'function' ? next.toString() : String(stack.length);
    if (visited.has(key)) continue;
    visited.add(key);
    const type = field.get(name('FT'));
    if (type && type.toString() === '/Sig') return true;
    const value = document.context.lookup(field.get(name('V')));
    if (value && typeof value.get === 'function' &&
        (value.get(name('ByteRange')) || value.get(name('Contents')) &&
         value.get(name('Filter')))) return true;
    const kids = document.context.lookup(field.get(name('Kids')));
    if (kids && typeof kids.size === 'function') {
      for (let i = 0; i < kids.size(); i++) stack.push(kids.get(i));
    }
  }
  return false;
}

function containsInternalDestinations(document, PDF) {
  const name = PDF.PDFName.of;
  for (const page of document.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const annot = document.context.lookup(annots.get(i));
      if (!annot || typeof annot.get !== 'function') continue;
      if (annot.get(name('Dest'))) return true;
      const action = document.context.lookup(annot.get(name('A')));
      if (action && typeof action.get === 'function') {
        const type = action.get(name('S'));
        if (type && (type.toString() === '/GoTo' || type.toString() === '/Named')) {
          return true;
        }
      }
    }
  }
  return false;
}

export function assertSupportedTransformation(document, plan, PDF) {
  const kept = validatePlan(plan, document.getPageCount());
  if (document.isEncrypted) throw Error('Encrypted PDF documents cannot be reorganized safely.');
  if (containsSignature(document, PDF)) {
    throw Error('This PDF contains a digital signature. Saving changes would invalidate the signature. Use an unsigned copy.');
  }
  const name = PDF.PDFName.of;
  const form = document.catalog.AcroForm();
  if (form && form.get(name('XFA'))) {
    throw Error('XFA forms are not supported for safe page reorganization.');
  }
  const removed = kept.length !== plan.length;
  if (removed) {
    const features = riskyRemovalEntries.filter(item => Boolean(document.catalog.get(name(item))));
    if (containsInternalDestinations(document, PDF)) features.push('internal page links');
    if (features.length) {
      throw Error('Removing pages could break existing document navigation or form data (' +
        [...new Set(features)].join(', ') +
        '). Keep all pages or use a PDF editor that supports these structures.');
    }
  }
  const orderedOriginal = [...kept].sort((a, b) => a.index - b.index);
  const changedOrder = kept.some((p, i) => p.index !== orderedOriginal[i].index);
  if (changedOrder && document.catalog.get(name('PageLabels'))) {
    throw Error('This PDF uses custom page labels that may become incorrect after reordering. Use a PDF editor that can update page labels.');
  }
  return kept;
}

function pinInheritedPageAttributes(page, PDF) {
  // When pages move across nested page trees, inherited attributes would otherwise
  // be silently lost (including fonts/resources, sizes and original rotation).
  for (const keyText of ['Resources', 'MediaBox', 'CropBox', 'Rotate']) {
    const key = PDF.PDFName.of(keyText);
    if (page.node.get(key) === undefined) {
      const inherited = page.node.getInheritableAttribute(key);
      if (inherited !== undefined) page.node.set(key, inherited);
    }
  }
}

export async function buildOrganizedPdf(sourceBytes, plan, PDF) {
  // Load a fresh copy for each export. All changes happen within the same PDF,
  // retaining original PDF page refs and document-level objects where supported.
  const doc = await PDF.PDFDocument.load(sourceBytes, {updateMetadata: false});
  const kept = assertSupportedTransformation(doc, plan, PDF);
  const sourcePages = doc.getPages().slice();
  const sourceRefs = sourcePages.map(page => page.ref.toString());
  const sourceDimensions = sourcePages.map(page => [page.getWidth(), page.getHeight()]);
  // Capture inherited attributes BEFORE detaching pages from their page trees.
  for (const page of sourcePages) pinInheritedPageAttributes(page, PDF);
  for (let i = sourcePages.length - 1; i >= 0; i--) doc.removePage(i);
  for (const item of kept) {
    const page = sourcePages[item.index];
    doc.insertPage(doc.getPageCount(), page);
    page.setRotation(PDF.degrees(item.rotation));
  }
  const bytes = await doc.save({updateFieldAppearances: false});
  // Fail closed if the PDF writer produces a different order, shape or rotation.
  const output = await PDF.PDFDocument.load(bytes, {updateMetadata: false});
  const outputPages = output.getPages();
  if (outputPages.length !== kept.length) throw Error('Export validation failed: incorrect page count.');
  for (let i = 0; i < kept.length; i++) {
    const item = kept[i], page = outputPages[i];
    const [width, height] = sourceDimensions[item.index];
    if (page.ref.toString() !== sourceRefs[item.index] ||
        page.getRotation().angle !== item.rotation ||
        Math.abs(page.getWidth() - width) > 0.01 ||
        Math.abs(page.getHeight() - height) > 0.01) {
      throw Error('Export validation failed: page order, dimensions or rotation changed unexpectedly.');
    }
  }
  // Document-level metadata must not be silently discarded.
  for (const method of ['getTitle', 'getAuthor', 'getSubject', 'getCreator', 'getKeywords']) {
    if (doc[method]() !== output[method]()) {
      throw Error('Export validation failed: document metadata was not preserved.');
    }
  }
  return bytes;
}
