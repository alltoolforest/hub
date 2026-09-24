import { tokenizeContentStream, groupOperators, operandsToValues } from './tokenizer.js';
export function parseContentStream(bytes, options) {
  const tokens = tokenizeContentStream(bytes, options);
  const instructions = groupOperators(tokens);
  return { tokens, instructions: instructions.map((i) => ({ ...i, values: operandsToValues(i.args) })) };
}
