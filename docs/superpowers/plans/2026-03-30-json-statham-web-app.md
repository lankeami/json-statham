# JSON Statham Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Chrome extension with a standalone, zero-dependency web app that parses, pretty-prints, and queries JSON with jq-like syntax, deployed to GitHub Pages.

**Architecture:** Single-page app with 4 files — `index.html` (structure), `style.css` (theming), `jq.js` (standalone evaluator), `app.js` (UI wiring). The jq module has a clean `jqEval(data, expr)` interface so it can be swapped for a WASM-based full jq later.

**Tech Stack:** Vanilla JS (ES6 modules), CSS custom properties, no dependencies, no build step.

**Spec:** `docs/superpowers/specs/2026-03-30-json-statham-web-app-design.md`

---

## File Map

| File | Responsibility | Action |
|------|---------------|--------|
| `jq.js` | jq expression tokenizer, parser, evaluator. Exports `jqEval(data, expr)`. No DOM, no UI. | Create |
| `style.css` | All CSS: layout, dark/light themes via `[data-theme]` selectors, JSON syntax colors, responsive panels. | Create |
| `index.html` | Page structure: top bar (logo, jq input, copy, theme toggle), split panels, status bar. Loads `style.css`, `app.js`, `jq.js`. | Create |
| `app.js` | UI logic: parse input, render collapsible tree, wire buttons/events, theme toggle, copy to clipboard. Imports `jqEval` from `jq.js`. | Create |
| `manifest.json` | Chrome extension manifest (no longer needed). | Delete |
| `background.js` | Chrome extension service worker (no longer needed). | Delete |
| `popup.html` | Chrome extension popup (no longer needed). | Delete |
| `popup.js` | Chrome extension popup logic (no longer needed). | Delete |

---

### Task 1: Delete Old Chrome Extension Files

**Files:**
- Delete: `manifest.json`
- Delete: `background.js`
- Delete: `popup.html`
- Delete: `popup.js`

- [ ] **Step 1: Remove old files**

```bash
cd /Users/jaychinthrajah/workspaces/_personal_/extensions/json-statham
rm manifest.json background.js popup.html popup.js
```

- [ ] **Step 2: Verify removal**

```bash
ls /Users/jaychinthrajah/workspaces/_personal_/extensions/json-statham/
```

Expected: Only `README.md`, `docs/`, and any dotfiles remain.

- [ ] **Step 3: Commit**

```bash
git add -u
git commit -m "chore: remove Chrome extension files — replacing with web app"
```

---

### Task 2: Create the jq Evaluator (`jq.js`)

This is the standalone jq engine with zero DOM dependencies. It tokenizes and evaluates jq expressions against parsed JSON data.

**Files:**
- Create: `jq.js`

- [ ] **Step 1: Create `jq.js` with the full evaluator**

