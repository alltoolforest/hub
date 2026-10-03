import { TEMPLATE_IDS } from '../schema.js';
import { ATS_CLASSIC_TEMPLATE } from './ats-classic.js';
import { PROFESSIONAL_TEMPLATE } from './professional.js';
import { MODERN_MINIMAL_TEMPLATE } from './modern-minimal.js';
import { FRESHER_TEMPLATE } from './fresher.js';

export const TEMPLATE_CATALOG = Object.freeze([
  ATS_CLASSIC_TEMPLATE,
  PROFESSIONAL_TEMPLATE,
  MODERN_MINIMAL_TEMPLATE,
  FRESHER_TEMPLATE
]);

export function getTemplateById(id) {
  return TEMPLATE_CATALOG.find((template) => template.id === id) || ATS_CLASSIC_TEMPLATE;
}

export function isTemplateId(id) {
  return Object.values(TEMPLATE_IDS).includes(id);
}
