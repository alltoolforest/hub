import { loadPdfjs } from './pdfjs.js';

// Short-lived validation readers must release workers even when parsing fails.
export async function withPdfDocument(bytes, read) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({data: bytes.slice(), isEvalSupported: false, useWorkerFetch: false, disableFontFace: true});
  try {
    return await read(await task.promise);
  } finally {
    try { await task.destroy(); } catch {}
  }
}
