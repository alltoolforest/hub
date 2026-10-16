const DATABASE = 'alltoolforest-document-editor-v2';
const STORE = 'drafts';

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact(mode, operation) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = operation(transaction.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || Error('Local recovery was interrupted.'));
    });
  } finally { db.close(); }
}

export const readDraft = () => transact('readonly', store => store.get('current'));
export const writeDraft = draft => transact('readwrite', store => store.put(draft, 'current'));
export const clearDraft = () => transact('readwrite', store => store.delete('current'));
