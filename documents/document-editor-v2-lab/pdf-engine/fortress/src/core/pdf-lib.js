export * from '../../../../../edit-pdf/fortress/vendor/pdf-lib.esm.min.js';

// Object editing needs PDFString; keep this export in the isolated adapter.
export const PDFString = globalThis.PDFLib.PDFString;
