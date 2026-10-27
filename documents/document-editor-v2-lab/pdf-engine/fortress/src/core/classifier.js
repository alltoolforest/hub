import { SupportTier } from './classification.js';
import {formRegionSafe} from './form-protection.js';
export function applyDocumentSafety(blocks,flags,{pageIndex}={}){
  if(flags.encrypted)return blocks.map(b=>({...b,tier:SupportTier.LOCKED,confidence:1,reason:'ENCRYPTED_DOCUMENT'}));
  if(flags.signed)return blocks.map(b=>({...b,tier:SupportTier.LOCKED,confidence:1,reason:'DIGITALLY_SIGNED_DOCUMENT'}));
  if(flags.hasAcroForm||flags.formWidgets?.length)return blocks.map(b=>!formRegionSafe(flags,pageIndex??b.pageIndex,b.bounds)&&(b.tier===SupportTier.DIRECT_EDIT||b.tier===SupportTier.FONT_SUBSTITUTION)?({...b,tier:SupportTier.LIMITED_EDIT,confidence:Math.min(b.confidence,.7),reason:'PDF_FORM_REGION_PROTECTED'}):b);
  return blocks;
}
