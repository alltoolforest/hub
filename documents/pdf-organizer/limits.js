// Organize PDF V2: browser-local source admission limits.
// A single valid PDF up to 100 MiB can be selected when the session is empty.
// The shared 100 MiB session ceiling avoids multiplying retained PDF bytes
// during combine, copy, independent verification, and undo/history operations.
// These are *file-byte* limits, not guarantees for every PDF's decoded memory.
export const MAX_PDF_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_PDF_SESSION_BYTES = 100 * 1024 * 1024;
export const MAX_PDF_PAGES = 2000;
