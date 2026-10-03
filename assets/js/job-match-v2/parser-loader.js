let pdfPromise = null;
let mammothPromise = null;

function localUrl(path) {
  return new URL(path, import.meta.url).href;
}

export async function loadLocalPdfEngine() {
  if (!pdfPromise) {
    pdfPromise = import(localUrl('../../vendor/pdf.mjs')).then((pdfjs) => {
      if (!pdfjs?.getDocument || !pdfjs?.GlobalWorkerOptions) {
        throw new Error('Local PDF parser is unavailable.');
      }
      pdfjs.GlobalWorkerOptions.workerSrc = localUrl('../../vendor/pdf.worker.mjs');
      return pdfjs;
    }).catch((error) => {
      pdfPromise = null;
      throw error;
    });
  }
  return pdfPromise;
}

export async function loadLocalMammothEngine(documentRef = globalThis.document) {
  if (globalThis.mammoth?.convertToHtml) return globalThis.mammoth;
  if (mammothPromise) return mammothPromise;
  if (!documentRef?.head?.appendChild) throw new Error('Local DOCX parser is unavailable in this environment.');

  mammothPromise = new Promise((resolve, reject) => {
    const script = documentRef.createElement('script');
    script.src = localUrl('../../vendor/mammoth.js');
    script.async = true;
    script.dataset.jobMatchV2Engine = 'mammoth';
    script.onload = () => {
      if (globalThis.mammoth?.convertToHtml) resolve(globalThis.mammoth);
      else reject(new Error('Local DOCX parser loaded without the expected API.'));
    };
    script.onerror = () => reject(new Error('Local DOCX parser could not be loaded.'));
    documentRef.head.appendChild(script);
  }).catch((error) => {
    mammothPromise = null;
    throw error;
  });

  return mammothPromise;
}

export const LOCAL_PARSER_ASSETS = Object.freeze({
  pdfModule: '../../vendor/pdf.mjs',
  pdfWorker: '../../vendor/pdf.worker.mjs',
  docxScript: '../../vendor/mammoth.js',
  remoteDependency: false
});
