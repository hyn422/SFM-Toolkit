import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- minimal DOM stubs ----
const elements = {};
function makeEl() {
  const el = {
    _value: '', _text: '', _html: '',
    classList: { _set: new Set(), add: function (c) { this._set.add(c); }, remove: function (c) { this._set.delete(c); }, contains: function (c) { return this._set.has(c); } },
    style: {}, dataset: {}, querySelector: () => null, querySelectorAll: () => [],
    closest: () => null, addEventListener: () => {}, appendChild: () => {},
    focus: () => {}, remove: () => {}, select: () => {},
    set value(v) { this._value = v; }, get value() { return this._value; },
    set textContent(v) { this._text = String(v); }, get textContent() { return this._text; },
    set innerHTML(v) { this._html = String(v); }, get innerHTML() { return this._html; },
  };
  return el;
}
global.document = {
  querySelector(sel) { if (!elements[sel]) elements[sel] = makeEl(); return elements[sel]; },
  createElement() { return makeEl(); }, addEventListener() {}, body: makeEl(),
};
global.window = { ATM10_ITEMS: null };
global.localStorage = { _data: {}, getItem(k) { return this._data[k] || null; }, setItem(k, v) { this._data[k] = String(v); }, removeItem(k) { delete this._data[k]; } };
global.confirm = () => true;
Object.defineProperty(global, 'navigator', { value: { clipboard: { readText: async () => '', writeText: async () => {} } }, writable: true });
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
global.Blob = class { constructor(parts, opts) { this.parts = parts; this.opts = opts; } };

const appSrc = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf-8');
const parserSrc = fs.readFileSync(path.join(__dirname, 'import-parser.js'), 'utf-8');
eval(appSrc + '\n' + parserSrc + '\n;globalThis.__testParse = { parseSFMLCode, generateCode, normalizeState, render };');
const { parseSFMLCode, generateCode } = globalThis.__testParse;

const dir = process.argv[2] || 'E:\\Games\\MC\\小东西\\SFM程序';
const files = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.sfm')) files.push(p);
  }
}
walk(dir);

console.log(`Testing ${files.length} SFM files...\n`);
let pass = 0, fail = 0;
for (const f of files) {
  const code = fs.readFileSync(f, 'utf-8');
  try {
    const result = parseSFMLCode(code);
    // round-trip
    const { state } = result;
    const back = generateCode();
    console.log(`[PASS] ${path.relative(dir, f)}`);
    console.log(`       triggers=${result.state.triggers.length} statements=${result.state.triggers.reduce((a, t) => a + t.statements.length, 0)} labels=${result.state.labels.length} warnings=${result.warnings.length}`);
    if (result.warnings.length) console.log(`       warnings: ${JSON.stringify(result.warnings)}`);
    pass++;
  } catch (err) {
    console.log(`[FAIL] ${path.relative(dir, f)}`);
    console.log(`       ERROR: ${err.message}`);
    fail++;
  }
}
console.log(`\n=== ${pass} pass, ${fail} fail ===`);
