let pdfPromise = null;
let mammothPromise = null;

function localUrl(path) {
  return new URL(path, import.meta.url).href;
}

export async function loadPdfEngine() {
  if (!pdfPromise) {
    pdfPromise = import(localUrl("../../vendor/pdf.mjs")).then((pdfjs) => {
      if (!pdfjs?.getDocument || !pdfjs?.GlobalWorkerOptions) throw new Error("PDF parser unavailable.");
      pdfjs.GlobalWorkerOptions.workerSrc = localUrl("../../vendor/pdf.worker.mjs");
      return pdfjs;
    }).catch((error) => {
      pdfPromise = null;
      throw error;
    });
  }
  return pdfPromise;
}

export async function loadDocxEngine(documentRef = globalThis.document) {
  if (globalThis.mammoth?.convertToHtml) return globalThis.mammoth;
  if (mammothPromise) return mammothPromise;
  if (!documentRef?.head?.appendChild) throw new Error("DOCX parser unavailable.");

  mammothPromise = new Promise((resolve, reject) => {
    const script = documentRef.createElement("script");
    script.src = localUrl("../../vendor/mammoth.js");
    script.async = true;
    script.dataset.coverLetterV2Engine = "mammoth";
    script.onload = () => globalThis.mammoth?.convertToHtml
      ? resolve(globalThis.mammoth)
      : reject(new Error("DOCX parser loaded without expected API."));
    script.onerror = () => reject(new Error("DOCX parser could not be loaded."));
    documentRef.head.appendChild(script);
  }).catch((error) => {
    mammothPromise = null;
    throw error;
  });

  return mammothPromise;
}

export const LOCAL_RESUME_PARSER_ASSETS = Object.freeze({
  pdfModule: "../../vendor/pdf.mjs",
  pdfWorker: "../../vendor/pdf.worker.mjs",
  docxScript: "../../vendor/mammoth.js",
  remoteDependency: false,
});
