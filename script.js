const form = document.getElementById('brief-form');
const previewEl = document.getElementById('preview');
const autosaveIndicator = document.getElementById('autosave-indicator');

const STORAGE_KEY = 'copy-request-brief-v1';

function getFormData() {
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());

  // Normalize multiline fields
  data.keyMessages = (data.keyMessages || '')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);

  data.references = (data.references || '')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);

  // Normalize SEO keywords
  data.seoKeywords = (data.seoKeywords || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  // Coerce numbers
  if (data.wordCount) data.wordCount = Number(data.wordCount);

  return data;
}

function toMarkdown(data) {
  const lines = [];

  if (data.projectTitle) lines.push(`# ${data.projectTitle}`);
  lines.push('');

  const meta = [];
  if (data.copyType) meta.push(`**Type**: ${data.copyType}`);
  if (data.brand) meta.push(`**Brand/Product**: ${data.brand}`);
  if (data.language) meta.push(`**Language**: ${data.language}`);
  if (data.wordCount) meta.push(`**Word count target**: ${data.wordCount}`);
  if (data.priority) meta.push(`**Priority**: ${data.priority}`);
  if (data.deadline) meta.push(`**Deadline**: ${data.deadline}`);
  if (meta.length) {
    lines.push(meta.join('  \n'));
    lines.push('');
  }

  if (data.objective) {
    lines.push('## Objective');
    lines.push(data.objective.trim());
    lines.push('');
  }

  if (data.audience) {
    lines.push('## Audience');
    lines.push(data.audience.trim());
    lines.push('');
  }

  if (data.tone) {
    lines.push('## Tone of voice');
    lines.push(data.tone.trim());
    lines.push('');
  }

  if (data.keyMessages && data.keyMessages.length) {
    lines.push('## Key messages');
    for (const msg of data.keyMessages) {
      lines.push(`- ${msg}`);
    }
    lines.push('');
  }

  if (data.cta) {
    lines.push('## Primary call to action');
    lines.push(data.cta.trim());
    lines.push('');
  }

  if (data.seoKeywords && data.seoKeywords.length) {
    lines.push('## SEO keywords');
    lines.push(data.seoKeywords.map(k => `\`${k}\``).join(', '));
    lines.push('');
  }

  if (data.references && data.references.length) {
    lines.push('## References / links');
    for (const ref of data.references) {
      lines.push(`- ${ref}`);
    }
    lines.push('');
  }

  if (data.constraints) {
    lines.push('## Constraints / required phrases');
    lines.push(data.constraints.trim());
    lines.push('');
  }

  if (data.notes) {
    lines.push('## Additional notes');
    lines.push(data.notes.trim());
  }

  return lines.join('\n');
}

function renderPreview() {
  const data = getFormData();
  const md = toMarkdown(data);
  previewEl.textContent = md;
}

function saveToLocalStorage() {
  const data = getFormData();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    autosaveIndicator.textContent = 'Saved';
    setTimeout(() => { autosaveIndicator.textContent = ''; }, 1000);
  } catch (err) {
    console.warn('Autosave failed', err);
  }
}

function restoreFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    for (const [key, value] of Object.entries(saved)) {
      const el = form.elements.namedItem(key);
      if (!el) continue;
      if (Array.isArray(value)) {
        if (key === 'keyMessages') {
          el.value = value.join('\n');
        } else if (key === 'references') {
          el.value = value.join('\n');
        } else if (key === 'seoKeywords') {
          el.value = value.join(', ');
        }
      } else {
        el.value = value;
      }
    }
  } catch (err) {
    console.warn('Restore failed', err);
  }
}

function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  return new Promise((resolve, reject) => {
    try {
      const successful = document.execCommand('copy');
      document.body.removeChild(ta);
      successful ? resolve() : reject(new Error('execCommand failed'));
    } catch (err) {
      document.body.removeChild(ta);
      reject(err);
    }
  });
}

function download(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

function buildEmailLink(subject, body) {
  const mailto = 'mailto:';
  const params = new URLSearchParams();
  params.set('subject', subject);
  params.set('body', body);
  return `${mailto}?${params.toString()}`;
}

function validateForm() {
  // Minimal required fields
  const title = form.projectTitle.value.trim();
  const objective = form.objective.value.trim();
  const missing = [];
  if (!title) missing.push('Project title');
  if (!objective) missing.push('Objective');
  return missing;
}

// Event bindings
form.addEventListener('input', () => {
  renderPreview();
  saveToLocalStorage();
});

// Buttons

document.getElementById('btn-copy').addEventListener('click', async () => {
  const missing = validateForm();
  if (missing.length) {
    alert(`Please complete required fields: ${missing.join(', ')}`);
    return;
  }
  const md = toMarkdown(getFormData());
  try {
    await copyToClipboard(md);
    autosaveIndicator.textContent = 'Copied to clipboard';
    setTimeout(() => { autosaveIndicator.textContent = ''; }, 1200);
  } catch (err) {
    alert('Copy failed. You can still select the preview and copy manually.');
  }
});

document.getElementById('btn-download-md').addEventListener('click', () => {
  const title = form.projectTitle.value.trim() || 'copy-request';
  const md = toMarkdown(getFormData());
  download(`${slugify(title)}.md`, md);
});

document.getElementById('btn-download-json').addEventListener('click', () => {
  const title = form.projectTitle.value.trim() || 'copy-request';
  const data = getFormData();
  download(`${slugify(title)}.json`, JSON.stringify(data, null, 2));
});

document.getElementById('btn-email').addEventListener('click', () => {
  const data = getFormData();
  const subject = data.projectTitle ? `[Copy Request] ${data.projectTitle}` : 'Copy Request';
  const body = toMarkdown(data);
  const url = buildEmailLink(subject, body);
  // NOTE: mailto URLs can be truncated by clients if too long.
  window.location.href = url;
});

document.getElementById('btn-print').addEventListener('click', () => {
  window.print();
});

document.getElementById('btn-reset').addEventListener('click', () => {
  if (!confirm('Clear all fields?')) return;
  localStorage.removeItem(STORAGE_KEY);
  form.reset();
  renderPreview();
});

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// Initialize
restoreFromLocalStorage();
renderPreview();