```js
// jq.js — Standalone jq subset evaluator
// Interface: jqEval(data, expression) → result (array of values) | throws JqError

export class JqError extends Error {
  constructor(message) {
    super(message);
    this.name = 'JqError';
  }
}

// --- Tokenizer ---

const TokenType = {
  DOT: 'DOT',
  IDENT: 'IDENT',
  LBRACKET: 'LBRACKET',
  RBRACKET: 'RBRACKET',
  NUMBER: 'NUMBER',
  PIPE: 'PIPE',
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  STRING: 'STRING',
  OPERATOR: 'OPERATOR',
  QUESTION: 'QUESTION',
  COMMA: 'COMMA',
  BOOLEAN: 'BOOLEAN',
  NULL: 'NULL',
};

function tokenize(expr) {
  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '.') { tokens.push({ type: TokenType.DOT, value: '.' }); i++; continue; }
    if (ch === '[') { tokens.push({ type: TokenType.LBRACKET, value: '[' }); i++; continue; }
    if (ch === ']') { tokens.push({ type: TokenType.RBRACKET, value: ']' }); i++; continue; }
    if (ch === '(') { tokens.push({ type: TokenType.LPAREN, value: '(' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: TokenType.RPAREN, value: ')' }); i++; continue; }
    if (ch === '|') { tokens.push({ type: TokenType.PIPE, value: '|' }); i++; continue; }
    if (ch === '?') { tokens.push({ type: TokenType.QUESTION, value: '?' }); i++; continue; }
    if (ch === ',') { tokens.push({ type: TokenType.COMMA, value: ',' }); i++; continue; }
    if (ch === '"') {
      let str = '';
      i++; // skip opening quote
      while (i < expr.length && expr[i] !== '"') {
        if (expr[i] === '\\' && i + 1 < expr.length) { str += expr[i + 1]; i += 2; }
        else { str += expr[i]; i++; }
      }
      if (i >= expr.length) throw new JqError('Unterminated string in expression');
      i++; // skip closing quote
      tokens.push({ type: TokenType.STRING, value: str });
      continue;
    }
    // Two-char operators: ==, !=, >=, <=
    if ((ch === '=' || ch === '!' || ch === '>' || ch === '<') && i + 1 < expr.length && expr[i + 1] === '=') {
      tokens.push({ type: TokenType.OPERATOR, value: expr.slice(i, i + 2) });
      i += 2;
      continue;
    }
    if (ch === '>' || ch === '<') {
      tokens.push({ type: TokenType.OPERATOR, value: ch });
      i++;
      continue;
    }
    // Negative numbers: minus followed by digit, and previous token is an operator/bracket/pipe/start
    if (ch === '-' && i + 1 < expr.length && /\d/.test(expr[i + 1])) {
      const prev = tokens[tokens.length - 1];
      if (!prev || prev.type === TokenType.LBRACKET || prev.type === TokenType.OPERATOR ||
          prev.type === TokenType.PIPE || prev.type === TokenType.LPAREN || prev.type === TokenType.COMMA) {
        let num = '-';
        i++;
        while (i < expr.length && /[\d.]/.test(expr[i])) { num += expr[i]; i++; }
        tokens.push({ type: TokenType.NUMBER, value: Number(num) });
        continue;
      }
    }
    if (/\d/.test(ch)) {
      let num = '';
      while (i < expr.length && /[\d.]/.test(expr[i])) { num += expr[i]; i++; }
      tokens.push({ type: TokenType.NUMBER, value: Number(num) });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < expr.length && /[a-zA-Z_0-9]/.test(expr[i])) { ident += expr[i]; i++; }
      if (ident === 'true' || ident === 'false') {
        tokens.push({ type: TokenType.BOOLEAN, value: ident === 'true' });
      } else if (ident === 'null') {
        tokens.push({ type: TokenType.NULL, value: null });
      } else if (ident === 'and' || ident === 'or' || ident === 'not') {
        tokens.push({ type: TokenType.OPERATOR, value: ident });
      } else {
        tokens.push({ type: TokenType.IDENT, value: ident });
      }
      continue;
    }
    throw new JqError(`Unexpected character '${ch}' at position ${i}`);
  }
  return tokens;
}

// --- Parser ---
// Produces an AST from tokens.

function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos] || null;
  const advance = () => tokens[pos++];
  const expect = (type) => {
    const t = advance();
    if (!t || t.type !== type) throw new JqError(`Expected ${type}, got ${t ? t.type : 'end of expression'}`);
    return t;
  };

  function parsePipe() {
    let left = parseComparison();
    while (peek() && peek().type === TokenType.PIPE) {
      advance(); // consume |
      const right = parseComparison();
      left = { type: 'pipe', left, right };
    }
    return left;
  }

  function parseComparison() {
    let left = parseExpr();
    while (peek() && peek().type === TokenType.OPERATOR) {
      const op = advance().value;
      if (op === 'not') {
        left = { type: 'not', operand: left };
        continue;
      }
      if (op === 'and' || op === 'or') {
        const right = parseExpr();
        left = { type: 'logical', op, left, right };
        continue;
      }
      const right = parseExpr();
      left = { type: 'compare', op, left, right };
    }
    return left;
  }

  function parseExpr() {
    let node = parseTerm();
    // Postfix: .field, [index], [], ?
    while (peek()) {
      const t = peek();
      if (t.type === TokenType.DOT && pos + 1 < tokens.length && tokens[pos + 1].type === TokenType.IDENT) {
        advance(); // consume .
        const ident = advance().value;
        const optional = peek() && peek().type === TokenType.QUESTION ? (advance(), true) : false;
        node = { type: 'field', object: node, field: ident, optional };
      } else if (t.type === TokenType.LBRACKET) {
        advance(); // consume [
        if (peek() && peek().type === TokenType.RBRACKET) {
          advance(); // consume ]
          const optional = peek() && peek().type === TokenType.QUESTION ? (advance(), true) : false;
          node = { type: 'iterate', object: node, optional };
        } else {
          const index = parsePipe();
          expect(TokenType.RBRACKET);
          const optional = peek() && peek().type === TokenType.QUESTION ? (advance(), true) : false;
          node = { type: 'index', object: node, index, optional };
        }
      } else {
        break;
      }
    }
    return node;
  }

  function parseTerm() {
    const t = peek();
    if (!t) throw new JqError('Unexpected end of expression');

    // Identity: bare dot
    if (t.type === TokenType.DOT) {
      advance();
      const next = peek();
      // .field
      if (next && next.type === TokenType.IDENT) {
        const ident = advance().value;
        const optional = peek() && peek().type === TokenType.QUESTION ? (advance(), true) : false;
        return { type: 'field', object: { type: 'identity' }, field: ident, optional };
      }
      // .[index] or .[]
      if (next && next.type === TokenType.LBRACKET) {
        advance(); // consume [
        if (peek() && peek().type === TokenType.RBRACKET) {
          advance(); // consume ]
          const optional = peek() && peek().type === TokenType.QUESTION ? (advance(), true) : false;
          return { type: 'iterate', object: { type: 'identity' }, optional };
        }
        const index = parsePipe();
        expect(TokenType.RBRACKET);
        const optional = peek() && peek().type === TokenType.QUESTION ? (advance(), true) : false;
        return { type: 'index', object: { type: 'identity' }, index, optional };
      }
      return { type: 'identity' };
    }

    // Built-in functions
    if (t.type === TokenType.IDENT) {
      const name = t.value;
      if (['keys', 'length', 'select', 'map', 'type', 'values', 'has',
           'to_number', 'to_string', 'flatten', 'sort', 'reverse',
           'unique', 'min', 'max', 'add', 'any', 'all', 'empty',
           'first', 'last', 'nth', 'range', 'not'].includes(name)) {
        advance();
        if (peek() && peek().type === TokenType.LPAREN) {
          advance(); // consume (
          const arg = parsePipe();
          expect(TokenType.RPAREN);
          return { type: 'func', name, arg };
        }
        return { type: 'func', name, arg: null };
      }
    }

    // Literals
    if (t.type === TokenType.NUMBER) { advance(); return { type: 'literal', value: t.value }; }
    if (t.type === TokenType.STRING) { advance(); return { type: 'literal', value: t.value }; }
    if (t.type === TokenType.BOOLEAN) { advance(); return { type: 'literal', value: t.value }; }
    if (t.type === TokenType.NULL) { advance(); return { type: 'literal', value: null }; }

    // Parenthesized expression
    if (t.type === TokenType.LPAREN) {
      advance();
      const inner = parsePipe();
      expect(TokenType.RPAREN);
      return inner;
    }

    throw new JqError(`Unexpected token: ${t.value}`);
  }

  const ast = parsePipe();
  if (pos < tokens.length) {
    throw new JqError(`Unexpected token '${tokens[pos].value}' at position ${pos}`);
  }
  return ast;
}

// --- Evaluator ---

function evaluate(node, inputs) {
  if (!Array.isArray(inputs)) inputs = [inputs];
  const results = [];

  for (const input of inputs) {
    switch (node.type) {
      case 'identity':
        results.push(input);
        break;

      case 'literal':
        results.push(node.value);
        break;

      case 'field': {
        const objects = evaluate(node.object, [input]);
        for (const obj of objects) {
          if (obj === null || obj === undefined) {
            if (node.optional) continue;
            throw new JqError(`Cannot index null with "${node.field}"`);
          }
          if (typeof obj !== 'object' || Array.isArray(obj)) {
            if (node.optional) continue;
            throw new JqError(`Cannot index ${Array.isArray(obj) ? 'array' : typeof obj} with "${node.field}"`);
          }
          const val = obj[node.field];
          results.push(val === undefined ? null : val);
        }
        break;
      }

      case 'index': {
        const objects = evaluate(node.object, [input]);
        const indices = evaluate(node.index, [input]);
        for (const obj of objects) {
          for (const idx of indices) {
            if (Array.isArray(obj)) {
              const i = idx < 0 ? obj.length + idx : idx;
              results.push((i < 0 || i >= obj.length) ? null : obj[i]);
            } else if (typeof obj === 'object' && obj !== null) {
              const val = obj[String(idx)];
              results.push(val === undefined ? null : val);
            } else {
              if (node.optional) continue;
              throw new JqError(`Cannot index ${typeof obj} with ${typeof idx}`);
            }
          }
        }
        break;
      }

      case 'iterate': {
        const objects = evaluate(node.object, [input]);
        for (const obj of objects) {
          if (Array.isArray(obj)) {
            results.push(...obj);
          } else if (typeof obj === 'object' && obj !== null) {
            results.push(...Object.values(obj));
          } else {
            if (node.optional) continue;
            throw new JqError(`Cannot iterate over ${typeof obj}`);
          }
        }
        break;
      }

      case 'pipe': {
        const leftResults = evaluate(node.left, [input]);
        for (const val of leftResults) {
          results.push(...evaluate(node.right, [val]));
        }
        break;
      }

      case 'compare': {
        const leftVals = evaluate(node.left, [input]);
        const rightVals = evaluate(node.right, [input]);
        for (const l of leftVals) {
          for (const r of rightVals) {
            switch (node.op) {
              case '==': results.push(JSON.stringify(l) === JSON.stringify(r)); break;
              case '!=': results.push(JSON.stringify(l) !== JSON.stringify(r)); break;
              case '>': results.push(l > r); break;
              case '<': results.push(l < r); break;
              case '>=': results.push(l >= r); break;
              case '<=': results.push(l <= r); break;
            }
          }
        }
        break;
      }

      case 'logical': {
        const leftVals = evaluate(node.left, [input]);
        const rightVals = evaluate(node.right, [input]);
        for (const l of leftVals) {
          for (const r of rightVals) {
            if (node.op === 'and') results.push(l && r);
            else results.push(l || r);
          }
        }
        break;
      }

      case 'not': {
        const vals = evaluate(node.operand, [input]);
        for (const v of vals) {
          results.push(!v);
        }
        break;
      }

      case 'func': {
        const name = node.name;
        switch (name) {
          case 'keys':
            if (typeof input !== 'object' || input === null) throw new JqError(`keys requires an object or array, got ${typeof input}`);
            if (Array.isArray(input)) results.push(input.map((_, i) => i));
            else results.push(Object.keys(input).sort());
            break;
          case 'values':
            if (typeof input !== 'object' || input === null) throw new JqError(`values requires an object or array, got ${typeof input}`);
            if (Array.isArray(input)) results.push([...input]);
            else results.push(Object.values(input));
            break;
          case 'length':
            if (input === null) results.push(0);
            else if (typeof input === 'string' || Array.isArray(input)) results.push(input.length);
            else if (typeof input === 'object') results.push(Object.keys(input).length);
            else results.push(0);
            break;
          case 'type':
            if (input === null) results.push('null');
            else if (Array.isArray(input)) results.push('array');
            else results.push(typeof input);
            break;
          case 'select': {
            if (!node.arg) throw new JqError('select requires an argument');
            const cond = evaluate(node.arg, [input]);
            for (const c of cond) {
              if (c) results.push(input);
            }
            break;
          }
          case 'map': {
            if (!node.arg) throw new JqError('map requires an argument');
            if (!Array.isArray(input)) throw new JqError(`map requires an array, got ${typeof input}`);
            const mapped = [];
            for (const item of input) {
              mapped.push(...evaluate(node.arg, [item]));
            }
            results.push(mapped);
            break;
          }
          case 'has': {
            if (!node.arg) throw new JqError('has requires an argument');
            const keyVals = evaluate(node.arg, [input]);
            for (const key of keyVals) {
              if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
                results.push(key in input);
              } else if (Array.isArray(input)) {
                results.push(typeof key === 'number' && key >= 0 && key < input.length);
              } else {
                results.push(false);
              }
            }
            break;
          }
          case 'sort':
            if (!Array.isArray(input)) throw new JqError('sort requires an array');
            results.push([...input].sort((a, b) => {
              if (typeof a === 'number' && typeof b === 'number') return a - b;
              return String(a).localeCompare(String(b));
            }));
            break;
          case 'reverse':
            if (!Array.isArray(input)) throw new JqError('reverse requires an array');
            results.push([...input].reverse());
            break;
          case 'unique':
            if (!Array.isArray(input)) throw new JqError('unique requires an array');
            results.push([...new Map(input.map(v => [JSON.stringify(v), v])).values()]);
            break;
          case 'flatten':
            if (!Array.isArray(input)) throw new JqError('flatten requires an array');
            results.push(input.flat(Infinity));
            break;
          case 'min':
            if (!Array.isArray(input)) throw new JqError('min requires an array');
            results.push(input.length ? Math.min(...input) : null);
            break;
          case 'max':
            if (!Array.isArray(input)) throw new JqError('max requires an array');
            results.push(input.length ? Math.max(...input) : null);
            break;
          case 'add':
            if (!Array.isArray(input)) throw new JqError('add requires an array');
            if (input.length === 0) results.push(null);
            else if (typeof input[0] === 'number') results.push(input.reduce((a, b) => a + b, 0));
            else if (typeof input[0] === 'string') results.push(input.join(''));
            else if (Array.isArray(input[0])) results.push(input.flat(1));
            else results.push(input.reduce((a, b) => ({ ...a, ...b }), {}));
            break;
          case 'to_number':
            results.push(Number(input));
            break;
          case 'to_string':
            results.push(typeof input === 'string' ? input : JSON.stringify(input));
            break;
          case 'not':
            results.push(!input);
            break;
          case 'first':
            if (Array.isArray(input) && input.length > 0) results.push(input[0]);
            else results.push(null);
            break;
          case 'last':
            if (Array.isArray(input) && input.length > 0) results.push(input[input.length - 1]);
            else results.push(null);
            break;
          default:
            throw new JqError(`Unknown function: ${name}`);
        }
        break;
      }

      default:
        throw new JqError(`Unknown AST node type: ${node.type}`);
    }
  }

  return results;
}

// --- Public API ---

export function jqEval(data, expression) {
  const trimmed = expression.trim();
  if (!trimmed || trimmed === '.') return [data];
  const tokens = tokenize(trimmed);
  const ast = parse(tokens);
  return evaluate(ast, [data]);
}
```

