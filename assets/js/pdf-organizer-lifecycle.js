// PDF Organizer — Task 2 only: bounded, cancellable file/session lifecycle.
// This module has no dependencies on other tools or the shared workspace state.
import {initialPlan, changePlan, buildOrganizedPdf} from './pdf-organizer-integrity.js';

const MiB = 1024 * 1024;

export function organizerBudget(device = {}) {
  const memory = Number(device.deviceMemory);
  const mobile = device.mobile === true;
  // Conservative provisional limits. Physical-device measurements in Task 5
  // are required before representing these as certified device capacities.
  const lowMemory = Number.isFinite(memory) && memory > 0 && memory <= 2;
  const highMemory = Number.isFinite(memory) && memory >= 8;
  const maxMiB = lowMemory ? 12 : mobile ? (highMemory ? 40 : 24) :
    highMemory ? 80 : 48;
  const maxPages = lowMemory ? 150 : mobile ? (highMemory ? 450 : 300) :
    highMemory ? 1000 : 650;
  return Object.freeze({maxBytes: maxMiB * MiB, maxPages, deviceClass:
    lowMemory ? 'low-memory' : mobile ? 'mobile' : 'desktop'});
}

export function browserDeviceHints(navigatorLike = {}) {
  const agent = String(navigatorLike.userAgent || '');
  return {
    mobile: navigatorLike.userAgentData?.mobile === true ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(agent),
    deviceMemory: navigatorLike.deviceMemory
  };
}

export function validatePdfSelection(file, limits) {
  if (!file || typeof file.name !== 'string' || !Number.isSafeInteger(file.size)) {
    throw Error('Choose a PDF file from your device.');
  }
  if (!/\.pdf$/i.test(file.name)) throw Error('Unsupported file. Choose a PDF document.');
  if (file.size === 0) throw Error('This PDF file is empty. Choose a nonempty PDF.');
  if (file.size > limits.maxBytes) {
    throw Error('This PDF exceeds the supported ' +
      Math.floor(limits.maxBytes / MiB) + ' MB limit for this device. ' +
      'Try a smaller PDF or a device with more memory.');
  }
  if (typeof file.slice !== 'function' || typeof file.arrayBuffer !== 'function') {
    throw Error('This browser cannot read the selected file.');
  }
}

export function validatePdfSignature(buffer) {
  const bytes = new Uint8Array(buffer);
  const count = Math.min(bytes.length, 1024);
  let text = '';
  for (let i = 0; i < count; i++) text += String.fromCharCode(bytes[i]);
  if (!/%PDF-[12]\.[0-9]/.test(text)) {
    throw Error('This file does not have a valid PDF header. Check the file format.');
  }
}

function cancelled(signal) {
  if (signal.aborted) {
    const error = Error('Operation cancelled.');
    error.name = 'AbortError';
    throw error;
  }
}

export async function readPdfFile(file, signal, onProgress = () => {}) {
  cancelled(signal);
  const header = await file.slice(0, 1024).arrayBuffer();
  cancelled(signal);
  validatePdfSignature(header);
  onProgress(8, 'Reading PDF…');
  if (typeof FileReader !== 'function') {
    const bytes = await file.arrayBuffer();
    cancelled(signal);
    onProgress(40, 'PDF read.');
    return bytes;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => reader.abort();
    const detach = () => signal.removeEventListener('abort', abort);
    reader.onload = () => { detach(); onProgress(40, 'PDF read.'); resolve(reader.result); };
    reader.onerror = () => { detach(); reject(reader.error || Error('Could not read the selected PDF.')); };
    reader.onabort = () => { detach(); reject(Object.assign(Error('Operation cancelled.'), {name: 'AbortError'})); };
    reader.onprogress = event => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(8 + Math.round(32 * event.loaded / event.total), 'Reading PDF…');
      }
    };
    signal.addEventListener('abort', abort, {once: true});
    if (signal.aborted) {
      detach();
      reject(Object.assign(Error('Operation cancelled.'), {name: 'AbortError'}));
      return;
    }
    try { reader.readAsArrayBuffer(file); } catch (error) { detach(); reject(error); }
  });
}

