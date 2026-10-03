import { createExportFilename, copyCoverLetter } from "./export-utils.js";
import { buildPrintableHtml } from "./print-export.js";
import { downloadPdfWithAdapter, hasDirectPdfExporter } from "./pdf-export-adapter.js";
import { sanitizeEditableText, sanitizeFilename, isSafeHttpUrl, securityReviewInput } from "./security-guards.js";
import { inspectWorkload, PERFORMANCE_BUDGETS } from "./performance-guards.js";
import { COVER_LETTER_SEO } from "./seo-content.js";

const assert=(condition,message)=>{if(!condition)throw new Error(message);};

export async function runTask4Regression(){
  const filename=createExportFilename({fullName:"Alex / Candidate",targetPosition:"Finance: Analyst"},"pdf");
  assert(filename.endsWith(".pdf"),"PDF filename extension required.");
  assert(!/[/:*?<>|]/.test(filename),"Filename must be sanitized.");

  let copied="";
  const clipboard={writeText:async value=>{copied=value;}};
  const copy=await copyCoverLetter("Hello world",clipboard);
  assert(copy.ok&&copied==="Hello world","Clipboard copy should succeed.");
  assert(!(await copyCoverLetter("",clipboard)).ok,"Empty copy should fail safely.");

  const malicious='Name <script>alert("x")</script>\nSecond line';
  const a4=buildPrintableHtml({letter:malicious,templateId:"modern",pageSize:"A4"});
  const letter=buildPrintableHtml({letter:"Unicode: José — नमस्ते — résumé",templateId:"classic",pageSize:"LETTER"});
  assert(a4.includes("@page{size:A4"),"A4 print CSS required.");
  assert(letter.includes("@page{size:Letter"),"US Letter print CSS required.");
  assert(!a4.includes("<script>alert"),"Printable HTML must escape candidate content.");
  assert(a4.includes("&lt;script&gt;"),"Escaped user content should remain visible text.");
  assert(letter.includes("José")&&letter.includes("नमस्ते"),"Unicode should be preserved for browser printing.");

  assert(!hasDirectPdfExporter(null),"Missing direct PDF exporter should be detected.");
  const unavailable=await downloadPdfWithAdapter({letter:"Text",pdfExporter:null});
  assert(!unavailable.ok&&unavailable.reason==="direct_pdf_exporter_unavailable","Direct PDF should fail explicitly when adapter is unavailable.");
  let invalidPdfBlobCheck = "browser_blob_api_unavailable_in_harness";
  if (typeof Blob !== "undefined") {
    const invalid=await downloadPdfWithAdapter({letter:"Text",pdfExporter:{exportPdf:async()=>new Blob(["bad"],{type:"text/plain"})}});
    assert(!invalid.ok&&invalid.reason==="invalid_pdf_blob","Invalid PDF blobs must be rejected.");
    invalidPdfBlobCheck = true;
  }

  const sanitized=sanitizeEditableText("A\u0000B\r\nC");
  assert(sanitized==="AB\nC","Control characters should be removed and newlines normalized.");
  assert(!sanitizeFilename('bad:/name*?').match(/[/:*?]/),"Filename sanitizer should remove reserved characters.");
  assert(isSafeHttpUrl("https://example.com/profile"),"HTTPS portfolio URL should be accepted.");
  assert(!isSafeHttpUrl("javascript:alert(1)"),"javascript: URL must be rejected.");
  const security=securityReviewInput({letter:"Safe",candidate:{linkedinOrPortfolio:"javascript:alert(1)"}});
  assert(!security.ok&&security.issues.includes("unsafe_portfolio_url"),"Unsafe portfolio URLs must be flagged.");

  const within=inspectWorkload({resumeText:"x".repeat(1000),jobDescription:"y".repeat(1000),letter:"z".repeat(1000)});
  assert(within.ok,"Normal workload should pass.");
  const over=inspectWorkload({resumeText:"x".repeat(PERFORMANCE_BUDGETS.resumeChars+1)});
  assert(!over.ok&&over.exceeded.includes("resumeChars"),"Oversized workload should be detected.");

  assert(COVER_LETTER_SEO.title.includes("Cover Letter Builder"),"SEO title required.");
  assert(COVER_LETTER_SEO.description.length>80,"SEO description should be useful.");
  assert(COVER_LETTER_SEO.canonicalPath==="/hub/work/cover-letter/","Canonical path should match production route.");
  const headings=COVER_LETTER_SEO.sections.map(s=>s.heading);
  [
    "How the Cover Letter Builder works",
    "How to tailor a cover letter to a job description",
    "What to include in a cover letter",
    "Cover letters for freshers",
    "Cover letters for experienced professionals",
    "Cover letter vs resume",
    "Recommended cover letter length",
    "Privacy",
  ].forEach(h=>assert(headings.includes(h),`Missing SEO section: ${h}`));
  assert(COVER_LETTER_SEO.faq.length>=3,"FAQ content required.");

  return {
    pass:true,
    copy:true,
    printA4:true,
    printLetter:true,
    unicodePrint:true,
    htmlEscaping:true,
    filenameSanitization:true,
    directPdfAdapterBoundary:true,
    invalidPdfBlobCheck,
    securityGuards:true,
    performanceBudgets:true,
    seoContent:true,
    directPdfExporterAvailable:false,
  };
}
