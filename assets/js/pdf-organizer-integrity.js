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
  'Dests', 'PageLabels', 'Threads', 'AA'
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
  // /P is optional for widget annotations. Identify owner pages from their
  // /Annots membership when absent, without guessing if membership is missing
  // or ambiguous. Key by the same PDFDict instance pdf-lib uses for widgets.
  const owners = new Map();
  for (const page of document.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const dict = document.context.lookup(annots.get(i));
      if (!(dict instanceof PDF.PDFDict)) continue;
      const pages = owners.get(dict) || new Set();
      pages.add(page.ref.toString());
      owners.set(dict, pages);
    }
  }
  const form = document.getForm();
  const discard = [];
  for (const field of form.getFields()) {
    const widgets = field.acroField.getWidgets();
    if (!widgets.length) continue; // Logical field without page widgets.
    let deleted = 0;
    for (const widget of widgets) {
      const referenced = widget.dict.get(name('P'));
      const membership = owners.get(widget.dict);
      // A missing direct /P is normal in PDFs. Resolve from /Annots instead.
      // An explicit /P must not conflict with a known page owner.
      if (membership && membership.size !== 1) {
        throw Error('This PDF form widget belongs to multiple pages; page removal cannot safely update it.');
      }
      const pageRef = referenced?.toString() || (membership?.size === 1 ?
        [...membership][0] : null);
      if (!pageRef || (referenced && membership && !membership.has(pageRef))) {
        throw Error('This PDF form has a widget with an unresolved page reference; page removal cannot safely update it.');
      }
      if (removed.has(pageRef)) deleted++;
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

// Tagged-PDF removal. Only the narrow, verifiable case of page-independent
// structure subtrees and flat number trees is repaired in preserve mode.
// Mixed-page structure, ID trees, ambiguous MCIDs and nested number trees
// require an EXPLICIT untagged fallback; never guess or silently strip tags.
function taggedRemovalStrategy(document, kept, PDF) {
  const N = PDF.PDFName.of, C = document.context;
  const root = C.lookup(document.catalog.get(N('StructTreeRoot')));
  if (!root) return {mode:'none'};
  if (!(root instanceof PDF.PDFDict)) return {mode:'unsupported'};
  const pages = document.getPages();
  const removedRefs = new Set(pages.filter((_,i)=>!kept.some(p=>p.index===i))
    .map(page=>String(page.ref)));
  const keptRefs = new Set(kept.map(p=>String(pages[p.index].ref)));
  if (root.get(N('IDTree')) || root.get(N('Namespaces')) ||
      root.get(N('PronunciationLexicon'))) return {mode:'unsupported'};
  const parentTree = C.lookup(root.get(N('ParentTree')));
  if (parentTree && (!(parentTree instanceof PDF.PDFDict) ||
      parentTree.get(N('Kids')) || parentTree.get(N('Limits')))) return {mode:'unsupported'};
  const pairs = parentTree ? C.lookup(parentTree.get(N('Nums'))) : null;
  if (parentTree && (!(pairs instanceof PDF.PDFArray) || pairs.size()%2)) {
    return {mode:'unsupported'};
  }
  const discardedKeys = new Set(), retainedKeys = new Set();
  for (const [i,page] of pages.entries()) {
    const destination = kept.some(p=>p.index===i) ? retainedKeys : discardedKeys;
    const n = page.node.get(N('StructParents'));
    if (n !== undefined) {
      if (!(n instanceof PDF.PDFNumber)) return {mode:'unsupported'};
      destination.add(n.asNumber());
    }
    const annots = page.node.Annots();
    if (!annots) continue;
    for(let j=0;j<annots.size();j++) {
      const annot = C.lookup(annots.get(j));
      const index = annot?.get?.(N('StructParent'));
      if(index !== undefined) {
        if (!(index instanceof PDF.PDFNumber)) return {mode:'unsupported'};
        destination.add(index.asNumber());
      }
    }
  }
  for (const key of discardedKeys) if(retainedKeys.has(key)) return {mode:'unsupported'};
  const allPages = new Set([...keptRefs,...removedRefs]);
  const deref = value => value instanceof PDF.PDFRef ? C.lookup(value) : value;
  const visiting = new Set(), retainedStructure = new Set();
  // Returns page references used by marked content for one /K subtree.
  // Empty subtrees are allowed only if they do not claim removed page content.
  const footprint = (item,inheritedPg) => {
    const obj=deref(item);
    if(obj === undefined || obj === null) throw Error('Unknown structure entry');
    if(typeof obj !== 'object') throw Error('Malformed structure item');
    if(visiting.has(obj)) throw Error('Cyclic tagged structure');
    if(obj instanceof PDF.PDFNumber) {
      if(!inheritedPg || !allPages.has(inheritedPg)) throw Error('Unresolved marked content page');
      return new Set([inheritedPg]);
    }
    visiting.add(obj);
    let pagesUsed = new Set();
    const append = set => {for (const id of set) pagesUsed.add(id);};
    if(obj instanceof PDF.PDFArray) {
      for (const item of obj.asArray()) append(footprint(item,inheritedPg));
    } else if(obj instanceof PDF.PDFDict) {
      const pg = obj.get(N('Pg'));
      const pageRef = pg ? String(pg) : inheritedPg;
      if(pg && !allPages.has(pageRef)) throw Error('Unknown tagged page reference');
      const type=obj.get(N('Type'))?.toString();
      if(type==='/MCR' || type==='/OBJR') {
        if(!pageRef) throw Error('Unknown marked content page');
        if(type==='/MCR' && !obj.get(N('MCID'))) throw Error('Missing MCID');
        if(type==='/OBJR' && !obj.get(N('Obj'))) throw Error('Missing tagged object');
        pagesUsed.add(pageRef);
      } else if(obj.get(N('S'))) {
        const kids=obj.get(N('K'));
        if(kids!==undefined) append(footprint(kids,pageRef));
        // A structure node without /K carries no marked content.
        else if(pageRef) pagesUsed.add(pageRef);
      } else {
        throw Error('Unexpected structure dictionary');
      }
    } else throw Error('Unsupported structure item');
    visiting.delete(obj);
    return pagesUsed;
  };
  const children = root.get(N('K'));
  const roots = children instanceof PDF.PDFArray ? children.asArray() :
    children===undefined ? [] : [children];
  const retained = [];
  try {
    for (const item of roots) {
      const used=footprint(item,null);
      const keep=[...used].some(id=>keptRefs.has(id));
      const drop=[...used].some(id=>removedRefs.has(id));
      if(keep && drop) return {mode:'unsupported'}; // Shared subtree.
      if(keep || !drop) retained.push(item);
    }
    // If retained pages are tagged, the flat parent tree must still map them.
    if(pairs) {
      for(let i=0;i<pairs.size();i+=2) {
        const k=deref(pairs.get(i));
        if(!(k instanceof PDF.PDFNumber)) return {mode:'unsupported'};
        const num=k.asNumber();
        if(!Number.isSafeInteger(num)||num<0) return {mode:'unsupported'};
      }
      for(const key of retainedKeys) {
        let found=false;
        for(let i=0;i<pairs.size();i+=2) {
          if(deref(pairs.get(i)).asNumber()===key) found=true;
        }
        if(!found) return {mode:'unsupported'};
      }
    } else if(retainedKeys.size || discardedKeys.size) return {mode:'unsupported'};
    // Reject orphan references in retained parent-tree entries conservatively:
    // the K subtree must include each referenced structure element.
    const reachable=new Set();
    const collect=(item)=>{
      const obj=deref(item);
      if(!obj || typeof obj!=='object' || reachable.has(obj)) return;
      reachable.add(obj);
      if(obj instanceof PDF.PDFArray) obj.asArray().forEach(collect);
      else if(obj instanceof PDF.PDFDict && obj.get(N('S')) && obj.get(N('K'))!==undefined)
        collect(obj.get(N('K')));
    };
    retained.forEach(collect);
    if(pairs) for(let i=0;i<pairs.size();i+=2) {
      const key=deref(pairs.get(i)).asNumber();
      if(discardedKeys.has(key)) continue;
      if(!retainedKeys.has(key)) return {mode:'unsupported'};
      const value=deref(pairs.get(i+1));
      const refs=value instanceof PDF.PDFArray ? value.asArray() : [pairs.get(i+1)];
      for(const ref of refs) {
        const resolved=deref(ref);
        if(resolved!==PDF.PDFNull && !reachable.has(resolved)) return {mode:'unsupported'};
      }
    }
  } catch {return {mode:'unsupported'};}
  return {mode:'preserve',root,roots,retained,parentTree,pairs,discardedKeys};
}

function applyTaggedRemoval(document, strategy, PDF) {
  const N=PDF.PDFName.of, C=document.context;
  if(strategy.mode==='none') return false;
  if(strategy.mode==='untag') {
    document.catalog.delete(N('StructTreeRoot'));
    document.catalog.delete(N('MarkInfo'));
    for(const page of document.getPages()) {
      page.node.delete(N('StructParents'));
      // Structure navigation order is no longer applicable to this PDF.
      if(page.node.get(N('Tabs'))?.toString()==='/S') page.node.delete(N('Tabs'));
      const annots=page.node.Annots();
      if(!annots) continue;
      for(let i=0;i<annots.size();i++) {
        C.lookup(annots.get(i))?.delete?.(N('StructParent'));
      }
    }
    return true;
  }
  // Retain the original tag tree and all kept-page references; only remove
  // complete subtrees that reference exclusively removed pages.
  if(strategy.mode!=='preserve') throw Error('Tagged structure is unsupported.');
  if(strategy.retained.length !== strategy.roots.length) {
    strategy.root.set(N('K'),C.obj(strategy.retained));
  }
  if(strategy.pairs && strategy.discardedKeys.size) {
    const next=[];
    for(let i=0;i<strategy.pairs.size();i+=2) {
      const key=C.lookup(strategy.pairs.get(i));
      if(!strategy.discardedKeys.has(key.asNumber())) {
        next.push(strategy.pairs.get(i),strategy.pairs.get(i+1));
      }
    }
    strategy.parentTree.set(N('Nums'),C.obj(next));
  }
  return false;
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
  const removedSome=kept.length < doc.getPageCount();
  let droppedAccessibilityTags=false;
  if(removedSome && doc.catalog.get(PDF.PDFName.of('StructTreeRoot'))) {
    const strategy=taggedRemovalStrategy(doc,kept,PDF);
    const requestedFallback=options.allowUntagged===true;
    if(strategy.mode==='unsupported' && !requestedFallback) {
      throw Error('This PDF has accessibility tags that cannot be safely repaired after page removal. To continue, explicitly enable "Allow removing accessibility tags" and create the PDF again.');
    }
    droppedAccessibilityTags=applyTaggedRemoval(doc,
      strategy.mode==='unsupported' ? {mode:'untag'} : strategy,PDF);
  }
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
  if(droppedAccessibilityTags) {
    if(output.catalog.get(PDF.PDFName.of('StructTreeRoot')) ||
        output.catalog.get(PDF.PDFName.of('MarkInfo')) ||
        output.getPages().some(page=>page.node.get(PDF.PDFName.of('StructParents')))) {
      throw Error('Accessibility tag removal validation failed.');
    }
    options.onTagFallbackApplied?.();
  }
  progress(100, 'Organized PDF verified.');
  return bytes;
}
