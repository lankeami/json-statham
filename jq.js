/**
 * jq.js — A subset jq evaluator with zero DOM dependencies.
 *
 * Public API:
 *   jqEval(data, expression) → Array of results
 *   JqError — thrown on evaluation errors
 */

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class JqError extends Error {
  constructor(message) {
    super(message);
    this.name = 'JqError';
  }
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

const TT = {
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
  EOF: 'EOF',
};

function tokenize(src) {
  const tokens = [];
  let i = 0;

  while (i < src.length) {
    // Skip whitespace
    if (/\s/.test(src[i])) { i++; continue; }

    // String literals
    if (src[i] === '"') {
      let j = i + 1;
      let str = '';
      while (j < src.length && src[j] !== '"') {
        if (src[j] === '\\') {
          j++;
          switch (src[j]) {
            case 'n': str += '\n'; break;
            case 't': str += '\t'; break;
            case 'r': str += '\r'; break;
            case '"': str += '"'; break;
            case '\\': str += '\\'; break;
            case '/': str += '/'; break;
            case 'b': str += '\b'; break;
            case 'f': str += '\f'; break;
            case 'u': {
              const hex = src.slice(j + 1, j + 5);
              str += String.fromCharCode(parseInt(hex, 16));
              j += 4;
              break;
            }
            default: str += src[j];
          }
        } else {
          str += src[j];
        }
        j++;
      }
      tokens.push({ type: TT.STRING, value: str });
      i = j + 1;
      continue;
    }

    // Two-char operators
    if (i + 1 < src.length) {
      const two = src.slice(i, i + 2);
      if (['==', '!=', '>=', '<='].includes(two)) {
        tokens.push({ type: TT.OPERATOR, value: two });
        i += 2;
        continue;
      }
    }

    // Single-char tokens
    const ch = src[i];
    if (ch === '.') { tokens.push({ type: TT.DOT, value: '.' }); i++; continue; }
    if (ch === '[') { tokens.push({ type: TT.LBRACKET, value: '[' }); i++; continue; }
    if (ch === ']') { tokens.push({ type: TT.RBRACKET, value: ']' }); i++; continue; }
    if (ch === '|') { tokens.push({ type: TT.PIPE, value: '|' }); i++; continue; }
    if (ch === '(') { tokens.push({ type: TT.LPAREN, value: '(' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: TT.RPAREN, value: ')' }); i++; continue; }
    if (ch === '?') { tokens.push({ type: TT.QUESTION, value: '?' }); i++; continue; }
    if (ch === ',') { tokens.push({ type: TT.COMMA, value: ',' }); i++; continue; }
    if (ch === '>') { tokens.push({ type: TT.OPERATOR, value: '>' }); i++; continue; }
    if (ch === '<') { tokens.push({ type: TT.OPERATOR, value: '<' }); i++; continue; }

    // Numbers (including negative)
    if (ch === '-' && i + 1 < src.length && /\d/.test(src[i + 1])) {
      let j = i + 1;
      while (j < src.length && /[\d.]/.test(src[j])) j++;
      tokens.push({ type: TT.NUMBER, value: parseFloat(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (/\d/.test(ch)) {
      let j = i;
      while (j < src.length && /[\d.]/.test(src[j])) j++;
      tokens.push({ type: TT.NUMBER, value: parseFloat(src.slice(i, j)) });
      i = j;
      continue;
    }

    // Identifiers, keywords, booleans, null
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
      const word = src.slice(i, j);
      if (word === 'true') {
        tokens.push({ type: TT.BOOLEAN, value: true });
      } else if (word === 'false') {
        tokens.push({ type: TT.BOOLEAN, value: false });
      } else if (word === 'null') {
        tokens.push({ type: TT.NULL, value: null });
      } else if (word === 'and' || word === 'or') {
        tokens.push({ type: TT.OPERATOR, value: word });
      } else if (word === 'not') {
        tokens.push({ type: TT.IDENT, value: 'not' });
      } else {
        tokens.push({ type: TT.IDENT, value: word });
      }
      i = j;
      continue;
    }

    throw new JqError(`Unexpected character: ${ch}`);
  }

  tokens.push({ type: TT.EOF });
  return tokens;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Grammar (top-down, precedence climbing):
 *
 *   pipe       → compare (PIPE compare)*
 *   compare    → logical (('=='|'!='|'>'|'<'|'>='|'<=') logical)*
 *   logical    → expr (('and'|'or') expr)*
 *   expr       → term postfix*
 *   postfix    → '.' IDENT ['?']
 *              | '[' NUMBER ']' ['?']
 *              | '[' ']' ['?']
 *   term       → '.' IDENT ['?']          (field at root)
 *              | '.' '[' ... ']' ['?']     (index/iterate at root)
 *              | '.'                       (identity)
 *              | NUMBER | STRING | BOOLEAN | NULL
 *              | IDENT '(' pipe ')'        (function call with arg)
 *              | IDENT                     (function call no arg)
 *              | '(' pipe ')'
 *              | IDENT 'not'               (not)
 */

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() { return this.tokens[this.pos]; }
  advance() { return this.tokens[this.pos++]; }

  eat(type) {
    const t = this.peek();
    if (t.type !== type) throw new JqError(`Expected ${type} but got ${t.type} (${t.value})`);
    return this.advance();
  }

  // pipe → compare (PIPE compare)*
  parsePipe() {
    let left = this.parseCompare();
    while (this.peek().type === TT.PIPE) {
      this.advance();
      const right = this.parseCompare();
      left = { type: 'pipe', left, right };
    }
    return left;
  }

  // compare → logical (op logical)*
  parseCompare() {
    let left = this.parseLogical();
    while (
      this.peek().type === TT.OPERATOR &&
      ['==', '!=', '>', '<', '>=', '<='].includes(this.peek().value)
    ) {
      const op = this.advance().value;
      const right = this.parseLogical();
      left = { type: 'compare', op, left, right };
    }
    return left;
  }

  // logical → expr (('and'|'or') expr)*
  parseLogical() {
    let left = this.parseExpr();
    while (
      this.peek().type === TT.OPERATOR &&
      (this.peek().value === 'and' || this.peek().value === 'or')
    ) {
      const op = this.advance().value;
      const right = this.parseExpr();
      left = { type: 'logical', op, left, right };
    }
    return left;
  }

  // expr → term postfix*
  parseExpr() {
    let node = this.parseTerm();
    // Apply postfix chains
    while (true) {
      const t = this.peek();
      // .field postfix
      if (t.type === TT.DOT) {
        const next = this.tokens[this.pos + 1];
        if (next && next.type === TT.IDENT) {
          this.advance(); // consume DOT
          const name = this.advance().value;
          const optional = this.peek().type === TT.QUESTION ? (this.advance(), true) : false;
          node = { type: 'field', name, optional, input: node };
          continue;
        }
        // .[...] postfix
        if (next && next.type === TT.LBRACKET) {
          this.advance(); // consume DOT
          this.advance(); // consume [
          if (this.peek().type === TT.RBRACKET) {
            this.advance();
            const optional = this.peek().type === TT.QUESTION ? (this.advance(), true) : false;
            node = { type: 'iterate', optional, input: node };
          } else {
            const idx = this.eat(TT.NUMBER).value;
            this.eat(TT.RBRACKET);
            const optional = this.peek().type === TT.QUESTION ? (this.advance(), true) : false;
            node = { type: 'index', index: idx, optional, input: node };
          }
          continue;
        }
        break;
      }
      // [index] or [] postfix (without dot)
      if (t.type === TT.LBRACKET) {
        this.advance();
        if (this.peek().type === TT.RBRACKET) {
          this.advance();
          const optional = this.peek().type === TT.QUESTION ? (this.advance(), true) : false;
          node = { type: 'iterate', optional, input: node };
        } else {
          const idx = this.eat(TT.NUMBER).value;
          this.eat(TT.RBRACKET);
          const optional = this.peek().type === TT.QUESTION ? (this.advance(), true) : false;
          node = { type: 'index', index: idx, optional, input: node };
        }
        continue;
      }
      break;
    }
    return node;
  }

  // term → base expression without postfix
  parseTerm() {
    const t = this.peek();

    // Parenthesised expression
    if (t.type === TT.LPAREN) {
      this.advance();
      const inner = this.parsePipe();
      this.eat(TT.RPAREN);
      return inner;
    }

    // Dot-started expressions
    if (t.type === TT.DOT) {
      const next = this.tokens[this.pos + 1];

      // .foo — field access from identity
      if (next && next.type === TT.IDENT) {
        this.advance(); // consume DOT
        const name = this.advance().value;
        const optional = this.peek().type === TT.QUESTION ? (this.advance(), true) : false;
        return { type: 'field', name, optional, input: { type: 'identity' } };
      }

      // .[] or .[N] — iterate/index from identity
      if (next && next.type === TT.LBRACKET) {
        this.advance(); // consume DOT
        this.advance(); // consume [
        if (this.peek().type === TT.RBRACKET) {
          this.advance();
          const optional = this.peek().type === TT.QUESTION ? (this.advance(), true) : false;
          return { type: 'iterate', optional, input: { type: 'identity' } };
        }
        const idx = this.eat(TT.NUMBER).value;
        this.eat(TT.RBRACKET);
        const optional = this.peek().type === TT.QUESTION ? (this.advance(), true) : false;
        return { type: 'index', index: idx, optional, input: { type: 'identity' } };
      }

      // plain dot — identity
      this.advance();
      return { type: 'identity' };
    }

    // Literals
    if (t.type === TT.NUMBER) { this.advance(); return { type: 'literal', value: t.value }; }
    if (t.type === TT.STRING) { this.advance(); return { type: 'literal', value: t.value }; }
    if (t.type === TT.BOOLEAN) { this.advance(); return { type: 'literal', value: t.value }; }
    if (t.type === TT.NULL) { this.advance(); return { type: 'literal', value: null }; }

    // Named functions / keywords
    if (t.type === TT.IDENT) {
      const name = t.value;
      this.advance();
      // not (prefix, no parens)
      if (name === 'not') {
        return { type: 'not' };
      }
      // function with argument: name(expr)
      if (this.peek().type === TT.LPAREN) {
        this.advance(); // consume (
        const arg = this.parsePipe();
        this.eat(TT.RPAREN);
        return { type: 'func', name, arg };
      }
      // function without argument
      return { type: 'func', name, arg: null };
    }

    throw new JqError(`Unexpected token: ${t.type} (${t.value})`);
  }
}

function parse(expression) {
  const tokens = tokenize(expression);
  const parser = new Parser(tokens);
  const ast = parser.parsePipe();
  if (parser.peek().type !== TT.EOF) {
    throw new JqError(`Unexpected token at end: ${parser.peek().type} (${parser.peek().value})`);
  }
  return ast;
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluate an AST node against a single input value.
 * Returns an array of output values (jq is multi-valued).
 */
function evalNode(node, input) {
  switch (node.type) {
    case 'identity':
      return [input];

    case 'literal':
      return [node.value];

    case 'field': {
      // Evaluate from the provided input (may have been set to a non-identity node)
      const sources = node.input ? evalNode(node.input, input) : [input];
      const results = [];
      for (const src of sources) {
        if (src === null) {
          if (node.optional) continue;
          throw new JqError(`null (null) has no field "${node.name}"`);
        }
        if (typeof src !== 'object' || Array.isArray(src)) {
          if (node.optional) continue;
          throw new JqError(`${JSON.stringify(src)} (${typeof src}) has no field "${node.name}"`);
        }
        const val = Object.prototype.hasOwnProperty.call(src, node.name) ? src[node.name] : null;
        results.push(val);
      }
      return results;
    }

    case 'index': {
      const sources = node.input ? evalNode(node.input, input) : [input];
      const results = [];
      for (const src of sources) {
        if (!Array.isArray(src)) {
          if (node.optional) continue;
          throw new JqError(`Cannot index ${typeof src} with number`);
        }
        let idx = node.index;
        if (idx < 0) idx = src.length + idx;
        results.push(idx >= 0 && idx < src.length ? src[idx] : null);
      }
      return results;
    }

    case 'iterate': {
      const sources = node.input ? evalNode(node.input, input) : [input];
      const results = [];
      for (const src of sources) {
        if (Array.isArray(src)) {
          results.push(...src);
        } else if (src !== null && typeof src === 'object') {
          results.push(...Object.values(src));
        } else {
          if (node.optional) continue;
          throw new JqError(`Cannot iterate over ${typeof src}`);
        }
      }
      return results;
    }

    case 'pipe': {
      const lefts = evalNode(node.left, input);
      const results = [];
      for (const l of lefts) {
        results.push(...evalNode(node.right, l));
      }
      return results;
    }

    case 'compare': {
      const lefts = evalNode(node.left, input);
      const rights = evalNode(node.right, input);
      const results = [];
      for (const l of lefts) {
        for (const r of rights) {
          results.push(compareValues(node.op, l, r));
        }
      }
      return results;
    }

    case 'logical': {
      const lefts = evalNode(node.left, input);
      const rights = evalNode(node.right, input);
      const results = [];
      for (const l of lefts) {
        for (const r of rights) {
          if (node.op === 'and') results.push(Boolean(l) && Boolean(r));
          else results.push(Boolean(l) || Boolean(r));
        }
      }
      return results;
    }

    case 'not':
      return [!input];

    case 'func':
      return evalFunc(node.name, node.arg, input);

    default:
      throw new JqError(`Unknown AST node type: ${node.type}`);
  }
}

function compareValues(op, a, b) {
  switch (op) {
    case '==': return JSON.stringify(a) === JSON.stringify(b);
    case '!=': return JSON.stringify(a) !== JSON.stringify(b);
    case '>':  return a > b;
    case '<':  return a < b;
    case '>=': return a >= b;
    case '<=': return a <= b;
    default: throw new JqError(`Unknown operator: ${op}`);
  }
}

const BUILTIN_FUNCS = new Set([
  'keys', 'length', 'select', 'map', 'type', 'values', 'has',
  'to_number', 'to_string', 'flatten', 'sort', 'reverse', 'unique',
  'min', 'max', 'add', 'first', 'last', 'not',
]);

function evalFunc(name, argNode, input) {
  switch (name) {
    case 'keys': {
      if (input === null || typeof input !== 'object') throw new JqError(`keys: input must be object or array`);
      return Array.isArray(input)
        ? [Array.from({ length: input.length }, (_, i) => i)]
        : [Object.keys(input).sort()];
    }

    case 'values': {
      if (input === null || typeof input !== 'object') throw new JqError(`values: input must be object or array`);
      return Array.isArray(input) ? [[...input]] : [Object.values(input)];
    }

    case 'length': {
      if (input === null) return [0];
      if (typeof input === 'string') return [input.length];
      if (Array.isArray(input)) return [input.length];
      if (typeof input === 'object') return [Object.keys(input).length];
      if (typeof input === 'number') return [Math.abs(input)];
      throw new JqError(`length: unsupported type ${typeof input}`);
    }

    case 'type': {
      if (input === null) return ['null'];
      if (Array.isArray(input)) return ['array'];
      return [typeof input];
    }

    case 'select': {
      if (!argNode) throw new JqError('select requires an argument');
      const results = evalNode(argNode, input);
      // select passes input through if the predicate is truthy
      if (results.some(r => r)) return [input];
      return [];
    }

    case 'map': {
      if (!argNode) throw new JqError('map requires an argument');
      if (!Array.isArray(input)) throw new JqError(`map: input must be array`);
      const out = [];
      for (const item of input) {
        out.push(...evalNode(argNode, item));
      }
      return [out];
    }

    case 'has': {
      if (!argNode) throw new JqError('has requires an argument');
      const [key] = evalNode(argNode, input);
      if (Array.isArray(input)) return [typeof key === 'number' && key >= 0 && key < input.length];
      if (typeof input === 'object' && input !== null) return [Object.prototype.hasOwnProperty.call(input, key)];
      throw new JqError(`has: input must be object or array`);
    }

    case 'to_number': {
      if (typeof input === 'number') return [input];
      const n = Number(input);
      if (isNaN(n)) throw new JqError(`to_number: cannot convert ${JSON.stringify(input)} to number`);
      return [n];
    }

    case 'to_string': {
      if (typeof input === 'string') return [input];
      return [JSON.stringify(input)];
    }

    case 'flatten': {
      if (!Array.isArray(input)) throw new JqError(`flatten: input must be array`);
      return [input.flat(Infinity)];
    }

    case 'sort': {
      if (!Array.isArray(input)) throw new JqError(`sort: input must be array`);
      return [[...input].sort((a, b) => {
        if (typeof a === typeof b) {
          if (typeof a === 'string') return a.localeCompare(b);
          if (typeof a === 'number') return a - b;
        }
        return JSON.stringify(a) < JSON.stringify(b) ? -1 : 1;
      })];
    }

    case 'reverse': {
      if (!Array.isArray(input)) throw new JqError(`reverse: input must be array`);
      return [[...input].reverse()];
    }

    case 'unique': {
      if (!Array.isArray(input)) throw new JqError(`unique: input must be array`);
      const seen = new Set();
      const out = [];
      for (const item of input) {
        const key = JSON.stringify(item);
        if (!seen.has(key)) { seen.add(key); out.push(item); }
      }
      return [out];
    }

    case 'min': {
      if (!Array.isArray(input) || input.length === 0) throw new JqError(`min: input must be non-empty array`);
      return [input.reduce((a, b) => (a < b ? a : b))];
    }

    case 'max': {
      if (!Array.isArray(input) || input.length === 0) throw new JqError(`max: input must be non-empty array`);
      return [input.reduce((a, b) => (a > b ? a : b))];
    }

    case 'add': {
      if (!Array.isArray(input)) throw new JqError(`add: input must be array`);
      if (input.length === 0) return [null];
      return [input.reduce((a, b) => {
        if (typeof a === 'number' && typeof b === 'number') return a + b;
        if (typeof a === 'string' && typeof b === 'string') return a + b;
        if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
        if (typeof a === 'object' && typeof b === 'object') return { ...a, ...b };
        throw new JqError(`add: cannot add ${typeof a} and ${typeof b}`);
      })];
    }

    case 'first': {
      if (!Array.isArray(input)) throw new JqError(`first: input must be array`);
      return input.length > 0 ? [input[0]] : [null];
    }

    case 'last': {
      if (!Array.isArray(input)) throw new JqError(`last: input must be array`);
      return input.length > 0 ? [input[input.length - 1]] : [null];
    }

    case 'not':
      return [!input];

    default:
      throw new JqError(`Unknown function: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate a jq expression against data.
 *
 * @param {*} data       - Parsed JSON data (any value)
 * @param {string} expression - jq expression string
 * @returns {Array}      - Array of result values
 */
export function jqEval(data, expression) {
  const expr = (expression || '').trim();
  if (expr === '' || expr === '.') return [data];
  const ast = parse(expr);
  return evalNode(ast, data);
}
