let counter = 0;
export function uniqueId(prefix = 'id') {
  counter += 1;
  const rand = globalThis.crypto?.randomUUID?.();
  return rand ? `${prefix}:${rand}` : `${prefix}:${Date.now().toString(36)}:${counter.toString(36)}`;
}

export function blockId(pageIndex, localIndex) {
  return `page-${pageIndex}:block-${localIndex}`;
}
