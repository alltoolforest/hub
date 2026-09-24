export const SupportTier=Object.freeze({DIRECT_EDIT:'DIRECT_EDIT',FONT_SUBSTITUTION:'FONT_SUBSTITUTION',LIMITED_EDIT:'LIMITED_EDIT',SCANNED:'SCANNED',LOCKED:'LOCKED',UNSUPPORTED:'UNSUPPORTED'});
export function support(tier,confidence=0,reason=null,extra={}){return {tier,confidence,reason,...extra};}
