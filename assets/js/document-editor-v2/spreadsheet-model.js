export const displayValue = value => {
  if (value == null) return '';
  if (typeof value === 'object') {
    if ('formula' in value) return '=' + value.formula;
    if ('sharedFormula' in value) return '=' + value.sharedFormula;
    if ('richText' in value) return value.richText.map(item => item.text).join('');
    if ('text' in value) return value.text;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value.result ?? '');
  }
  return String(value);
};

export function assignCell(cell, text) {
  if (text.startsWith('=') && text.length > 1) cell.value = {formula:text.slice(1)};
  else cell.value = text;
}

export function formulaInventory(book) {
  const formulas = new Map();
  for (const sheet of book.worksheets) sheet.eachRow({includeEmpty:false}, row => {
    row.eachCell({includeEmpty:false}, cell => {
      const value = cell.value;
      if (value && typeof value === 'object' && (value.formula || value.sharedFormula))
        formulas.set(`${sheet.name}!${cell.address}`, value.formula || `shared:${value.sharedFormula}`);
    });
  });
  return formulas;
}

export function assertPreserved(before, after, edits) {
  if (before.worksheets.length !== after.worksheets.length ||
      before.worksheets.some((sheet, i) => sheet.name !== after.worksheets[i]?.name))
    throw new Error('Spreadsheet export lost a worksheet. Your draft is retained.');
  const expected = formulaInventory(before);
  const actual = formulaInventory(after);
  if (expected.size !== actual.size || [...expected].some(([key, formula]) => actual.get(key) !== formula))
    throw new Error('Spreadsheet export altered formulas. Your draft is retained.');
  for (const [sheetName, address] of edits) {
    const source = before.getWorksheet(sheetName)?.getCell(address);
    const result = after.getWorksheet(sheetName)?.getCell(address);
    if (displayValue(source?.value) !== displayValue(result?.value))
      throw new Error('Spreadsheet export lost an edited cell. Your draft is retained.');
  }
}
