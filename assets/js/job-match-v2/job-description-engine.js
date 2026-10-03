import {
  CONFIDENCE_LEVEL,
  PROVENANCE_KIND
} from './contracts.js';
import { ingestJobDescriptionText } from './ingestion.js';
import { parseJobDescription } from './job-description-parser.js';
import { extractJobRequirements } from './requirement-extractor.js';
import { normalizeJobRequirements } from './terminology-normalizer.js';

function confidenceFor(normalized) {
  const count = normalized.requirements.length;
  if (!count) return CONFIDENCE_LEVEL.NONE;
  const unresolved = normalized.diagnostics.unresolvedCount;
  if (unresolved === count) return CONFIDENCE_LEVEL.LOW;
  if (unresolved > 0) return CONFIDENCE_LEVEL.MEDIUM;
  return CONFIDENCE_LEVEL.HIGH;
}

export function analyzeJobDescription(value) {
  const input = ingestJobDescriptionText(value);
  const parsed = parseJobDescription(input.rawText);
  const extracted = extractJobRequirements(parsed);
  const normalized = normalizeJobRequirements(extracted.requirements, input.rawText);
  const confidence = confidenceFor(normalized);

  return Object.freeze({
    rawText: input.rawText,
    segments: parsed.segments,
    requirements: normalized.requirements,
    ignoredSegments: extracted.ignoredSegments,
    uncertainSegments: extracted.uncertainSegments,
    diagnostics: extracted.diagnostics,
    normalization: normalized.diagnostics,
    confidence,
    provenance: PROVENANCE_KIND.PARSED
  });
}

export function applyJobDescriptionIntelligenceToState(state, result) {
  if (!state?.jobDescription || !result || typeof result.rawText !== 'string') {
    throw new TypeError('A canonical analysis state and analyzed job description are required.');
  }

  const next = typeof structuredClone === 'function'
    ? structuredClone(state)
    : JSON.parse(JSON.stringify(state));

  next.jobDescription.rawText = result.rawText;
  next.jobDescription.segments = Array.isArray(result.segments)
    ? result.segments.map((item) => ({ ...item }))
    : [];
  next.jobDescription.requirements = Array.isArray(result.requirements)
    ? result.requirements.map((item) => ({
      ...item,
      mentions: Array.isArray(item.mentions)
        ? item.mentions.map((mention) => ({ ...mention }))
        : [],
      normalizedMentions: Array.isArray(item.normalizedMentions)
        ? item.normalizedMentions.map((mention) => ({ ...mention }))
        : []
    }))
    : [];
  next.jobDescription.ignoredSegments = Array.isArray(result.ignoredSegments)
    ? result.ignoredSegments.map((item) => ({ ...item }))
    : [];
  next.jobDescription.uncertainSegments = Array.isArray(result.uncertainSegments)
    ? result.uncertainSegments.map((item) => ({ ...item }))
    : [];
  next.jobDescription.diagnostics = {
    segmentCount: Number(result.diagnostics?.segmentCount || 0),
    requirementCount: Number(result.diagnostics?.requirementCount || 0),
    ignoredSegmentCount: Number(result.diagnostics?.ignoredSegmentCount || 0),
    uncertainSegmentCount: Number(result.diagnostics?.uncertainSegmentCount || 0)
  };
  next.jobDescription.normalization = {
    inputRequirementCount: Number(result.normalization?.inputRequirementCount || 0),
    outputRequirementCount: Number(result.normalization?.outputRequirementCount || 0),
    normalizedCount: Number(result.normalization?.normalizedCount || 0),
    unresolvedCount: Number(result.normalization?.unresolvedCount || 0)
  };
  next.provenance.jobDescription = PROVENANCE_KIND.USER_INPUT;
  next.confidence.jobRequirements = result.confidence || CONFIDENCE_LEVEL.NONE;

  return next;
}