export function organizerErrorMessage(error) {
  const message = String(error?.message || 'Unable to process this PDF.');
  if (message.startsWith('This file does not have a valid PDF header')) return message;
  if (/encrypted|password|EncryptedPDFError/i.test(message)) {
    return 'This PDF is password-protected or encrypted. Open an unlocked copy in a trusted PDF application, then try again.';
  }
  if (/failed to parse|invalid pdf|missing pdf|pdf header|xref|invalid object|invalid catalog|no pdf header|unexpected object/i.test(message)) {
    return 'This PDF appears to be damaged or unsupported. Open and resave the original with a trusted PDF application, then try again.';
  }
  if (/out of memory|allocation failed|quotaexceeded|insufficient memory/i.test(message)) {
    return 'This PDF needs more device memory than is available. Try a smaller document or a more capable device.';
  }
  return message;
}

const isCancelled = error => error?.name === 'AbortError';

export class OrganizerSession {
  constructor({loadPdfLibrary, onChange = () => {}, onResult = () => {},
    device = {}, readFile = readPdfFile, exporter = buildOrganizedPdf} = {}) {
    if (typeof loadPdfLibrary !== 'function') throw Error('PDF engine loader required.');
    this.loadPdfLibrary = loadPdfLibrary;
    this.onChange = onChange;
    this.onResult = onResult;
    this.readFile = readFile;
    this.exporter = exporter;
    this.limits = organizerBudget(device);
    this.record = null; // Holds only raw bytes + source page plan, not a parsed PDF.
    this.revision = 0;
    this.documentId = 0; // Tracks PDF replacements separately from page edits.
    this.requestId = 0;
    this.active = null;
    this.disposed = false;
    this.phase = 'empty';
    this.message = 'Open a PDF to begin.';
    this.error = false;
    this.percent = 0;
  }

  snapshot() {
    return {
      phase: this.phase, message: this.message, error: this.error,
      percent: this.percent, busy: Boolean(this.active),
      activity: this.active?.kind || null, revision: this.revision,
      documentId: this.documentId,
      filename: this.record?.filename || null,
      pageCount: this.record?.pageCount || 0,
      plan: this.record?.plan.map(page => ({...page})) || [],
      limits: this.limits
    };
  }
  emit(message, error = false, percent = this.percent) {
    if (this.disposed) return;
    this.message = message;
    this.error = error;
    this.percent = Math.max(0, Math.min(100, Math.round(percent)));
    this.onChange(this.snapshot());
  }
  assertCurrent(id, signal) {
    cancelled(signal);
    if (this.disposed || id !== this.requestId) {
      const error = Error('Operation cancelled.');
      error.name = 'AbortError';
      throw error;
    }
  }
  progress(id, signal, percent, message) {
    if (signal.aborted || id !== this.requestId || this.disposed) return;
    this.emit(message, false, percent);
  }
  async perform(kind, id, handler) {
    if (this.disposed || id !== this.requestId) return false;
    const controller = new AbortController();
    this.phase = kind;
    const work = (async () => {
      try {
        await handler(controller.signal);
        this.assertCurrent(id, controller.signal);
        return true;
      } catch (error) {
        if (isCancelled(error) || controller.signal.aborted || id !== this.requestId) {
          if (id === this.requestId) this.emit('Operation cancelled. Your previous PDF is unchanged.');
        } else {
          this.phase = 'error';
          this.emit(organizerErrorMessage(error), true, 0);
        }
        return false;
      }
    })();
    const tracking = work.finally(() => {
      if (this.active?.id === id) {
        this.active = null;
        if (this.phase === kind || this.phase === 'cancelling') {
          this.phase = this.record ? 'ready' : 'empty';
          if (this.message.startsWith('Cancel requested') ||
              this.message.startsWith('Cancelling operation') ||
              this.message.startsWith('Cancelling previous operation')) {
            this.message = this.record ?
              'Operation cancelled. Your previous PDF is unchanged.' :
              'Operation cancelled. Ready to open a PDF.';
          }
        }
        this.onChange(this.snapshot());
      }
    });
    this.active = {id, kind, controller, promise: tracking};
    this.onChange(this.snapshot());
    return tracking;
  }

