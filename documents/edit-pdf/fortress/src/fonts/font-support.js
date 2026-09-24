export function classifyFontSupport(font){
  if(!font) return {tier:'LIMITED_EDIT',reason:'FONT_NOT_RESOLVED'};
  if(font.toUnicode?.reason==='USECMAP_INHERITANCE_UNSUPPORTED') return {tier:'LIMITED_EDIT',reason:font.toUnicode.reason};
  if(font.isComposite){
    if(font.subtype!=='Type0') return {tier:'LIMITED_EDIT',reason:'COMPOSITE_FONT_UNSUPPORTED'};
    if(font.encoding==='Identity-V') return {tier:'UNSUPPORTED',reason:'IDENTITY_V_VERTICAL_WRITING_UNSUPPORTED'};
    if(font.descendantSubtype!=='CIDFontType2') return {tier:'LIMITED_EDIT',reason:'CIDFONT_TYPE0_CFF_UNSUPPORTED'};
    if(font.encoding!=='Identity-H') return {tier:'LIMITED_EDIT',reason:'CID_ENCODING_UNSUPPORTED'};
    if(!font.toUnicode?.supported) return {tier:'LIMITED_EDIT',reason:font.toUnicode?.reason||'TOUNICODE_REQUIRED'};
    return {tier:'DIRECT_EDIT',reason:null};
  }
  return {tier:'DIRECT_EDIT',reason:null};
}
