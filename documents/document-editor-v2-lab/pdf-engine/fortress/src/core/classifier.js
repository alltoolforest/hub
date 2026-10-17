import { SupportTier } from './classification.js';
export function applyDocumentSafety(blocks,flags){
  if(flags.encrypted)return blocks.map(b=>({...b,tier:SupportTier.LOCKED,confidence:1,reason:'ENCRYPTED_DOCUMENT'}));
  if(flags.signed)return blocks.map(b=>({...b,tier:SupportTier.LOCKED,confidence:1,reason:'DIGITALLY_SIGNED_DOCUMENT'}));
  if(flags.hasAcroForm)return blocks.map(b=>(b.tier===SupportTier.DIRECT_EDIT||b.tier===SupportTier.FONT_SUBSTITUTION)?({...b,tier:SupportTier.LIMITED_EDIT,confidence:Math.min(b.confidence,.7),reason:'ACROFORM_DOCUMENT_REQUIRES_REVIEW'}):b);
  return blocks;
}
