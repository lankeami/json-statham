# JSON Statham — Web App Design Spec

**Date:** 2026-03-30
**Status:** Draft
**Replaces:** Chrome extension (manifest.json, background.js, popup.html, popup.js)

## Overview

Replace the existing Chrome extension with a standalone, zero-dependency web app deployed to GitHub Pages. The app parses, pretty-prints, and queries JSON with a jq-like syntax, featuring syntax highlighting, collapsible tree output, and dark/light theming.

## File Structure

```
json-statham/
├── index.html          # Single-page app entry point
├── style.css           # All styles (dark/light themes)
├── app.js              # UI logic: input handling, tree rendering, copy, theme toggle
├── jq.js               # jq evaluator module (standalone, swappable)
└── README.md           # Updated for web app
```

**Deleted files:** `manifest.json`, `background.js`, `popup.html`, `popup.js`

## UI Layout

### Top Bar
- **Logo:** `{ } json-statham` (purple accent)
- **jq input:** Text field with `jq>` label prefix. Pink/red text for the expression. Pressing Enter triggers Format & Query.
- **Copy button:** Copies current output (post-jq-filter) as pretty-printed JSON with indentation to clipboard.
- **Theme toggle:** Moon/sun icon. Switches between dark and light themes. Persists choice to `localStorage`. On first load, follows `prefers-color-scheme`.

### Split Panels
- **Left panel (INPUT):** Full-height textarea. Paste any JSON in any format (minified, partial indentation, etc.). Label: "INPUT" in panel header.
- **Right panel (OUTPUT):** Syntax-highlighted, collapsible JSON tree. Label: "OUTPUT" in panel header.
- **"Format & Query" button:** Centered below the input panel. Parses the input, renders the tree, and applies the jq filter (if any).

### Status Bar (bottom)
- **Left:** Validation status (checkmark + "Valid JSON" or red "Invalid JSON"), key count, byte size.
- **Right:** jq result summary (e.g., "jq result: 2 items") — only shown when a jq expression is active.

## Color Scheme (Catppuccin-inspired)

### Dark Theme (default when system prefers dark)
| Element | Color |
|---------|-------|
| Background | `#1e1e2e` |
| Surface | `#313244` |
| Subtle surface | `#181825` |
| Border | `#45475a` |
| Text | `#cdd6f4` |
| Muted text | `#6c7086` |
| Accent (purple) | `#cba6f7` |
| Keys (blue) | `#89b4fa` |
| Strings (green) | `#a6e3a1` |
| Numbers/booleans (orange) | `#fab387` |
| jq input text (red/pink) | `#f38ba8` |
| Null | `#6c7086` |

### Light Theme (default when system prefers light)
| Element | Color |
|---------|-------|
| Background | `#eff1f5` |
| Surface | `#e6e9ef` |
| Subtle surface | `#dce0e8` |
| Border | `#ccd0da` |
| Text | `#4c4f69` |
| Muted text | `#9ca0b0` |
| Accent (purple) | `#8839ef` |
| Keys (blue) | `#1e66f5` |
| Strings (green) | `#40a02b` |
| Numbers/booleans (orange) | `#fe640b` |
| jq input text (red) | `#d20f39` |
| Null | `#9ca0b0` |

## Tree Renderer

### Rendering Rules
- JSON is parsed into a recursive tree of DOM nodes.
- Each object/array node has a toggle (▼ expanded / ► collapsed).
- Clicking a toggle collapses or expands that node.
- **Collapsed summary:** Objects show `{ ... N keys }`, arrays show `[ ... N items ]`.
- Indentation: 20px per nesting level.
- Commas rendered after values (matching standard JSON formatting).

### Syntax Highlighting
Applied via CSS classes on `<span>` elements:
- `.json-key` — object keys (blue)
- `.json-string` — string values (green)
- `.json-number` — numeric values (orange)
- `.json-bool` — true/false (orange)
- `.json-null` — null (gray)
- `.json-bracket` — `{}[]` (muted)

## jq Engine (`jq.js`)

### Interface
```js
export function jqEval(data, expression) → result | throw JqError
```

Standalone module with no dependencies on the UI. Designed so the internals can be replaced with `jq-web` (WASM) later without changing the function signature.

### Core Subset (v1)

| Syntax | Example | Description |
|--------|---------|-------------|
| Identity | `.` | Returns input unchanged |
| Field access | `.foo`, `.foo.bar` | Dot notation, nested paths |
| Array index | `.[0]`, `.[-1]` | Positive and negative indexing |
| Array iteration | `.[]` | Iterate all elements |
| Pipe | `\|` | Chain expressions left to right |
| `keys` | `.foo \| keys` | Object keys as sorted array |
| `length` | `.foo \| length` | Length of array/string/object |
| `select()` | `select(.active == true)` | Filter by boolean predicate |
| `map()` | `map(.name)` | Transform each element of array |
| Optional | `.foo?` | Suppress errors on missing keys |

### Error Handling
- **Invalid JSON:** Red error message in output panel: "Invalid JSON: <parse error details>". jq does not run.
- **Invalid jq expression:** Red error in output panel: "jq error: <description>". The previously rendered tree (if any) remains visible.
- **Runtime jq error** (e.g., accessing `.foo` on an array): Red error with context about what failed.

## Interactions

| Action | Behavior |
|--------|----------|
| Click "Format & Query" | Parse input → render tree → apply jq filter (if any) |
| Press Enter in jq input | Same as clicking Format & Query |
| Click toggle (▼/►) | Collapse/expand that node |
| Click Copy | Copy current output as pretty-printed JSON to clipboard |
| Click theme toggle | Switch dark↔light, persist to `localStorage` |
| Paste into textarea | No auto-action; user must click Format & Query or press Enter in jq bar |

## Theme System

1. On page load, check `localStorage` for saved preference.
2. If no saved preference, use `prefers-color-scheme` media query.
3. Theme is applied via a `data-theme="dark"` or `data-theme="light"` attribute on `<html>`.
4. CSS uses `[data-theme="dark"]` / `[data-theme="light"]` selectors (not just media queries) so the manual toggle overrides system preference.
5. Toggle click: flip the attribute, save to `localStorage`.

## Deployment

- **Platform:** GitHub Pages
- **Branch:** `main`, root `/` directory
- **No build step, no CI** — static files served directly
- **URL:** `https://<username>.github.io/json-statham/`

## Upgrade Path (jq)

The `jqEval` function in `jq.js` is the single integration point. To upgrade to full jq:

1. Add `jq-web` WASM binary to the repo.
2. Replace `jqEval` internals to call the WASM module.
3. Same function signature — no UI changes needed.
4. Consider lazy-loading the WASM to keep initial page load fast.
