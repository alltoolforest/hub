import { MAX_LENGTHS } from "./contracts.js";

export function normalizeText(value,maxKey){
  const text=String(value??"")
    .replace(/\u0000/g,"")
    .replace(/\r\n?/g,"\n")
    .trim();
  const max=MAX_LENGTHS[maxKey];
  if(!max)throw new Error("Unsupported input field.");
  if(text.length>max)throw new Error(`${maxKey} exceeds the supported length of ${max} characters.`);
  return text;
}

export function normalizeLines(value,maxKey){
  return normalizeText(value,maxKey)
    .split("\n")
    .map(line=>line.trim().replace(/^[•\-*]+\s*/,""))
    .filter(Boolean);
}
