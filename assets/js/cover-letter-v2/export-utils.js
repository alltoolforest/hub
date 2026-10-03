function safeFilenamePart(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function createExportFilename(candidate = {}, extension = "txt") {
  const name = safeFilenamePart(candidate.fullName) || "cover-letter";
  const role = safeFilenamePart(candidate.targetPosition);
  const stem = role ? `${name} - ${role}` : name;
  return `${stem}.${String(extension || "txt").replace(/[^a-z0-9]/gi, "").toLowerCase() || "txt"}`;
}

export async function copyCoverLetter(text, clipboard = globalThis.navigator?.clipboard) {
  const value = String(text || "");
  if (!value.trim()) return { ok: false, reason: "empty" };
  if (!clipboard || typeof clipboard.writeText !== "function") return { ok: false, reason: "clipboard_unavailable" };
  try {
    await clipboard.writeText(value);
    return { ok: true };
  } catch {
    return { ok: false, reason: "clipboard_failed" };
  }
}

export function createPlainTextDownload(text, candidate = {}) {
  const value = String(text || "");
  if (!value.trim()) return { ok: false, reason: "empty" };
  const blob = new Blob([value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  return {
    ok: true,
    filename: createExportFilename(candidate, "txt"),
    url,
    revoke: () => URL.revokeObjectURL(url),
  };
}