- [ ] **Step 2: Verify syntax**

```bash
node --check /Users/jaychinthrajah/workspaces/_personal_/extensions/json-statham/jq.js
```

Expected: No output (valid syntax).

- [ ] **Step 3: Quick smoke test in Node**

```bash
cd /Users/jaychinthrajah/workspaces/_personal_/extensions/json-statham
node -e "
  import { jqEval } from './jq.js';
  const data = {users: [{name: 'Jason', active: true}, {name: 'Bob', active: false}]};
  console.log('identity:', JSON.stringify(jqEval(data, '.')));
  console.log('field:', JSON.stringify(jqEval(data, '.users')));
  console.log('iterate:', JSON.stringify(jqEval(data, '.users[]')));
  console.log('nested:', JSON.stringify(jqEval(data, '.users[0].name')));
  console.log('select:', JSON.stringify(jqEval(data, '.users[] | select(.active == true) | .name')));
  console.log('keys:', JSON.stringify(jqEval(data, 'keys')));
  console.log('length:', JSON.stringify(jqEval(data, '.users | length')));
  console.log('map:', JSON.stringify(jqEval(data, '.users | map(.name)')));
  console.log('neg index:', JSON.stringify(jqEval(data, '.users[-1].name')));
" --input-type=module
```

Expected output:
```
identity: [{"users":[{"name":"Jason","active":true},{"name":"Bob","active":false}]}]
field: [[{"name":"Jason","active":true},{"name":"Bob","active":false}]]
iterate: [{"name":"Jason","active":true},{"name":"Bob","active":false}]
nested: ["Jason"]
select: ["Jason"]
keys: [["users"]]
length: [2]
map: [["Jason","Bob"]]
neg index: ["Bob"]
```

