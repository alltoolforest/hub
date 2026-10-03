export const COVER_LETTER_TEMPLATES = Object.freeze([
  Object.freeze({ id: "classic", name: "Classic", description: "Traditional, conservative letter layout." }),
  Object.freeze({ id: "modern", name: "Modern", description: "Contemporary layout with clear hierarchy." }),
  Object.freeze({ id: "minimal", name: "Minimal", description: "Simple, highly readable presentation." }),
  Object.freeze({ id: "professional", name: "Professional", description: "Corporate layout for broad business use." }),
]);

export const DEFAULT_TEMPLATE_ID = "classic";

export function isTemplateId(value) {
  return COVER_LETTER_TEMPLATES.some((template) => template.id === value);
}
