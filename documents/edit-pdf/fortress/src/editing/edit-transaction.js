import { uniqueId } from '../utils/ids.js';

function normalizeFamily(value){
  return value==='sans'||value==='mono'?value:'serif';
}

export function createEditTransaction({pageIndex,block,replacementUnicode,style=null}){
  const fontSize=style?.fontSize==null?null:Math.max(6,Math.min(72,Number(style.fontSize)||12));
  return {
    id:uniqueId('edit'),
    kind:'REPLACE_TEXT',
    pageIndex,
    blockId:block.id,
    sourceMap:block.sourceLines,
    originalUnicode:block.text,
    replacementUnicode,
    originalEncodedBytes:null,
    replacementEncodedBytes:null,
    originalOperators:block.sourceRuns,
    replacementOperators:null,
    fontContext:block.sourceRuns?.[0]?.fontContext||null,
    layoutValidation:null,
    fontFamily:style?.fontFamily?normalizeFamily(style.fontFamily):null,
    fontSize,
    bold:style?.bold==null?null:!!style.bold,
    italic:style?.italic==null?null:!!style.italic,
    styleChanged:!!style?.styleChanged,
    status:'DRAFT',
    block,
  };
}

export function createInsertTransaction({pageIndex,text,x,y,fontSize=12,bold=false,italic=false,fontFamily='serif',lineHeight=null,maxWidth=300}){
  const size=Math.max(6,Math.min(72,Number(fontSize)||12));
  return {
    id:uniqueId('insert'),
    kind:'INSERT_TEXT',
    pageIndex,
    blockId:null,
    originalUnicode:'',
    replacementUnicode:String(text||''),
    x:Number(x)||0,
    y:Number(y)||0,
    fontSize:size,
    lineHeight:Math.max(7,Math.min(96,Number(lineHeight)||(size*1.2))),
    maxWidth:Math.max(40,Math.min(1000,Number(maxWidth)||300)),
    bold:!!bold,
    italic:!!italic,
    fontFamily:normalizeFamily(fontFamily),
    status:'COMMITTED',
  };
}