- [ ] **Step 4: Commit**

```bash
git add jq.js
git commit -m "feat: add jq subset evaluator module"
```

---

### Task 3: Create Styles (`style.css`)

**Files:**
- Create: `style.css`

- [ ] **Step 1: Create `style.css` with full layout and theming**

```css
/* style.css — JSON Statham */

/* === Reset & Base === */
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

:root {
  --font-mono: 'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
}

/* === Dark Theme (default) === */
[data-theme="dark"] {
  --bg: #1e1e2e;
  --surface: #313244;
  --subtle: #181825;
  --border: #45475a;
  --text: #cdd6f4;
  --muted: #6c7086;
  --accent: #cba6f7;
  --accent-hover: #b4befe;
  --json-key: #89b4fa;
  --json-string: #a6e3a1;
  --json-number: #fab387;
  --json-bool: #fab387;
  --json-null: #6c7086;
  --json-bracket: #cdd6f4;
  --jq-text: #f38ba8;
  --error: #f38ba8;
  --success: #a6e3a1;
  --input-bg: transparent;
}

/* === Light Theme === */
[data-theme="light"] {
  --bg: #eff1f5;
  --surface: #e6e9ef;
  --subtle: #dce0e8;
  --border: #ccd0da;
  --text: #4c4f69;
  --muted: #9ca0b0;
  --accent: #8839ef;
  --accent-hover: #7287fd;
  --json-key: #1e66f5;
  --json-string: #40a02b;
  --json-number: #fe640b;
  --json-bool: #fe640b;
  --json-null: #9ca0b0;
  --json-bracket: #4c4f69;
  --jq-text: #d20f39;
  --error: #d20f39;
  --success: #40a02b;
  --input-bg: transparent;
}

/* === Layout === */
html, body {
  height: 100%;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 14px;
  line-height: 1.5;
}

body {
  display: flex;
  flex-direction: column;
}

/* === Top Bar === */
.topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.logo {
  font-weight: 700;
  font-size: 15px;
  color: var(--accent);
  white-space: nowrap;
}

.separator {
  color: var(--muted);
  font-size: 12px;
}

.jq-bar {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.jq-label {
  color: var(--muted);
  font-size: 13px;
  white-space: nowrap;
}

.jq-input {
  flex: 1;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 5px 10px;
  color: var(--jq-text);
  font-family: var(--font-mono);
  font-size: 13px;
  outline: none;
}

.jq-input:focus {
  border-color: var(--accent);
}

.btn {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 5px 12px;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
}

.btn:hover {
  background: var(--border);
  color: var(--text);
}

/* === Panels === */
.panels {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

.panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.panel + .panel {
  border-left: 1px solid var(--border);
}

.panel-header {
  padding: 4px 12px;
  background: var(--subtle);
  border-bottom: 1px solid var(--border);
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 1px;
  flex-shrink: 0;
}

.panel-body {
  flex: 1;
  overflow: auto;
  padding: 12px;
  min-height: 0;
}

.panel-footer {
  padding: 8px 12px;
  background: var(--subtle);
  border-top: 1px solid var(--border);
  text-align: center;
  flex-shrink: 0;
}

/* === Input textarea === */
.input-text {
  width: 100%;
  height: 100%;
  background: var(--input-bg);
  border: none;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  resize: none;
  outline: none;
}

.input-text::placeholder {
  color: var(--muted);
}

/* === Format button === */
.format-btn {
  background: var(--accent);
  color: var(--bg);
  border: none;
  border-radius: 4px;
  padding: 6px 24px;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}

.format-btn:hover {
  background: var(--accent-hover);
}

/* === JSON Tree === */
.json-tree {
  font-size: 13px;
  line-height: 1.7;
}

.json-line {
  white-space: nowrap;
}

.json-toggle {
  display: inline-block;
  width: 16px;
  text-align: center;
  color: var(--muted);
  cursor: pointer;
  user-select: none;
}

.json-toggle:hover {
  color: var(--accent);
}

.json-key { color: var(--json-key); }
.json-string { color: var(--json-string); }
.json-number { color: var(--json-number); }
.json-bool { color: var(--json-bool); }
.json-null { color: var(--json-null); }
.json-bracket { color: var(--json-bracket); }

.json-collapsed-hint {
  color: var(--muted);
  font-style: italic;
  font-size: 12px;
}

.json-children {
  padding-left: 20px;
}

.json-children.collapsed {
  display: none;
}

/* === Status Bar === */
.statusbar {
  display: flex;
  justify-content: space-between;
  padding: 4px 12px;
  background: var(--subtle);
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--muted);
  flex-shrink: 0;
}

.status-error {
  color: var(--error);
}

.status-success {
  color: var(--success);
}

/* === Error display === */
.output-error {
  color: var(--error);
  padding: 8px 0;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-word;
}

/* === Copy feedback === */
.btn.copied {
  color: var(--success);
  border-color: var(--success);
}
```

