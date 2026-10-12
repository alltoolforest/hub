// Organize PDF Pages only — guarded compatibility for vendored PDF.js.
// The bundled PDF.js uses the 2026 Map upsert proposal. Some supported browsers
// still lack the native method; this polyfill runs only on the organizer page.
// No shared vendor assets or other AllToolForest tools are modified.
export function ensurePdfPreviewCompatibility() {
  if (typeof Map.prototype.getOrInsertComputed === 'function') return false;
  Object.defineProperty(Map.prototype, 'getOrInsertComputed', {
    configurable: true,
    writable: true,
    value: function getOrInsertComputed(key, callback) {
      if (!(this instanceof Map)) {
        throw new TypeError('Map.prototype.getOrInsertComputed called on incompatible receiver');
      }
      if (typeof callback !== 'function') {
        throw new TypeError('Map.prototype.getOrInsertComputed requires a callback');
      }
      if (this.has(key)) return this.get(key);
      const value = callback(key);
      this.set(key, value);
      return value;
    }
  });
  return true;
}
