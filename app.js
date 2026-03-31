import { jqEval, JqError } from './jq.js';

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------

const jsonInput  = document.getElementById('jsonInput');
const jqInput    = document.getElementById('jqInput');
const formatBtn  = document.getElementById('formatBtn');
const copyBtn    = document.getElementById('copyBtn');
const themeBtn   = document.getElementById('themeBtn');
const output     = document.getElementById('output');
const statusLeft  = document.getElementById('statusLeft');
const statusRight = document.getElementById('statusRight');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let lastParsed = null;
let lastResult = null;
let outputEdited = false;

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function initTheme() {
  const saved = localStorage.getItem('json-statham-theme');
  const theme = saved || getSystemTheme();
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeButton();
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('json-statham-theme', next);
  updateThemeButton();
}

function updateThemeButton() {
  const current = document.documentElement.getAttribute('data-theme');
  // \u263E = ☾ (dark), \u2600 = ☀ (light)
  themeBtn.textContent = current === 'dark' ? '\u263E' : '\u2600';
}


// ---------------------------------------------------------------------------
// Format & Query
// ---------------------------------------------------------------------------

function formatAndQuery() {
  // If output was edited, sync it back to input as minified JSON
  if (outputEdited && output.value.trim()) {
    try {
      const edited = JSON.parse(output.value.trim());
      jsonInput.value = JSON.stringify(edited);
    } catch (_) {
      // If output isn't valid JSON, leave input as-is
    }
    outputEdited = false;
  }

  const raw = jsonInput.value.trim();

  if (!raw) {
    output.value = '';
    statusLeft.textContent = '';
    statusRight.textContent = '';
    lastParsed = null;
    lastResult = null;
    return;
  }

  // Parse JSON
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    output.value = '';
    output.placeholder = e.message;
    statusLeft.textContent = '\u2717 Invalid JSON'; // ✗
    statusRight.textContent = '';
    lastParsed = null;
    lastResult = null;
    return;
  }

  lastParsed = data;

  const expr = jqInput.value.trim();
  let results;
  let jqStatusText = '';

  if (!expr || expr === '.') {
    results = [data];
  } else {
    try {
      results = jqEval(data, expr);
      jqStatusText = 'jq result: ' + results.length + (results.length === 1 ? ' item' : ' items');
    } catch (e) {
      // Show formatted original data + error in output
      output.value = JSON.stringify(data, null, 2);
      outputEdited = false;

      // Status
      const byteCount = new TextEncoder().encode(raw).length;
      const keyCount = (typeof data === 'object' && data !== null && !Array.isArray(data))
        ? Object.keys(data).length
        : null;
      statusLeft.textContent = buildLeftStatus(data, byteCount, keyCount);
      statusRight.textContent = '\u2717 jq error: ' + (e instanceof JqError ? e.message : String(e));
      lastResult = null;
      return;
    }
  }

  lastResult = results;

  // Render results as formatted JSON text
  if (results.length === 1) {
    output.value = JSON.stringify(results[0], null, 2);
  } else {
    output.value = results.map(r => JSON.stringify(r, null, 2)).join('\n\n---\n\n');
  }
  outputEdited = false;

  // Status bar
  const byteCount = new TextEncoder().encode(raw).length;
  const keyCount = (typeof data === 'object' && data !== null && !Array.isArray(data))
    ? Object.keys(data).length
    : null;
  statusLeft.textContent = buildLeftStatus(data, byteCount, keyCount);
  statusRight.textContent = jqStatusText;
}

function buildLeftStatus(data, byteCount, keyCount) {
  // \u2713 = ✓, \u2022 = •
  let left = '\u2713 Valid JSON';
  if (keyCount !== null) {
    left += ' \u2022 ' + keyCount + (keyCount === 1 ? ' key' : ' keys');
  } else if (Array.isArray(data)) {
    left += ' \u2022 ' + data.length + (data.length === 1 ? ' item' : ' items');
  }
  left += ' \u2022 ' + byteCount + ' bytes';
  return left;
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

function copyOutput() {
  const text = output.value.trim();
  if (!text) return;

  navigator.clipboard.writeText(text).then(() => {
    copyBtn.textContent = 'Copied!';
    copyBtn.classList.add('copied');
    setTimeout(() => {
      copyBtn.textContent = 'Copy';
      copyBtn.classList.remove('copied');
    }, 1500);
  }).catch(() => {
    // Silently fail if clipboard not available
  });
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

formatBtn.addEventListener('click', formatAndQuery);

jqInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    formatAndQuery();
  }
});

copyBtn.addEventListener('click', copyOutput);
themeBtn.addEventListener('click', toggleTheme);
output.addEventListener('input', () => { outputEdited = true; });

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

initTheme();