- [ ] **Step 2: Commit**

```bash
git add style.css
git commit -m "feat: add CSS with dark/light Catppuccin themes and layout"
```

---

### Task 4: Create the HTML Shell (`index.html`)

**Files:**
- Create: `index.html`

- [ ] **Step 1: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>json-statham</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>

  <!-- Top Bar -->
  <div class="topbar">
    <span class="logo">{ } json-statham</span>
    <span class="separator">|</span>
    <div class="jq-bar">
      <span class="jq-label">jq&gt;</span>
      <input
        class="jq-input"
        id="jqInput"
        type="text"
        placeholder="Enter jq expression... (e.g. .users[] | .name)"
        spellcheck="false"
        autocomplete="off"
      >
    </div>
    <button class="btn" id="copyBtn" title="Copy output to clipboard">Copy</button>
    <button class="btn" id="themeBtn" title="Toggle theme"></button>
  </div>

  <!-- Panels -->
  <div class="panels">
    <!-- Input Panel -->
    <div class="panel">
      <div class="panel-header">Input</div>
      <div class="panel-body">
        <textarea
          class="input-text"
          id="jsonInput"
          placeholder="Paste JSON here..."
          spellcheck="false"
        ></textarea>
      </div>
      <div class="panel-footer">
        <button class="format-btn" id="formatBtn">Format &amp; Query</button>
      </div>
    </div>

    <!-- Output Panel -->
    <div class="panel">
      <div class="panel-header">Output</div>
      <div class="panel-body" id="output"></div>
    </div>
  </div>

  <!-- Status Bar -->
  <div class="statusbar">
    <span id="statusLeft">Paste JSON and click Format &amp; Query</span>
    <span id="statusRight"></span>
  </div>

  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: add HTML shell with top bar, split panels, and status bar"