  async openFile(file) {
    if (this.disposed) return false;
    const id = ++this.requestId; // Latest selection wins.
    const previous = this.active;
    if (previous) {
      previous.controller.abort();
      this.phase = 'cancelling';
      this.emit('Cancelling previous operation before opening the selected PDF…');
      await previous.promise;
    }
    if (this.disposed || id !== this.requestId) return false;
    return this.perform('loading', id, async signal => {
      this.progress(id, signal, 0, 'Checking selected PDF…');
      validatePdfSelection(file, this.limits);
      const bytes = await this.readFile(file, signal, (p, m) =>
        this.progress(id, signal, p, m));
      this.assertCurrent(id, signal);
      this.progress(id, signal, 45, 'Loading PDF engine…');
      const PDF = await this.loadPdfLibrary();
      this.assertCurrent(id, signal);
      this.progress(id, signal, 62, 'Checking PDF page structure…');
      let doc = await PDF.PDFDocument.load(bytes, {updateMetadata: false});
      this.assertCurrent(id, signal);
      const pageCount = doc.getPageCount();
      if (!pageCount) throw Error('This PDF has no pages.');
      if (pageCount > this.limits.maxPages) {
        throw Error('This document contains ' + pageCount +
          ' pages; the supported limit for this device is ' +
          this.limits.maxPages + '. Split the PDF into smaller documents.');
      }
      const plan = initialPlan(doc);
      doc = null; // Do not retain the parsed PDF for the whole session.
      this.assertCurrent(id, signal);
      const next = {bytes, filename: file.name, pageCount, plan};
      this.record = next; // Atomic commit: old document remains until success.
      this.documentId++;
      this.revision++;
      this.phase = 'ready';
      this.emit('PDF ready: ' + pageCount + ' pages.', false, 100);
    });
  }

  change(operation, index) {
    if (this.disposed || this.active || !this.record) return false;
    const updated = changePlan(this.record.plan, operation, index);
    if (updated === this.record.plan) return false;
    this.record = {...this.record, plan: updated};
    this.revision++;
    this.phase = 'ready';
    this.emit('Arrangement updated. Create PDF to save these changes.', false, 0);
    return true;
  }

  // Task 3 preview-only copy: PDF.js may transfer/detach its data buffer.
  // Never expose the authoritative ArrayBuffer for worker transfer.
  previewSource() {
    return !this.disposed && this.record ? this.record.bytes.slice(0) : null;
  }

  // Direct visual movement uses the same authoritative state and one revision.
  moveTo(from, to) {
    if (this.disposed || this.active || !this.record) return false;
    const plan = this.record.plan;
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) ||
        from < 0 || to < 0 || from >= plan.length || to >= plan.length) {
      return false;
    }
    if (from === to) return false;
    const ordered = plan.slice();
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    this.record = {...this.record, plan: ordered};
    this.revision++;
    this.phase = 'ready';
    this.emit('Page moved to position ' + (to + 1) + '.', false, 0);
    return true;
  }

  async exportPdf() {
    if (this.disposed || this.active || !this.record) {
      this.emit('Open a PDF and finish any current operation before exporting.', true);
      return false;
    }
    const id = ++this.requestId;
    return this.perform('exporting', id, async signal => {
      const record = this.record;
      const revision = this.revision;
      const plan = record.plan.map(page => ({...page}));
      this.progress(id, signal, 0, 'Preparing organized PDF…');
      const PDF = await this.loadPdfLibrary();
      this.assertCurrent(id, signal);
      const bytes = await this.exporter(record.bytes, plan, PDF, {
        signal, onProgress: (p, message) => this.progress(id, signal, p, message)
      });
      this.assertCurrent(id, signal);
      if (revision !== this.revision || record !== this.record) {
        throw Error('The document changed during export. Try again.');
      }
      this.onResult(new Blob([bytes], {type: 'application/pdf'}),
        record.filename, revision);
      this.phase = 'ready';
      this.emit('Organized PDF ready. Review the result before using it.', false, 100);
    });
  }

  cancel() {
    if (!this.active || this.disposed) return false;
    this.requestId++;
    this.active.controller.abort();
    this.phase = 'cancelling';
    this.emit('Cancel requested. The current PDF operation may need to finish its step…');
    return true;
  }

  reset() {
    if (this.disposed) return;
    this.requestId++;
    this.active?.controller.abort();
    this.record = null;
    this.documentId++;
    this.revision++;
    this.phase = this.active ? 'cancelling' : 'empty';
    this.emit(this.active ? 'Cancelling operation and clearing the PDF…' :
      'Ready to open a PDF.', false, 0);
  }

  dispose() {
    this.requestId++;
    this.active?.controller.abort();
    this.record = null;
    this.documentId++;
    this.disposed = true;
    this.onChange = () => {};
    this.onResult = () => {};
  }
}
