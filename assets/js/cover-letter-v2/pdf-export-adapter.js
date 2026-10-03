import { createExportFilename } from "./export-utils.js";

export function hasDirectPdfExporter(pdfExporter) {
  return Boolean(pdfExporter && typeof pdfExporter.exportPdf === "function");
}

export async function downloadPdfWithAdapter({
  letter,
  templateId = "classic",
  candidate = {},
  pdfExporter,
  pageSize = "A4",
} = {}) {
  if (!String(letter || "").trim()) return { ok: false, reason: "empty" };
  if (!hasDirectPdfExporter(pdfExporter)) return { ok: false, reason: "direct_pdf_exporter_unavailable" };

  try {
    const blob = await pdfExporter.exportPdf({ letter, templateId, pageSize });
    if (!(blob instanceof Blob) || blob.type !== "application/pdf") {
      return { ok: false, reason: "invalid_pdf_blob" };
    }
    const url = URL.createObjectURL(blob);
    return {
      ok: true,
      filename: createExportFilename(candidate, "pdf"),
      url,
      revoke: () => URL.revokeObjectURL(url),
    };
  } catch {
    return { ok: false, reason: "pdf_export_failed" };
  }
}