```

---

### Task 5: Create the App Logic (`app.js`)

This is the UI wiring — tree rendering, event handlers, theme management, copy to clipboard.

**Files:**
- Create: `app.js`

- [ ] **Step 1: Create `app.js` with all UI logic**

Note: The output container is cleared using safe DOM methods. All user content is rendered via `document.createElement` and `textContent` — never via raw HTML string injection.

```js
// app.js — JSON Statham UI logic
import { jqEval, JqError } from './jq.js';

// --- DOM refs ---
const jsonInput = document.getElementById('jsonInput');
const jqInput = document.getElementById('jqInput');
const formatBtn = document.getElementById('formatBtn');
const copyBtn = document.getElementById('copyBtn');
const themeBtn = document.getElementById('themeBtn');
const output = document.getElementById('output');
const statusLeft = document.getElementById('statusLeft');
const statusRight = document.getElementById('statusRight');

// --- State ---
let lastParsed = null;
let lastResult = null;

// --- Theme ---

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
  const theme = document.documentElement.getAttribute('data-theme');
  themeBtn.textContent = theme === 'dark' ? '\u263E' : '\u2600';
}

// --- Tree Renderer ---

function renderTree(data) {
  const container = document.createElement('div');
  container.className = 'json-tree';
  container.appendChild(renderNode(data));
  return container;
}

function renderNode(value) {
  if (value === null) return renderNull();
  if (typeof value === 'boolean') return renderBool(value);
  if (typeof value === 'number') return renderNumber(value);
  if (typeof value === 'string') return renderString(value);
  if (Array.isArray(value)) return renderArray(value);
  if (typeof value === 'object') return renderObject(value);
  const span = document.createElement('span');
  span.textContent = String(value);
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
  if (keys.length === 0) {
    const span = document.createElement('span');
    span.className = 'json-bracket';
    span.textContent = '{}';
    return span;
  }

  const wrapper = document.createElement('div');

  const openLine = document.createElement('div');
  openLine.className = 'json-line';

  const toggle = createToggle();
  openLine.appendChild(toggle);

  const openBracket = document.createElement('span');
  openBracket.className = 'json-bracket';
  openBracket.textContent = ' {';
  openLine.appendChild(openBracket);

  const hint = document.createElement('span');
  hint.className = 'json-collapsed-hint';
  hint.textContent = ` ... ${keys.length} key${keys.length !== 1 ? 's' : ''} `;
  hint.style.display = 'none';
  openLine.appendChild(hint);

  const closeBracketInline = document.createElement('span');
  closeBracketInline.className = 'json-bracket';
  closeBracketInline.textContent = '}';
  closeBracketInline.style.display = 'none';
  openLine.appendChild(closeBracketInline);

  wrapper.appendChild(openLine);

  const children = document.createElement('div');
  children.className = 'json-children';

  keys.forEach((key, i) => {
    const line = document.createElement('div');
    line.className = 'json-line';

    const keySpan = document.createElement('span');
    keySpan.className = 'json-key';
    keySpan.textContent = JSON.stringify(key);
    line.appendChild(keySpan);

    line.appendChild(document.createTextNode(': '));
    line.appendChild(renderNode(obj[key]));

    if (i < keys.length - 1) {
      line.appendChild(document.createTextNode(','));
    }

    children.appendChild(line);
  });

  wrapper.appendChild(children);

  const closeLine = document.createElement('div');
  closeLine.className = 'json-line';
  const closeBracket = document.createElement('span');
  closeBracket.className = 'json-bracket';
  closeBracket.textContent = '}';
  closeLine.appendChild(closeBracket);
  wrapper.appendChild(closeLine);

  toggle.addEventListener('click', () => {
    const collapsed = children.classList.toggle('collapsed');
    toggle.textContent = collapsed ? '\u25B6' : '\u25BC';
    hint.style.display = collapsed ? 'inline' : 'none';
    closeBracketInline.style.display = collapsed ? 'inline' : 'none';
    closeLine.style.display = collapsed ? 'none' : '';
  });

  return wrapper;
}

