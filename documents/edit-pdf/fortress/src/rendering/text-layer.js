export async function extractVisualText(renderer,pageIndex){const tc=await renderer.getTextContent(pageIndex);return {items:tc.items,styles:tc.styles||{}};}
