// Literal search: user input is never interpreted as a regular expression.
export function findMatches(entries, query, {matchCase = false, wholeWord = false} = {}) {
  if (!query) return [];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped, matchCase ? 'gu' : 'giu');
  const word = /[\p{L}\p{N}\p{M}_]/u;
  const matches = [];
  for (const entry of entries) {
    if (entry.protected) continue;
    for (const match of entry.text.matchAll(pattern)) {
      const start = match.index, end = start + match[0].length;
      const before = [...entry.text.slice(Math.max(0, start - 2), start)].at(-1) || '';
      const after = [...entry.text.slice(end, end + 2)][0] || '';
      if (wholeWord && (word.test(before) || word.test(after))) continue;
      matches.push({id:entry.id, start, end});
    }
  }
  return matches;
}

export function mountFindReplace(host, adapter, onChange) {
  const panel = document.createElement('details');
  panel.className = 'document-v2-search';
  const summary = document.createElement('summary'); summary.textContent = 'Find and replace';
  panel.append(summary);
  const fields = document.createElement('div'); fields.className = 'document-v2-actions';
  function input(label, type = 'text') {
    const wrap = document.createElement('label'); wrap.append(label + ' ');
    const field = document.createElement('input'); field.type = type; wrap.append(field); fields.append(wrap); return field;
  }
  const query = input('Find'), replacement = input('Replace with');
  const matchCase = input('Match case', 'checkbox'), wholeWord = input('Whole word', 'checkbox');
  const result = document.createElement('p'); result.setAttribute('role', 'status');
  let matches = [], cursor = -1;
  const buttons = [];
  function refresh() {
    matches = findMatches(adapter.entries(), query.value, {matchCase:matchCase.checked, wholeWord:wholeWord.checked});
    cursor = -1;
    result.textContent = `${matches.length} matches in editable text. Protected content is excluded.`;
    buttons.forEach(button => { button.disabled = !matches.length; });
  }
  function reveal() { adapter.reveal(matches[cursor]); result.textContent = `Match ${cursor + 1} of ${matches.length}`; }
  function button(label, action) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.addEventListener('click', action); fields.append(button); buttons.push(button);
  }
  button('Previous match', () => { cursor = cursor < 0 ? matches.length - 1 : (cursor - 1 + matches.length) % matches.length; reveal(); });
  button('Next match', () => { cursor = (cursor + 1) % matches.length; reveal(); });
  function replace(all) {
    const targets = all ? [...matches].reverse() : [matches[Math.max(0, cursor)]];
    for (const target of targets) adapter.replace(target, replacement.value);
    onChange(); refresh();
    result.textContent = `${targets.length} replacements. ${matches.length} matches remain.`;
  }
  button('Replace', () => replace(false)); button('Replace all', () => replace(true));
  for (const field of [query, matchCase, wholeWord]) field.addEventListener('input', refresh);
  panel.append(fields, result); host.prepend(panel); refresh();
  return refresh;
}
