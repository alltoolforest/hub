// Store editing intent only. PDF parser objects and font references must be
// rebuilt against the original bytes, never serialized into browser storage.
const fields = ['id','kind','pageIndex','blockId','originalUnicode','replacementUnicode',
  'displayUnicode','fontFamily','fontSize','bold','italic','textColor','styleChanged','x','y',
  'lineHeight','maxWidth','reflowPlan','expandedFromBlockId','status'];
export async function sourceDigest(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2,'0')).join('');
}
export function nativeDraft(transactions, source, pageIndex, zoom) {
  return {version:1,source,pageIndex,zoom,transactions:transactions.map(tx => {
    const intent = {};
    for (const field of fields) if (tx[field] !== undefined) intent[field] = tx[field];
    return JSON.parse(JSON.stringify(intent));
  })};
}
export function validateNativeDraft(draft, source, pageCount) {
  if (!draft || draft.version !== 1 || draft.source !== source ||
      !Number.isInteger(draft.pageIndex) || draft.pageIndex < 0 || draft.pageIndex >= pageCount ||
      !Number.isFinite(draft.zoom) || draft.zoom < .1 || draft.zoom > 10 ||
      !Array.isArray(draft.transactions) || draft.transactions.length > 10000)
    throw new Error('The PDF draft does not match this document or is invalid.');
  const keys = new Set(), ids = new Set();
  for (const tx of draft.transactions) {
    if (!tx || !['INSERT_TEXT','REPLACE_TEXT'].includes(tx.kind) || typeof tx.id !== 'string' || !tx.id ||
        !Number.isInteger(tx.pageIndex) || tx.pageIndex < 0 || tx.pageIndex >= pageCount ||
        typeof tx.replacementUnicode !== 'string' || tx.replacementUnicode.length > 1_000_000 ||
        (tx.kind === 'REPLACE_TEXT' && (typeof tx.blockId !== 'string' || typeof tx.originalUnicode !== 'string')) ||
        (tx.kind === 'INSERT_TEXT' && !['x','y','fontSize','lineHeight','maxWidth'].every(key => Number.isFinite(tx[key]))))
      throw new Error('Invalid PDF draft transaction.');
    const key = tx.kind === 'INSERT_TEXT' ? tx.id : tx.blockId;
    if (keys.has(key) || ids.has(tx.id)) throw new Error('Duplicate PDF draft transaction.');
    keys.add(key); ids.add(tx.id);
  }
  // Copy only known fields; restored data must not carry parser internals.
  return nativeDraft(draft.transactions,source,draft.pageIndex,draft.zoom);
}
