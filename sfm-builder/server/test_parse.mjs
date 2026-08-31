import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- minimal DOM stubs ----
const elements = {};
function makeEl() {
  const el = {
    _value: '',
    _text: '',
    _html: '',
    classList: { _set: new Set(), add: function (c) { this._set.add(c); }, remove: function (c) { this._set.delete(c); }, contains: function (c) { return this._set.has(c); } },
    style: {},
    dataset: {},
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    addEventListener: () => {},
    appendChild: () => {},
    focus: () => {},
    remove: () => {},
    select: () => {},
    set value(v) { this._value = v; },
    get value() { return this._value; },
    set textContent(v) { this._text = String(v); },
    get textContent() { return this._text; },
    set innerHTML(v) { this._html = String(v); },
    get innerHTML() { return this._html; },
  };
  return el;
}
const globalDocument = {
  querySelector(sel) { if (!elements[sel]) elements[sel] = makeEl(); return elements[sel]; },
  createElement() { return makeEl(); },
  addEventListener() {},
  body: makeEl(),
};
global.document = globalDocument;
global.window = { ATM10_ITEMS: null };
global.localStorage = {
  _data: {},
  getItem(k) { return this._data[k] || null; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; },
};
global.confirm = () => true;
Object.defineProperty(global, 'navigator', { value: { clipboard: { readText: async () => '', writeText: async () => {} } }, writable: true });
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
global.Blob = class { constructor(parts, opts) { this.parts = parts; this.opts = opts; } };

// ---- load app.js then import-parser.js ----
const appSrc = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf-8');
const parserSrc = fs.readFileSync(path.join(__dirname, 'import-parser.js'), 'utf-8');

// Concatenate and expose in one eval scope (strict-mode eval keeps decls internal)
eval(appSrc + '\n' + parserSrc + '\n;globalThis.__testParse = { parseSFMLCode, generateCode, normalizeState, render };');

// ---- run the test ----
const { parseSFMLCode, generateCode } = globalThis.__testParse;
const testCode = fs.readFileSync(path.join(__dirname, 'sample_code.sfml'), 'utf-8');

try {
  const result = parseSFMLCode(testCode);
  console.log('=== PARSE SUCCESS ===');
  console.log('Name:', result.state.name);
  console.log('Labels count:', result.state.labels.length);
  console.log('Warnings:', JSON.stringify(result.warnings, null, 2));
  console.log('Triggers:', result.state.triggers.length);
  result.state.triggers.forEach((t, i) => {
    console.log(`\nTrigger ${i}: type=${t.type} interval=${t.interval} unit=${t.unit}`);
    t.statements.forEach((s, j) => {
      if (s.kind === 'io') {
        const resources = s.resources.map(r => `${r.type}|${r.ns}|${r.name}|${r.count}|${r.retain}`).join('; ');
        console.log(`  [${j}] ${s.direction} labels=[${s.labels.join(',')}] sides=[${s.sides.join(',')}] resources=[${resources}]`);
      } else {
        console.log(`  [${j}] ${s.kind}`);
      }
    });
  });
} catch (err) {
  console.log('=== PARSE ERROR ===');
  console.log(err.message);
}