function renderArray(arr) {
  if (arr.length === 0) {
    const span = document.createElement('span');
    span.className = 'json-bracket';
    span.textContent = '[]';
    return span;
  }

  const wrapper = document.createElement('div');

  const openLine = document.createElement('div');
  openLine.className = 'json-line';

  const toggle = createToggle();
  openLine.appendChild(toggle);

  const openBracket = document.createElement('span');
  openBracket.className = 'json-bracket';
  openBracket.textContent = ' [';
  openLine.appendChild(openBracket);

  const hint = document.createElement('span');
  hint.className = 'json-collapsed-hint';
  hint.textContent = ` ... ${arr.length} item${arr.length !== 1 ? 's' : ''} `;
  hint.style.display = 'none';
  openLine.appendChild(hint);

  const closeBracketInline = document.createElement('span');
  closeBracketInline.className = 'json-bracket';
  closeBracketInline.textContent = ']';
  closeBracketInline.style.display = 'none';
  openLine.appendChild(closeBracketInline);

  wrapper.appendChild(openLine);

  const children = document.createElement('div');
  children.className = 'json-children';

  arr.forEach((item, i) => {
    const line = document.createElement('div');
    line.className = 'json-line';
    line.appendChild(renderNode(item));
    if (i < arr.length - 1) {
      line.appendChild(document.createTextNode(','));
    }
    children.appendChild(line);
  });

  wrapper.appendChild(children);

  const closeLine = document.createElement('div');
  closeLine.className = 'json-line';
  const closeBracket = document.createElement('span');
  closeBracket.className = 'json-bracket';
  closeBracket.textContent = ']';
  closeLine.appendChild(closeBracket);
  wrapper.appendChild(closeLine);

  toggle.addEventListener('click', () => {
    const collapsed = children.classList.toggle('collapsed');
    toggle.textContent = collapsed ? '\u25B6' : '\u25BC';
    hint.style.display = collapsed ? 'inline' : 'none';
    closeBracketInline.style.display = collapsed ? 'inline' : 'none';
    closeLine.style.display = collapsed ? 'none' : '';
  });

  return wrapper;
}

function createToggle() {
  const span = document.createElement('span');
  span.className = 'json-toggle';
  span.textContent = '\u25BC';
  return span;
}

// --- Helpers ---

function clearElement(el) {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

// --- Format & Query ---

function formatAndQuery() {
  const raw = jsonInput.value.trim();
  if (!raw) {
    clearElement(output);
    statusLeft.textContent = 'Paste JSON and click Format & Query';
    statusLeft.className = '';
    statusRight.textContent = '';
    lastParsed = null;
    lastResult = null;
    return;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    clearElement(output);
    const err = document.createElement('div');
    err.className = 'output-error';
    err.textContent = 'Invalid JSON: ' + e.message;
    output.appendChild(err);
    statusLeft.textContent = '\u2717 Invalid JSON';
    statusLeft.className = 'status-error';
    statusRight.textContent = '';
    lastParsed = null;
    lastResult = null;
    return;
  }

  lastParsed = data;
  const byteSize = new Blob([raw]).size;
  const keyCount = typeof data === 'object' && data !== null
    ? (Array.isArray(data) ? data.length + ' items' : Object.keys(data).length + ' keys')
    : 'primitive';

  const jqExpr = jqInput.value.trim();
  let resultData;

  if (!jqExpr || jqExpr === '.') {
    resultData = [data];
    statusRight.textContent = '';
  } else {
    try {
      resultData = jqEval(data, jqExpr);
      statusRight.textContent = 'jq result: ' + resultData.length + ' item' + (resultData.length !== 1 ? 's' : '');
    } catch (e) {
      clearElement(output);
      output.appendChild(renderTree(data));
      const err = document.createElement('div');
      err.className = 'output-error';
      err.textContent = e instanceof JqError
        ? 'jq error: ' + e.message
        : 'Error: ' + e.message;
      output.appendChild(err);
      statusLeft.textContent = '\u2713 Valid JSON \u2022 ' + keyCount + ' \u2022 ' + byteSize + ' bytes';
      statusLeft.className = 'status-success';
      lastResult = null;
      return;
    }
  }

  lastResult = resultData;

  clearElement(output);
  if (resultData.length === 1) {
    output.appendChild(renderTree(resultData[0]));
  } else {
    resultData.forEach((item, i) => {
      if (i > 0) {
        const separator = document.createElement('hr');
        separator.style.border = 'none';
        separator.style.borderTop = '1px dashed var(--border)';
        separator.style.margin = '8px 0';
        output.appendChild(separator);
      }
      output.appendChild(renderTree(item));
    });
  }

  statusLeft.textContent = '\u2713 Valid JSON \u2022 ' + keyCount + ' \u2022 ' + byteSize + ' bytes';
  statusLeft.className = 'status-success';
}

// --- Copy ---

function copyOutput() {
  if (!lastResult || lastResult.length === 0) return;

  const text = lastResult.length === 1
    ? JSON.stringify(lastResult[0], null, 2)
    : lastResult.map(v => JSON.stringify(v, null, 2)).join('\n');

  navigator.clipboard.writeText(text).then(() => {
    copyBtn.textContent = 'Copied!';
    copyBtn.classList.add('copied');
    setTimeout(() => {
      copyBtn.textContent = 'Copy';
      copyBtn.classList.remove('copied');
    }, 1500);
  });
}

// --- Event Listeners ---

formatBtn.addEventListener('click', formatAndQuery);

jqInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    formatAndQuery();
  }
});

