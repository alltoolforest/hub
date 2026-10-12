// Task 1 only: organizer-specific PDF plan validation and fidelity-preserving export.
// Never mutate the source PDF instance or overwrite user-supplied bytes.
export function initialPlan(document) {
  return document.getPages().map((page, index) => ({
    index,
    rotation: ((page.getRotation().angle % 360) + 360) % 360,
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

// /Names commonly holds EmbeddedFiles and /AF associates those attachments
// with the document; neither necessarily points to a PDF page.
const unsupportedRemovalEntries = [
  'Dests', 'StructTreeRoot', 'PageLabels', 'Threads', 'AA'
];

function assertSafeNameTrees(document, PDF) {
  const name = PDF.PDFName.of;
  const entries = document.context.lookup(document.catalog.get(name('Names')));
  if (!entries) return;
  if (typeof entries.keys !== 'function') {
    throw Error('This PDF has an unsupported named-object tree.');
  }
  const unsafe = [...entries.keys()].map(k => k.toString()).filter(k =>
    k !== '/EmbeddedFiles');
  if (unsafe.length) {
    throw Error('Removing pages with named destinations or document scripts (' +
      unsafe.join(', ') + ') is not supported safely.');
  }
}

function analyzeFormWidgets(document, kept, PDF) {
  const name = PDF.PDFName.of;
  if (!document.catalog.AcroForm()) return [];
  const removed = new Set(document.getPages()
    .filter((_, i) => !kept.some(p => p.index === i))
    .map(p => p.ref.toString()));
  if (!removed.size) return [];
  const form = document.getForm();
  const discard = [];
  for (const field of form.getFields()) {
    const widgets = field.acroField.getWidgets();
    if (!widgets.length) continue; // Logical field without page widgets.
    let deleted = 0;
    for (const widget of widgets) {
      const page = widget.dict.get(name('P'));
      if (!page || !('toString' in page)) {
        throw Error('This PDF form has a widget without a page reference; page removal cannot safely update it.');
      }
      if (removed.has(page.toString())) deleted++;
    }
    if (deleted && deleted !== widgets.length) {
      throw Error('A PDF form field spans both kept and removed pages. Remove its widgets using a full PDF form editor.');
    }
    if (deleted === widgets.length) discard.push(field);
  }
  return discard;
}

// pdf-lib's page-tree removal unlinks a page but keeps its indirect objects in
// PDFContext. Remove unreachable objects so deleted content streams do not
// remain hidden in the exported PDF. Live objects are traced from trailer roots.
function pruneUnreachablePdfObjects(document, PDF) {
  const context = document.context;
  const objects = context.enumerateIndirectObjects();
  const byRef = new Map(objects.map(([ref, obj]) => [ref.toString(), obj]));
  const seenRefs = new Set();
  const seenObjects = new Set();
  const walk = obj => {
    if (!obj || typeof obj !== 'object') return;
    if (obj instanceof PDF.PDFRef) {
      const id = obj.toString();
      if (seenRefs.has(id)) return;
      seenRefs.add(id);
      walk(byRef.get(id));
      return;
    }
    if (seenObjects.has(obj)) return;
    seenObjects.add(obj);
    if (obj instanceof PDF.PDFDict) {
      for (const key of obj.keys()) walk(obj.get(key));
    } else if (obj instanceof PDF.PDFArray) {
      for (const entry of obj.asArray()) walk(entry);
    } else if (obj instanceof PDF.PDFStream) {
      walk(obj.dict);
    }
  };
  for (const value of Object.values(context.trailerInfo)) walk(value);
  for (const [ref] of objects) {
    if (!seenRefs.has(ref.toString())) context.delete(ref);
  }
}

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

function containsInternalDestinations(document, kept, PDF) {
  const name = PDF.PDFName.of;
  const pages = document.getPages();
  const keptIndices = new Set(kept.map(item => item.index));
  const retainedRefs = new Set(kept.map(item => pages[item.index].ref.toString()));
  const invalidDestination = target => {
    const destination = document.context.lookup(target);
    // Explicit page destinations contain a PDF page ref as their first item.
    if (destination instanceof PDF.PDFArray && destination.size() > 0) {
      return !retainedRefs.has(destination.get(0).toString());
    }
    // Unknown named/remote destinations need a full destination resolver.
    return true;
  };
  for (const [index, page] of pages.entries()) {
    if (!keptIndices.has(index)) continue; // The entire page and its links go away.
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const annot = document.context.lookup(annots.get(i));
      if (!annot || typeof annot.get !== 'function') continue;
      if (annot.get(name('Dest')) && invalidDestination(annot.get(name('Dest')))) {
        return true;
      }
      const action = document.context.lookup(annot.get(name('A')));
      if (!action || typeof action.get !== 'function') continue;
      const type = action.get(name('S'))?.toString();
      if (type === '/Named') return true;
      if (type === '/GoTo' && invalidDestination(action.get(name('D')))) return true;
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
    assertSafeNameTrees(document, PDF);
    const features = unsupportedRemovalEntries.filter(item => Boolean(document.catalog.get(name(item))));
    // Outlines and document-level opening actions can reference pages by
    // destination arrays or names. Preserve these until targeted repair exists.
    if (document.catalog.get(name('Outlines'))) features.push('Outlines');
    if (document.catalog.get(name('OpenAction'))) features.push('OpenAction');
    if (containsInternalDestinations(document, kept, PDF)) features.push('internal page links');
    if (features.length) {
      throw Error('Cannot safely remove pages because this document has page navigation or tagging (' +
        [...new Set(features)].join(', ') + '). Use an editor that can repair these references.');
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

export async function buildOrganizedPdf(sourceBytes, plan, PDF, options = {}) {
  // Cooperative cancellation is optional so existing Task 1 callers remain unchanged.
  const signal = options.signal;
  const progress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const check = () => {
    if (signal?.aborted) {
      const error = Error('Operation cancelled.');
      error.name = 'AbortError';
      throw error;
    }
  };
  const checkpoint = async (index, total, start, span, message) => {
    if (index % 16 !== 0 && index !== total - 1) return;
    progress(start + Math.round(span * (index + 1) / Math.max(total, 1)), message);
    // Yield to the browser event loop so the Cancel control can respond.
    if (typeof setTimeout === 'function') await new Promise(resolve => setTimeout(resolve, 0));
    check();
  };
  check();
  progress(5, 'Checking PDF integrity…');
  // Load a fresh copy for each export. All changes happen within the same PDF,
  // retaining original PDF page refs and document-level objects where supported.
  const doc = await PDF.PDFDocument.load(sourceBytes, {updateMetadata: false});
  check();
  const kept = assertSupportedTransformation(doc, plan, PDF);
  progress(16, 'Preparing original PDF pages…');
  const sourcePages = doc.getPages().slice();
  const sourceRefs = sourcePages.map(page => page.ref.toString());
  const sourceDimensions = sourcePages.map(page => [page.getWidth(), page.getHeight()]);
  const removed = kept.length < sourcePages.length;
  const obsoleteFormFields = removed ? analyzeFormWidgets(doc, kept, PDF) : [];
  // Capture inherited attributes BEFORE detaching pages from their page trees.
  for (const page of sourcePages) pinInheritedPageAttributes(page, PDF);
  // Remove form fields whose *all* widgets are on deleted pages. Fields on
  // retained pages remain untouched, including their values and appearances.
  if (obsoleteFormFields.length) {
    const form = doc.getForm();
    for (const field of obsoleteFormFields) form.removeField(field);
  }
  for (let i = sourcePages.length - 1; i >= 0; i--) {
    doc.removePage(i);
    await checkpoint(sourcePages.length - i - 1, sourcePages.length, 20, 23,
      'Preparing page order…');
  }
  for (let i = 0; i < kept.length; i++) {
    const item = kept[i];
    const page = sourcePages[item.index];
    doc.insertPage(doc.getPageCount(), page);
    page.setRotation(PDF.degrees(item.rotation));
    await checkpoint(i, kept.length, 44, 26, 'Organizing PDF pages…');
  }
  check();
  if (removed) pruneUnreachablePdfObjects(doc, PDF);
  progress(73, 'Saving organized PDF…');
  const bytes = await doc.save({updateFieldAppearances: false});
  check();
  progress(87, 'Verifying organized PDF…');
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
  check();
  progress(100, 'Organized PDF verified.');
  return bytes;
}
