export function concatBytes(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function hexToBytes(hex) {
  const clean = hex.replace(/\s+/g, '');
  const padded = clean.length % 2 ? clean + '0' : clean;
  const out = new Uint8Array(padded.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(padded.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesKey(bytes) {
  return bytesToHex(bytes);
}

export function copyBytes(bytes) {
  return new Uint8Array(bytes);
}