copyBtn.addEventListener('click', copyOutput);
themeBtn.addEventListener('click', toggleTheme);

// --- Init ---
initTheme();
```

- [ ] **Step 2: Verify syntax**

```bash
node --check /Users/jaychinthrajah/workspaces/_personal_/extensions/json-statham/app.js
```

Expected: No output (valid syntax).

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: add app logic — tree renderer, jq integration, theme, copy"
```

---

### Task 6: Manual Smoke Test in Browser

**Files:**
- None (testing only)

- [ ] **Step 1: Serve locally and open in Playwright**

```bash
cd /Users/jaychinthrajah/workspaces/_personal_/extensions/json-statham
python3 -m http.server 8322 &
```

Then navigate Playwright to `http://localhost:8322/`.

- [ ] **Step 2: Paste test JSON and click Format & Query**

Paste this JSON into the textarea:
```json
{"users":[{"name":"Jason Statham","active":true,"roles":["admin","user"]},{"name":"Bob","active":false,"roles":["viewer"]}],"count":2}
```

Click "Format & Query". Verify:
- Output shows collapsible syntax-highlighted tree
- Status bar shows "Valid JSON - 2 keys - X bytes"
- Toggle arrows work (click to collapse/expand)

- [ ] **Step 3: Test jq query**

Type `.users[] | select(.active == true) | .name` in the jq bar and press Enter. Verify:
- Output shows `"Jason Statham"`
- Status bar shows "jq result: 1 item"

- [ ] **Step 4: Test copy**

Click Copy. Verify clipboard contains `"Jason Statham"`.

- [ ] **Step 5: Test theme toggle**

Click the moon/sun button. Verify colors flip between dark and light. Reload — theme should persist.

- [ ] **Step 6: Test error handling**

Clear the textarea, type `{bad json}`, click Format & Query. Verify red error message.

- [ ] **Step 7: Take screenshot for visual verification**

Take a Playwright screenshot to confirm layout matches the mockup.

- [ ] **Step 8: Kill test server**

```bash
kill %1 2>/dev/null || true
```

---

### Task 7: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace README content**

```markdown
# json-statham

A lightweight JSON formatter and query tool. Paste JSON, pretty-print it with syntax highlighting, and query it with jq-like syntax.

**Live:** [https://jaychinthrajah.github.io/json-statham/](https://jaychinthrajah.github.io/json-statham/)

## Features

- Paste any JSON (minified, messy, whatever) and format it instantly
- Syntax-highlighted, collapsible tree view
- jq-like query bar (`.users[] | select(.active == true) | .name`)
- Copy formatted output to clipboard
- Dark/light theme with system preference detection
- Zero dependencies — pure vanilla JS

## jq Subset

Supports: `.field`, `.[0]`, `.[]`, `|`, `keys`, `length`, `select()`, `map()`, `.field?`, and more.

## Development

No build step. Edit files directly, open `index.html` in a browser.

\`\`\`bash
# Quick local server
python3 -m http.server 8000
# Open http://localhost:8000
\`\`\`
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README for web app"
```

---

### Task 8: Clean Up and Final Commit

**Files:**
- Delete: `.superpowers/` directory (design mockup artifacts)
- Create: `.gitignore`

- [ ] **Step 1: Clean up temp files**

```bash
rm -rf /Users/jaychinthrajah/workspaces/_personal_/extensions/json-statham/.superpowers/
```

- [ ] **Step 2: Add `.gitignore`**

```
.superpowers/
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: add .gitignore with .superpowers/"
```

- [ ] **Step 4: Verify final file structure**

```bash
ls /Users/jaychinthrajah/workspaces/_personal_/extensions/json-statham/
```

Expected:
```
app.js
docs/
index.html
jq.js
README.md
style.css
.gitignore
```
