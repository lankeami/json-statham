# json-statham

A fast, zero-dependency JSON viewer with jq queries, syntax highlighting, and collapsible trees. Runs entirely in the browser — no server, no build step.

## Features

- **Pretty-print JSON** with syntax-highlighted, collapsible/expandable tree view
- **jq query bar** — filter and transform JSON with a built-in jq subset evaluator
- **Dark / Light themes** — Catppuccin-inspired palette with system detection and manual toggle
- **Copy to clipboard** — one-click copy of formatted output
- **Status bar** — shows key count, byte size, and jq result summary
- **Zero dependencies** — vanilla JS, no npm, no bundler

## Usage

Open `index.html` in a browser (or serve via GitHub Pages). Paste JSON into the left panel, and the formatted tree appears on the right. Use the jq bar to query — e.g. `.movies[] | .title`.

### Supported jq syntax

Identity (`.`), field access (`.foo`, `.foo.bar`), array index (`.[0]`), array slice (`.[2:5]`), iteration (`.[]`), pipes (`|`), comparisons, logical operators, and 20+ built-in functions (`keys`, `values`, `length`, `map`, `select`, `sort_by`, `group_by`, `unique`, `flatten`, `to_entries`, `from_entries`, `type`, `not`, `ascii_downcase`, `ascii_upcase`, `test`, `split`, `join`, `tostring`, `tonumber`, `env`, `debug`, `null`).

## Development

Edit files directly and reload the browser. No build step required.

```
index.html   — HTML shell
app.js       — tree renderer, jq integration, theme, copy
jq.js        — standalone jq subset evaluator
style.css    — Catppuccin dark/light themes, layout
```

## Deployment

Serve from any static host. For GitHub Pages, enable Pages on the `main` branch root.
