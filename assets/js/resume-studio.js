function cleanPhrase(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^[•\-–—]\s*/, '')
    .trim()
    .replace(/[.!?;:,\s]+$/g, '')
    .trim();
}

function sentence(value) {
  const cleaned = cleanPhrase(value);
  return cleaned ? cleaned + '.' : '';
}

function splitFacts(value) {
  const seen = new Set();
  const items = [];
  for (const part of String(value || '').split(/\r?\n|[•;]+/)) {
    const cleaned = cleanPhrase(part);
    const key = cleaned.toLocaleLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    items.push(cleaned);
    if (items.length === 8) break;
  }
  return items;
}

function naturalList(items) {
  const values = items.filter(Boolean);
  if (values.length <= 1) return values[0] || '';
  if (values.length === 2) return values[0] + ' and ' + values[1];
  return values.slice(0, -1).join(', ') + ', and ' + values[values.length - 1];
}

function looksLikeExperienceLead(value) {
  return /\b(?:\d+\+?\s*(?:years?|yrs?)|years?\s+of|experience|background)\b/i.test(value);
}

export function buildResumeWording(selectedMode, roleValue, factsValue, achievementValue = '') {
  const cleanRole = cleanPhrase(roleValue);
  const factItems = splitFacts(factsValue);
  const evidence = cleanPhrase(achievementValue);

  if (!cleanRole) throw new Error('Enter a target or current role.');
  if (!factItems.length) throw new Error('Add at least one relevant experience or skill fact.');

  if (selectedMode === 'Professional Summary') {
    let text;
    if (looksLikeExperienceLead(factItems[0])) {
      text = cleanRole + ' with ' + factItems[0] + '.';
      const strengths = factItems.slice(1, 5);
      if (strengths.length) text += ' Core strengths include ' + naturalList(strengths) + '.';
    } else {
      text = cleanRole + ' with experience in ' + naturalList(factItems.slice(0, 5)) + '.';
    }
    if (evidence) text += ' ' + sentence(evidence);
    return text;
  }

  if (selectedMode === 'Career Objective') {
    let text = 'Seeking opportunities as ' + cleanRole + ' to apply ' + naturalList(factItems.slice(0, 5)) + '.';
    if (evidence) text += ' ' + sentence(evidence);
    return text;
  }

  if (selectedMode === 'Experience Bullets') {
    const bulletItems = factItems.slice(0, 6);
    if (evidence && !factItems.some((item) => item.toLocaleLowerCase() === evidence.toLocaleLowerCase())) {
      bulletItems[0] = bulletItems[0] + ' — ' + evidence;
    }
    return bulletItems.map((item) => '• ' + sentence(item)).join('\n');
  }

  throw new Error('Choose a valid resume section.');
}

function initResumeStudio() {
  const $ = (selector) => document.querySelector(selector);
  const form = $('#resume-form');
  const mode = $('#mode');
  const role = $('#role');
  const facts = $('#facts');
  const achievement = $('#achievement');
  const result = $('#writing-result');
  const statusEl = $('#status');
  const factsLabel = $('#facts-label');
  const factsHelp = $('#facts-help');
  const achievementLabel = $('#achievement-label');
  const achievementHelp = $('#achievement-help');
  const copyButton = $('#copy-result');
  const downloadButton = $('#download-result');

  if (!form || !mode || !role || !facts || !achievement || !result || !statusEl || !factsLabel || !factsHelp || !achievementLabel || !achievementHelp || !copyButton || !downloadButton) {
    console.error('Resume Studio could not start because required page elements are missing.');
    return;
  }

  function setStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.classList.toggle('error', isError);
  }

  function updateModeGuidance() {
    const selected = mode.value;
    if (selected === 'Experience Bullets') {
      factsLabel.textContent = 'Actions / responsibilities';
      factsHelp.textContent = 'Enter one truthful action or responsibility per line. Start with an action verb when possible.';
      achievementLabel.textContent = 'Result / impact for the first bullet (optional)';
      achievementHelp.textContent = 'Add a measurable or specific outcome only if you can support it.';
      facts.placeholder = 'Reviewed KYC alerts for retail banking customers\nDocumented investigation findings clearly';
      achievement.placeholder = 'Reduced review errors by 15%';
    } else if (selected === 'Career Objective') {
      factsLabel.textContent = 'Skills or experience to apply';
      factsHelp.textContent = 'Enter one relevant skill, domain, or experience point per line.';
      achievementLabel.textContent = 'Relevant differentiator (optional)';
      achievementHelp.textContent = 'Add one truthful strength or outcome that supports the objective.';
      facts.placeholder = 'Customer support\nQuality assurance\nProcess improvement';
      achievement.placeholder = 'Recognized for accurate case documentation';
    } else {
      factsLabel.textContent = 'Relevant experience and skills';
      factsHelp.textContent = 'Enter one truthful experience, domain, or skill point per line.';
      achievementLabel.textContent = 'Evidence / measurable impact (optional)';
      achievementHelp.textContent = 'Add one outcome, achievement, or differentiator only if you can support it.';
      facts.placeholder = '3 years of experience in customer operations\nQuality audits\nRoot-cause analysis';
      achievement.placeholder = 'Improved quality scores from 91% to 96%';
    }
  }

  function requireOutput() {
    const text = result.value.trim();
    if (!text) throw new Error('Create or enter wording before using this action.');
    return text;
  }

  async function copyText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {}
    }
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.append(helper);
    helper.select();
    const copied = document.execCommand('copy');
    helper.remove();
    if (!copied) throw new Error('Copy is unavailable in this browser. Select the result and copy it manually.');
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    setStatus('');
    if (!form.reportValidity()) return;
    try {
      result.value = buildResumeWording(mode.value, role.value, facts.value, achievement.value);
      result.focus();
      result.setSelectionRange(0, 0);
      setStatus('Wording created. Review and edit it before using it.');
    } catch (error) {
      setStatus(error.message || 'Could not create wording.', true);
    }
  });

  copyButton.addEventListener('click', async () => {
    try {
      const text = requireOutput();
      await copyText(text);
      setStatus('Copied.');
    } catch (error) {
      setStatus(error.message || 'Copy failed.', true);
    }
  });

  downloadButton.addEventListener('click', () => {
    try {
      const text = requireOutput();
      const blob = new Blob([text + '\n'], { type: 'text/plain;charset=utf-8' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = 'resume-' + mode.value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.txt';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      setStatus('TXT download prepared.');
    } catch (error) {
      setStatus(error.message || 'Download failed.', true);
    }
  });

  mode.addEventListener('change', updateModeGuidance);
  updateModeGuidance();
}

if (typeof document !== 'undefined') initResumeStudio();
