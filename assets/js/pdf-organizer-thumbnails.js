// Task 3 only — lazy PDF.js page previews for the PDF Organizer.
// Original bytes/page objects are never rasterized for export.
export class OrganizerThumbnails {
  constructor({openDocument, onError = () => {}, maxConcurrent = 2, maxCached = 18,
    observerFactory = null} = {}) {
    if (typeof openDocument !== 'function') throw Error('PDF preview loader required.');
    this.openDocument = openDocument;
    this.onError = onError;
    this.maxConcurrent = Math.max(1, Math.min(3, maxConcurrent));
    this.maxCached = Math.max(2, maxCached);
    this.observerFactory = observerFactory;
    this.generation = 0;
    this.documentId = null;
    this.document = null;
    this.slots = new Map();
    this.queue = [];
    this.active = 0;
    this.clock = 0;
    this.disposed = false;
    this.observer = null;
    this.renderTasks = new Set();
  }

  reset() {
    this.generation++;
    this.observer?.disconnect();
    this.observer = null;
    for (const task of this.renderTasks) {
      try { task.cancel(); } catch {}
    }
    this.renderTasks.clear();
    for (const slot of this.slots.values()) {
      slot.holder.replaceChildren();
    }
    this.slots.clear();
    this.queue.length = 0;
    this.active = 0; // The old generation's workers are discarded on completion.
    const previous = this.document;
    this.document = null;
    this.documentId = null;
    if (previous) Promise.resolve(previous.destroy()).catch(() => {});
  }

  async open(bytes, documentId) {
    if (this.disposed) return;
    if (documentId === this.documentId) return;
    this.reset();
    this.documentId = documentId;
    const generation = this.generation;
    try {
      const document = await this.openDocument(bytes);
      if (this.disposed || generation !== this.generation) {
        await document.destroy();
        return;
      }
      this.document = document;
      for (const slot of this.slots.values()) if (slot.visible) this.enqueue(slot);
    } catch (error) {
      if (generation === this.generation && !this.disposed) {
        this.onError('Previews unavailable. Page controls and PDF export still work.');
        for (const slot of this.slots.values()) {
          slot.holder.textContent = 'Preview unavailable';
        }
      }
    }
  }

  createObserver() {
    if (this.observer || this.disposed) return;
    const make = this.observerFactory || (typeof IntersectionObserver !== 'undefined' ?
      (cb, options) => new IntersectionObserver(cb, options) : null);
    if (!make) return;
    this.observer = make(entries => {
      for (const entry of entries) {
        const slot = [...this.slots.values()].find(s => s.holder === entry.target);
        if (!slot) continue;
        slot.visible = Boolean(entry.isIntersecting);
        if (slot.visible) this.enqueue(slot);
      }
      this.evict();
    }, {rootMargin: '240px 0px', threshold: 0});
  }

  observe(originalIndex, rotation, holder) {
    if (this.disposed) return;
    this.createObserver();
    const slot = {
      originalIndex, rotation, holder, visible: false,
      token: 0, state: 'pending', lastUsed: 0, task: null
    };
    holder.textContent = 'Preview loading…';
    this.slots.set(originalIndex, slot);
    if (this.observer) this.observer.observe(holder);
    else {
      // Modern supported browsers implement IntersectionObserver. If absent,
      // allow an explicit accessible on-demand preview for every page.
      const load = document.createElement('button');
      load.type = 'button';
      load.textContent = 'Load preview';
      load.setAttribute('aria-label', 'Load preview for page ' + (originalIndex + 1));
      load.addEventListener('click', () => {
        slot.visible = true;
        this.enqueue(slot);
      });
      holder.replaceChildren(load);
    }
  }

  update(originalIndex, rotation) {
    const slot = this.slots.get(originalIndex);
    if (!slot || slot.rotation === rotation) return;
    slot.rotation = rotation;
    slot.token++;
    if (slot.task) {
      try { slot.task.cancel(); } catch {}
    }
    slot.task = null;
    slot.state = 'pending';
    slot.holder.textContent = 'Updating preview…';
    if (slot.visible) this.enqueue(slot);
  }

  enqueue(slot) {
    if (this.disposed || !this.document || !slot.visible || slot.state === 'ready' ||
        slot.state === 'queued' || slot.state === 'rendering') return;
    slot.state = 'queued';
    this.queue.push({slot, generation: this.generation, token: slot.token});
    this.pump();
  }

  pump() {
    if (this.disposed || !this.document) return;
    while (this.active < this.maxConcurrent && this.queue.length) {
      const job = this.queue.shift();
      if (job.generation !== this.generation || job.token !== job.slot.token ||
          !job.slot.visible) {
        if (job.slot.state === 'queued') job.slot.state = 'pending';
        continue;
      }
      job.slot.state = 'rendering';
      this.active++;
      this.render(job).catch(() => {}).finally(() => {
        if (job.generation !== this.generation) return;
        this.active--;
        this.pump();
      });
    }
  }

  async render({slot, generation, token}) {
    const valid = () => !this.disposed && this.generation === generation &&
      slot.token === token && this.document !== null;
    let page, canvas;
    try {
      if (!valid()) return;
      page = await this.document.getPage(slot.originalIndex + 1);
      if (!valid()) return;
      const rotation = slot.rotation;
      const basis = page.getViewport({scale: 1, rotation});
      const available = Math.max(100, Math.min(260,
        slot.holder.getBoundingClientRect?.().width || 180));
      const density = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
      const scale = Math.min(available * density / Math.max(basis.width, 1),
        Math.sqrt(400000 / Math.max(basis.width * basis.height, 1)));
      const viewport = page.getViewport({scale, rotation});
      canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      canvas.style.width = Math.round(canvas.width / density) + 'px';
      canvas.style.height = Math.round(canvas.height / density) + 'px';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', 'Preview of original page ' + (slot.originalIndex + 1));
      const context = canvas.getContext('2d', {alpha: false});
      if (!context) throw Error('Canvas unavailable');
      const task = page.render({canvasContext: context, viewport});
      slot.task = task;
      this.renderTasks.add(task);
      try { await task.promise; } finally {
        this.renderTasks.delete(task);
        if (slot.task === task) slot.task = null;
      }
      if (!valid()) return;
      slot.holder.replaceChildren(canvas);
      slot.state = 'ready';
      slot.lastUsed = ++this.clock;
      this.evict();
      canvas = null; // Canvas is now owned by the holder.
    } catch (error) {
      if (valid()) {
        slot.state = 'error';
        slot.holder.textContent = 'Preview unavailable';
        this.onError('Some page previews could not be displayed. PDF export is unaffected.');
      }
    } finally {
      if (canvas) { canvas.width = 0; canvas.height = 0; }
      try { page?.cleanup(); } catch {}
    }
  }

  evict() {
    const rendered = [...this.slots.values()].filter(s => s.state === 'ready');
    if (rendered.length <= this.maxCached) return;
    rendered.sort((a, b) => a.lastUsed - b.lastUsed);
    for (const slot of rendered.slice(0, rendered.length - this.maxCached)) {
      const canvas = slot.holder.querySelector('canvas');
      if (canvas) { canvas.width = 0; canvas.height = 0; }
      slot.holder.textContent = 'Preview available when visible';
      slot.state = 'pending';
    }
  }

  close() { this.reset(); }
  dispose() { this.reset(); this.disposed = true; }
}
