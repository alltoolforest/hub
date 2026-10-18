const SERIF_HINTS=/(cambria|times|georgia|garamond|palatino|baskerville|bookman|constantia|serif|roman|minion|caslon)/i;
const SANS_HINTS=/(calibri|arial|helvetica|segoe|tahoma|verdana|trebuchet|sans|gothic|frutiger|univers)/i;
const MONO_HINTS=/(courier|consolas|monaco|menlo|mono|monospace)/i;
const BOLD_HINTS=/(bold|black|semibold|demi|heavy)/i;
const ITALIC_HINTS=/(italic|oblique|slanted)/i;

function sourceFontText(block){
  return [
    block?.fontName,
    block?.lines?.[0]?.fontName,
    block?.sourceRuns?.[0]?.fontContext?.baseFont,
    block?.sourceLines?.[0]?.[0]?.fontContext?.baseFont,
  ].filter(Boolean).join(' ');
}

export function inferSourceFontTraits(block,tx=null){
  if(tx?.styleChanged){
    return {
      family:['serif','sans','mono'].includes(tx.fontFamily)?tx.fontFamily:'serif',
      bold:!!tx.bold,
      italic:!!tx.italic,
      source:sourceFontText(block),
      explicit:true,
    };
  }
  const source=sourceFontText(block);
  const family=MONO_HINTS.test(source)?'mono':SERIF_HINTS.test(source)?'serif':SANS_HINTS.test(source)?'sans':'sans';
  return {family,bold:BOLD_HINTS.test(source),italic:ITALIC_HINTS.test(source),source,explicit:false};
}

export function isCoverageFailure(reason){
  return [
    'CHARACTER_NOT_AVAILABLE_IN_FONT',
    'COMPOSITE_CHARACTER_NOT_MAPPED',
    'TOUNICODE_REVERSE_MAP_MISSING',
    'TOUNICODE_REQUIRED',
    'SHAPING_REQUIRED',
  ].includes(String(reason||''));
}

export function fallbackReason({directReason,block}={}){
  if(block?.tier==='FONT_SUBSTITUTION')return 'BLOCK_REQUIRES_FONT_SUBSTITUTION';
  if(isCoverageFailure(directReason))return 'SOURCE_FONT_GLYPH_COVERAGE_INCOMPLETE';
  return directReason||'SOURCE_OPERATOR_RECONSTRUCTION_REQUIRED';
}
