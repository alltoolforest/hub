const MAX_LETTER_CHARS = 8000;
const MAX_FILENAME_CHARS = 120;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitizeEditableText(value, max = MAX_LETTER_CHARS) {
  return String(value || "")
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL, "")
    .slice(0, Math.max(0, max));
}

export function sanitizeFilename(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(CONTROL, "")
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_FILENAME_CHARS);
}

export function isSafeHttpUrl(value) {
  const text = String(value || "").trim();
  if (!text) return true;
  if (!/^https?:\/\//i.test(text)) return false;
  try {
    if (typeof URL === "undefined") return true;
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function securityReviewInput({ letter = "", candidate = {} } = {}) {
  const issues = [];
  if (String(letter).length > MAX_LETTER_CHARS) issues.push("letter_too_long");
  if (candidate.linkedinOrPortfolio && !isSafeHttpUrl(candidate.linkedinOrPortfolio)) issues.push("unsafe_portfolio_url");
  return { ok: issues.length === 0, issues };
}
