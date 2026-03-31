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
// Tree renderer helpers
// ---------------------------------------------------------------------------

function clearElement(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function createToggle() {
  const span = document.createElement('span');
  span.className = 'json-toggle';
  span.textContent = '\u25BC'; // ▼
  return span;
}

function renderNull() {
  const span = document.createElement('span');
  span.className = 'json-null';
  span.textContent = 'null';
  return span;
}

function renderBool(value) {
  const span = document.createElement('span');
  span.className = 'json-bool';
  span.textContent = String(value);
  return span;
}

function renderNumber(value) {
  const span = document.createElement('span');
  span.className = 'json-number';
  span.textContent = String(value);
  return span;
}

function renderString(value) {
  const span = document.createElement('span');
  span.className = 'json-string';
  span.textContent = JSON.stringify(value);
  return span;
}

function renderObject(obj) {
  const keys = Object.keys(obj);
  const wrapper = document.createElement('div');
  wrapper.className = 'json-object';

  // Header line: toggle + "{"
  const header = document.createElement('span');
  const toggle = createToggle();
  const open = document.createElement('span');
  open.textContent = '{';

  // Hint shown when collapsed
  const hint = document.createElement('span');
  hint.className = 'json-hint';
  hint.textContent = ' ... ' + keys.length + (keys.length === 1 ? ' key' : ' keys') + ' }';
  hint.style.display = 'none';

  header.appendChild(toggle);
  header.appendChild(open);
  header.appendChild(hint);
  wrapper.appendChild(header);

  // Children container
  const children = document.createElement('div');
  children.className = 'json-children';
  children.style.marginLeft = '20px';

  for (const key of keys) {
    const line = document.createElement('div');
    const keySpan = document.createElement('span');
    keySpan.className = 'json-key';
    keySpan.textContent = JSON.stringify(key) + ': ';
    line.appendChild(keySpan);
    line.appendChild(renderNode(obj[key]));
    children.appendChild(line);
  }

  wrapper.appendChild(children);

  // Closing brace
  const closing = document.createElement('div');
  closing.textContent = '}';
  wrapper.appendChild(closing);

  // Toggle behaviour
  toggle.addEventListener('click', () => {
    const collapsed = children.classList.toggle('collapsed');
    toggle.textContent = collapsed ? '\u25B6' : '\u25BC'; // ► or ▼
    hint.style.display = collapsed ? '' : 'none';
    closing.style.display = collapsed ? 'none' : '';
  });

  return wrapper;
}

function renderArray(arr) {
  const wrapper = document.createElement('div');
  wrapper.className = 'json-array';

  const header = document.createElement('span');
  const toggle = createToggle();
  const open = document.createElement('span');
  open.textContent = '[';

  const hint = document.createElement('span');
  hint.className = 'json-hint';
  hint.textContent = ' ... ' + arr.length + (arr.length === 1 ? ' item' : ' items') + ' ]';
  hint.style.display = 'none';

  header.appendChild(toggle);
  header.appendChild(open);
  header.appendChild(hint);
  wrapper.appendChild(header);

  const children = document.createElement('div');
  children.className = 'json-children';
  children.style.marginLeft = '20px';

  for (const item of arr) {
    const line = document.createElement('div');
    line.appendChild(renderNode(item));
    children.appendChild(line);
  }

  wrapper.appendChild(children);

  const closing = document.createElement('div');
  closing.textContent = ']';
  wrapper.appendChild(closing);

  toggle.addEventListener('click', () => {
    const collapsed = children.classList.toggle('collapsed');
    toggle.textContent = collapsed ? '\u25B6' : '\u25BC';
    hint.style.display = collapsed ? '' : 'none';
    closing.style.display = collapsed ? 'none' : '';
  });

  return wrapper;
}

function renderNode(value) {
  if (value === null) return renderNull();
  if (typeof value === 'boolean') return renderBool(value);
  if (typeof value === 'number') return renderNumber(value);
  if (typeof value === 'string') return renderString(value);
  if (Array.isArray(value)) return renderArray(value);
  if (typeof value === 'object') return renderObject(value);
  // Fallback
  const span = document.createElement('span');
  span.textContent = String(value);
  return span;
}

function renderTree(data) {
  const wrapper = document.createElement('div');
  wrapper.className = 'json-tree';
  wrapper.appendChild(renderNode(data));
  return wrapper;
}

// ---------------------------------------------------------------------------
// Format & Query
// ---------------------------------------------------------------------------

function formatAndQuery() {
  const raw = jsonInput.value.trim();

  if (!raw) {
    clearElement(output);
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
    clearElement(output);
    const errDiv = document.createElement('div');
    errDiv.className = 'output-error';
    errDiv.textContent = e.message;
    output.appendChild(errDiv);
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
      // Show tree of original data + error
      clearElement(output);
      output.appendChild(renderTree(data));
      const errDiv = document.createElement('div');
      errDiv.className = 'output-error';
      errDiv.textContent = e instanceof JqError ? e.message : String(e);
      output.appendChild(errDiv);

      // Status
      const byteCount = new TextEncoder().encode(raw).length;
      const keyCount = (typeof data === 'object' && data !== null && !Array.isArray(data))
        ? Object.keys(data).length
        : null;
      statusLeft.textContent = buildLeftStatus(data, byteCount, keyCount);
      statusRight.textContent = '\u2717 jq error'; // ✗
      lastResult = null;
      return;
    }
  }

  lastResult = results;

  // Render results
  clearElement(output);
  if (results.length === 1) {
    output.appendChild(renderTree(results[0]));
  } else {
    results.forEach((result, i) => {
      output.appendChild(renderTree(result));
      if (i < results.length - 1) {
        const hr = document.createElement('hr');
        hr.style.border = 'none';
        hr.style.borderTop = '1px dashed currentColor';
        hr.style.margin = '8px 0';
        output.appendChild(hr);
      }
    });
  }

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
  if (!lastResult) return;

  const text = lastResult.length === 1
    ? JSON.stringify(lastResult[0], null, 2)
    : lastResult.map(r => JSON.stringify(r, null, 2)).join('\n');

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

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

initTheme();
