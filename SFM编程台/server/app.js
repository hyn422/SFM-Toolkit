'use strict';

const $ = sel => document.querySelector(sel);
let uidCounter = 0;
const uid = () => `n${++uidCounter}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));
const num = v => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
};
const unique = arr => [...new Set(arr.filter(Boolean))];

const RESOURCE_TYPES = [
  { id: 'item', label: '物品' },
  { id: 'fluid', label: '流体' },
  { id: 'forge_energy', label: '能量 FE' },
  { id: 'mekanism_energy', label: 'Mek 能量' },
  { id: 'chemical', label: '化学品' },
  { id: 'redstone', label: '红石信号' }
];
const TYPE_ALIAS = {
  item: 'item',
  fluid: 'fluid',
  forge_energy: 'fe',
  mekanism_energy: 'mekanism_energy',
  chemical: 'chemical',
  redstone: 'redstone'
};
const TYPE_MASK = { item: 1, fluid: 2, chemical: 4 };
const TYPE_LABEL = { item: '物品', fluid: '流体', chemical: '化学品' };
const SIDES = ['top', 'bottom', 'north', 'east', 'south', 'west', 'left', 'right', 'front', 'back', 'null', 'each'];
const COMPARATORS = ['>', '<', '=', '<=', '>='];
const SET_OPS = ['overall', 'each', 'some', 'one', 'lone'];
const STORE_KEY = 'sfm-builder-project-v1';

// ---------- factories ----------
function makeResource(overrides = {}) {
  return {
    id: uid(),
    type: 'item',
    ns: '',
    name: '',
    count: '',
    each: false,
    retain: '',
    retainEach: false,
    withMode: 'none',
    withExpr: '',
    except: '',
    ...overrides
  };
}

function makeIO(direction = 'input', overrides = {}) {
  return {
    id: uid(),
    kind: 'io',
    direction,
    note: '',
    resources: [makeResource()],
    labels: [],
    emptySlots: false,
    eachLabels: false,
    roundRobin: 'none',
    sides: [],
    slots: '',
    except: '',
    ...overrides
  };
}

function makeForget(overrides = {}) {
  return { id: uid(), kind: 'forget', note: '', labels: [], ...overrides };
}

function makeCondition(type = 'has', overrides = {}) {
  return {
    id: uid(),
    connector: 'and',
    not: false,
    type,
    setOp: 'overall',
    labels: [],
    sides: [],
    slots: '',
    comparator: '>',
    number: '',
    resource: makeResource(),
    literal: 'true',
    withMode: 'none',
    withExpr: '',
    except: '',
    ...overrides
  };
}

function makeIf(overrides = {}) {
  return {
    id: uid(),
    kind: 'if',
    note: '',
    conditions: [makeCondition('has')],
    then: [],
    elseIfs: [],
    else: [],
    ...overrides
  };
}

function makeTrigger(type = 'timer', statements = [], interval = 20, overrides = {}) {
  return {
    id: uid(),
    type,
    interval,
    unit: 'ticks',
    global: false,
    offset: 0,
    statements,
    ...overrides
  };
}

function defaultState() {
  return {
    name: '我的工厂',
    labels: ['a', 'b'],
    triggers: [
      makeTrigger('timer', [
        makeIO('input', { labels: ['a'] }),
        makeIO('output', { labels: ['b'] })
      ])
    ]
  };
}

function makeExample(name, labels, triggers) {
  return { name, labels, triggers };
}

const EXAMPLES = {
  simple: {
    title: '简单搬运',
    desc: 'a 的物资定期送到 b',
    make: () => makeExample('简单搬运', ['a', 'b'], [
      makeTrigger('timer', [
        makeIO('input', { labels: ['a'] }),
        makeIO('output', { labels: ['b'] })
      ])
    ])
  },
  energy: {
    title: '能量直通',
    desc: '每 tick 从能量源供电到机器',
    make: () => makeExample('能量直通', ['energy', 'machine'], [
      makeTrigger('timer', [
        makeIO('input', {
          labels: ['energy'],
          sides: ['top'],
          resources: [makeResource({ type: 'forge_energy' })]
        }),
        makeIO('output', {
          labels: ['machine'],
          sides: ['top'],
          resources: [makeResource({ type: 'forge_energy' })]
        })
      ], 1)
    ])
  },
  retain: {
    title: '保留缓冲',
    desc: '石头保留 5 个，其余搬走',
    make: () => makeExample('保留缓冲', ['a', 'b'], [
      makeTrigger('timer', [
        makeIO('input', {
          labels: ['a'],
          resources: [makeResource({ name: 'stone', retain: '5' })]
        }),
        makeIO('output', { labels: ['b'] })
      ])
    ])
  },
  empty: {
    title: '空槽输出',
    desc: '只放进 b 的空槽位',
    make: () => makeExample('空槽输出', ['a', 'b'], [
      makeTrigger('timer', [
        makeIO('input', { labels: ['a'] }),
        makeIO('output', { labels: ['b'], emptySlots: true })
      ])
    ])
  },
  conditional: {
    title: '条件分支',
    desc: 'a 超过 5 个时送 b，否则送 c',
    make: () => makeExample('条件分支', ['a', 'b', 'c'], [
      makeTrigger('timer', [
        makeIO('input', { labels: ['a'] }),
        makeIf({
          conditions: [makeCondition('has', { labels: ['a'], number: '5' })],
          then: [makeIO('output', { labels: ['b'], resources: [makeResource({ count: '1' })] })],
          else: [makeIO('output', { labels: ['c'] })]
        })
      ])
    ])
  },
  pulse: {
    title: '红石脉冲',
    desc: '收到红石上升沿时搬运一次',
    make: () => makeExample('红石脉冲', ['a', 'b'], [
      makeTrigger('pulse', [
        makeIO('input', { labels: ['a'] }),
        makeIO('output', { labels: ['b'] })
      ])
    ])
  },
  forget: {
    title: '遗忘分段',
    desc: '进熔炉后清空输入，再接产物',
    make: () => makeExample('遗忘分段', ['a', '熔炉', 'b'], [
      makeTrigger('timer', [
        makeIO('input', { labels: ['a'] }),
        makeIO('output', { labels: ['熔炉'] }),
        makeForget(),
        makeIO('input', { labels: ['熔炉'], slots: '2' }),
        makeIO('output', { labels: ['b'] })
      ])
    ])
  },
  timer: {
    title: '计时器与偏移',
    desc: '三种定时写法：普通 / 世界时间 / 偏移',
    make: () => makeExample('计时器与偏移', [], [
      makeTrigger('timer', []),
      makeTrigger('timer', [], 20, { global: true, offset: 1 }),
      makeTrigger('timer', [], 1, { unit: 'seconds' })
    ])
  }
};

const SNIPPETS = [
  { id: 'basic', title: '基础搬运', desc: 'input a → output b' },
  { id: 'energy', title: '能量直通', desc: '每 tick 传输 FE' },
  { id: 'fluid', title: '流体补给', desc: '定期传输流体' },
  { id: 'retain', title: '保留缓冲', desc: 'retain 5 stone' },
  { id: 'empty', title: '空槽输出', desc: 'empty slots in' },
  { id: 'conditional', title: '条件分支', desc: 'if a has > 5' },
  { id: 'pulse', title: '红石脉冲', desc: 'redstone pulse' },
  { id: 'forget', title: '遗忘分段', desc: 'forget 隔离输入' }
];

let state = defaultState();
let expandedIO = new Set();
let editingStmts = new Set(); // statement ids opened in full edit mode
let db = { items: [] };
let pendingResourceId = null;
let toastTimer = null;

// ---------- state helpers ----------
function normalizeState(saved) {
  if (!saved || typeof saved !== 'object') return defaultState();
  const s = {
    name: typeof saved.name === 'string' ? saved.name : '我的工厂',
    labels: Array.isArray(saved.labels) ? saved.labels : [],
    triggers: Array.isArray(saved.triggers) ? saved.triggers : []
  };
  const normalizeCond = conds => {
    (conds || []).forEach(c => {
      if (!c.id) c.id = uid();
      c.labels = Array.isArray(c.labels) ? c.labels : [];
      c.sides = Array.isArray(c.sides) ? c.sides : [];
      c.resource = c.resource && c.resource.id ? c.resource : makeResource();
    });
  };
  const normalizeList = list => {
    (list || []).forEach(s => {
      if (!s.id) s.id = uid();
      if (s.kind === 'io') {
        s.resources = Array.isArray(s.resources) ? s.resources : [];
        s.labels = Array.isArray(s.labels) ? s.labels : [];
        s.sides = Array.isArray(s.sides) ? s.sides : [];
        s.except = typeof s.except === 'string' ? s.except : '';
        s.resources.forEach(r => {
          if (!r.id) r.id = uid();
          r.each = !!r.each;
          r.retainEach = !!r.retainEach;
        });
      }
      if (s.kind === 'forget') s.labels = Array.isArray(s.labels) ? s.labels : [];
      if (s.kind === 'if') {
        s.conditions = Array.isArray(s.conditions) ? s.conditions : [];
        s.then = Array.isArray(s.then) ? s.then : [];
        s.elseIfs = Array.isArray(s.elseIfs) ? s.elseIfs : [];
        s.else = Array.isArray(s.else) ? s.else : [];
        normalizeCond(s.conditions);
        s.elseIfs.forEach(ei => {
          ei.id = ei.id || uid();
          ei.conditions = Array.isArray(ei.conditions) ? ei.conditions : [];
          ei.statements = Array.isArray(ei.statements) ? ei.statements : [];
          normalizeCond(ei.conditions);
          normalizeList(ei.statements);
        });
        normalizeList(s.then);
        normalizeList(s.else);
      }
    });
  };
  s.triggers.forEach(t => {
    t.id = t.id || uid();
    t.statements = Array.isArray(t.statements) ? t.statements : [];
    normalizeList(t.statements);
  });
  return s;
}

function autosave() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (_) {
    // storage may be unavailable on file://
  }
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = normalizeState(parsed);
      return;
    }
  } catch (_) {
    // fall through to default
  }
  state = defaultState();
}

function addLabel(name) {
  const clean = String(name || '').trim();
  if (!clean) return;
  if (!state.labels.includes(clean)) state.labels.push(clean);
}

// ---------- traversal helpers ----------
function visitStatements(list, cb) {
  (list || []).forEach(s => {
    cb(s);
    if (s.kind === 'if') {
      visitStatements(s.then, cb);
      visitStatements(s.else, cb);
      s.elseIfs.forEach(ei => visitStatements(ei.statements, cb));
    }
  });
}

function findStatementById(id) {
  let found = null;
  state.triggers.forEach(t => visitStatements(t.statements, s => {
    if (s.id === id) found = s;
  }));
  return found;
}

function getStatementList(listKey) {
  const parts = String(listKey || '').split(':');
  if (parts[0] === 'trig') {
    const t = state.triggers.find(x => x.id === parts[1]);
    return t ? t.statements : null;
  }
  const ifStmt = findStatementById(parts[1]);
  if (!ifStmt) return null;
  if (parts[2] === 'then') return ifStmt.then;
  if (parts[2] === 'else') return ifStmt.else;
  if (parts[2] === 'elseif') {
    const ei = ifStmt.elseIfs.find(x => x.id === parts[3]);
    return ei ? ei.statements : null;
  }
  return null;
}

function findResourceById(id) {
  let found = null;
  const scan = s => {
    if (s.kind === 'io') found = s.resources.find(r => r.id === id) || found;
    if (s.kind === 'if') {
      s.conditions.forEach(c => { if (c.resource && c.resource.id === id) found = c.resource; });
      s.elseIfs.forEach(ei => ei.conditions.forEach(c => { if (c.resource && c.resource.id === id) found = c.resource; }));
    }
  };
  state.triggers.forEach(t => visitStatements(t.statements, scan));
  return found;
}

function findConditionById(id) {
  let found = null;
  const scan = s => {
    if (s.kind !== 'if') return;
    s.conditions.forEach(c => { if (c.id === id) found = c; });
    s.elseIfs.forEach(ei => ei.conditions.forEach(c => { if (c.id === id) found = c; }));
  };
  state.triggers.forEach(t => visitStatements(t.statements, scan));
  return found;
}

function findElseIfById(id) {
  let found = null;
  const scan = s => {
    if (s.kind !== 'if') return;
    s.elseIfs.forEach(ei => { if (ei.id === id) found = ei; });
  };
  state.triggers.forEach(t => visitStatements(t.statements, scan));
  return found;
}

function findConditionGroup(groupId) {
  const parts = String(groupId || '').split(':');
  if (parts[0] === 'if') {
    const ifStmt = findStatementById(parts[1]);
    return ifStmt ? ifStmt.conditions : null;
  }
  if (parts[0] === 'elseif') {
    const ei = findElseIfById(parts[1]);
    return ei ? ei.conditions : null;
  }
  return null;
}

// ---------- code generation ----------
function quoteString(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function fmtLabel(label) {
  const s = String(label || '').trim();
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) ? s : quoteString(s);
}

function fmtResourceId(id) {
  const s = String(id || '');
  return /^[A-Za-z0-9_*+.\-:]+$/.test(s) ? s : quoteString(s);
}

function resourceIdString(res) {
  const type = res.type || 'item';
  const ns = String(res.ns || '').trim();
  const name = String(res.name || '').trim();
  if (type === 'item') {
    if (!ns && !name) return '';
    return (ns ? ns + ':' : '') + name;
  }
  return `${TYPE_ALIAS[type] || type}:${ns}:${name}`;
}

function sidesCode(sides) {
  if (!sides || !sides.length) return '';
  return sides.includes('each') ? 'each side' : sides.join(', ') + ' side';
}

function conditionCode(c) {
  if (c.type === 'literal') return c.literal === 'false' ? 'false' : 'true';
  if (c.type === 'redstone') {
    let s = 'redstone';
    if (c.comparator && c.number !== '') s += ` ${c.comparator} ${num(c.number)}`;
    return s;
  }
  let s = '';
  if (c.setOp && c.setOp !== 'overall') s += c.setOp + ' ';
  s += (c.labels || []).map(fmtLabel).join(', ');
  if (c.sides && c.sides.length) s += ' ' + sidesCode(c.sides);
  if (c.slots && String(c.slots).trim()) s += ` slots ${String(c.slots).trim()}`;
  s += ` has ${c.comparator || '>'} ${num(c.number)}`;
  const rid = resourceIdString(c.resource);
  if (rid) s += ' ' + fmtResourceId(rid);
  if (c.withMode === 'with' && String(c.withExpr).trim()) s += ' with ' + String(c.withExpr).trim();
  if (c.withMode === 'without' && String(c.withExpr).trim()) s += ' without ' + String(c.withExpr).trim();
  if (String(c.except).trim()) s += ' except ' + String(c.except).trim();
  return s;
}

function boolexprCode(conditions) {
  return (conditions || []).map((c, i) =>
    `${i > 0 ? (c.connector || 'and') + ' ' : ''}${c.not ? 'not ' : ''}${conditionCode(c)}`
  ).join(' ');
}

function ioCode(stmt) {
  const parts = [];
  const resParts = (stmt.resources || []).map(res => {
    const p = [];
    const count = num(res.count);
    if (count > 0) p.push(count + (res.each ? ' each' : ''));
    const retain = num(res.retain);
    if (retain > 0) p.push('retain ' + retain + (res.retainEach ? ' each' : ''));
    const rid = resourceIdString(res);
    if (rid) p.push(fmtResourceId(rid));
    if (res.withMode === 'with' && String(res.withExpr).trim()) p.push('with ' + String(res.withExpr).trim());
    if (res.withMode === 'without' && String(res.withExpr).trim()) p.push('without ' + String(res.withExpr).trim());
    return p.join(' ');
  }).filter(Boolean);
  if (resParts.length) parts.push(resParts.join(', '));
  if (String(stmt.except).trim()) parts.push('except ' + String(stmt.except).trim());
  parts.push(stmt.direction === 'input' ? 'from' : 'to');
  if (stmt.emptySlots) parts.push('empty slots in');
  if (stmt.eachLabels) parts.push('each');
  parts.push((stmt.labels || []).map(fmtLabel).join(', '));
  if (stmt.roundRobin === 'label') parts.push('round robin by label');
  if (stmt.roundRobin === 'block') parts.push('round robin by block');
  if (stmt.sides && stmt.sides.length) parts.push(sidesCode(stmt.sides));
  if (stmt.slots && String(stmt.slots).trim()) parts.push('slots ' + String(stmt.slots).trim());
  return (stmt.direction === 'input' ? 'input ' : 'output ') + parts.join(' ');
}

function forgetCode(stmt) {
  const labels = (stmt.labels || []).map(fmtLabel).join(', ');
  return 'forget' + (labels ? ' ' + labels : '');
}

const ind = n => '    '.repeat(n);

function statementCode(list, depth) {
  const out = [];
  (list || []).forEach(s => {
    if (s.note) {
      s.note.split('\n').forEach(n => out.push(`${ind(depth)}-- ${n}`));
    }
    if (s.kind === 'io') out.push(`${ind(depth)}${ioCode(s)}`);
    else if (s.kind === 'forget') out.push(`${ind(depth)}${forgetCode(s)}`);
    else if (s.kind === 'if') {
      out.push(`${ind(depth)}if ${boolexprCode(s.conditions)} then`);
      out.push(...statementCode(s.then, depth + 1));
      s.elseIfs.forEach(ei => {
        out.push(`${ind(depth)}else if ${boolexprCode(ei.conditions)} then`);
        out.push(...statementCode(ei.statements, depth + 1));
      });
      if (s.else.length) {
        out.push(`${ind(depth)}else`);
        out.push(...statementCode(s.else, depth + 1));
      }
      out.push(`${ind(depth)}end`);
    }
  });
  return out;
}

function triggerCode(trig) {
  const out = [];
  if (trig.type === 'pulse') {
    out.push('every redstone pulse do');
    out.push(...statementCode(trig.statements, 1));
    out.push('end');
    return out;
  }
  let head = `every ${Math.max(1, num(trig.interval))}`;
  if (trig.global) head += ' global';
  if (num(trig.offset) > 0) head += ` plus ${num(trig.offset)}`;
  head += ` ${trig.unit || 'ticks'} do`;
  out.push(head);
  out.push(...statementCode(trig.statements, 1));
  out.push('end');
  return out;
}

function generateCode() {
  const lines = [];
  lines.push(`name ${quoteString(state.name.trim() || '未命名')}`);
  state.triggers.forEach(trig => {
    lines.push('');
    lines.push(...triggerCode(trig));
  });
  return lines.join('\n');
}

// ---------- validation ----------
function validate() {
  const issues = [];
  if (!String(state.name).trim()) issues.push({ level: 'error', msg: '程序名不能为空。' });
  if (!state.triggers.length) issues.push({ level: 'warn', msg: '还没有触发器，程序不会执行任何内容。' });

  const usedLabels = new Set();
  const definedLabels = new Set(state.labels);

  const checkCondGroup = (conds, context) => {
    if (!conds.length) issues.push({ level: 'error', msg: `${context}：if 至少需要一个条件。` });
    conds.forEach(c => {
      if (c.type === 'has') {
        if (!c.labels.length) issues.push({ level: 'error', msg: `${context}：资源数量条件没有选择标签。` });
        c.labels.forEach(l => usedLabels.add(l));
        if (c.number === '') issues.push({ level: 'warn', msg: `${context}：资源数量条件未填数量，会按 0 生成。` });
      }
    });
  };

  const checkStatement = (s, context) => {
    if (s.kind === 'io') {
      if (!s.labels.length) issues.push({ level: 'error', msg: `${context}：${s.direction === 'input' ? '输入' : '输出'}语句没有选择标签。` });
      s.labels.forEach(l => usedLabels.add(l));
      s.resources.forEach(r => {
        if (['fluid', 'forge_energy', 'mekanism_energy', 'chemical'].includes(r.type) && !(s.sides || []).length) {
          issues.push({ level: 'warn', msg: `${context}：${r.type} 传输通常需要指定方向面。` });
        }
        if (r.type === 'redstone' && s.direction === 'output') {
          issues.push({ level: 'error', msg: `${context}：红石信号只读，不能用于 output。` });
        }
        if (s.eachLabels && !num(r.count) && !resourceIdString(r)) {
          issues.push({ level: 'warn', msg: `${context}：each 搭配空数量/空资源时可能不生效。` });
        }
        if ((r.ns || r.name) && db.items.length) {
          const id = `${r.ns}${r.ns ? ':' : ''}${r.name}`;
          if (!db.items.some(e => e[0] === id)) {
            issues.push({ level: 'info', msg: `${context}：${id} 未在当前数据库中找到，若是自定义 ID 或正则可忽略。` });
          }
        }
      });
    } else if (s.kind === 'forget') {
      s.labels.forEach(l => usedLabels.add(l));
    } else if (s.kind === 'if') {
      checkCondGroup(s.conditions, context);
      s.then.forEach(x => checkStatement(x, context + '/then'));
      s.elseIfs.forEach((ei, idx) => {
        checkCondGroup(ei.conditions, context + `/else if ${idx + 1}`);
        ei.statements.forEach(x => checkStatement(x, context + `/else if ${idx + 1}`));
      });
      s.else.forEach(x => checkStatement(x, context + '/else'));
    }
  };

  state.triggers.forEach((t, i) => {
    const ctx = t.type === 'pulse' ? '红石脉冲' : `定时 ${t.interval}${t.unit}`;
    if (!t.statements.length) issues.push({ level: 'info', msg: `${ctx}：触发器内没有语句。` });
    t.statements.forEach(s => checkStatement(s, ctx));
  });

  for (const l of usedLabels) {
    if (!definedLabels.has(l)) issues.push({ level: 'info', msg: `标签 "${l}" 尚未登记到左侧标签库，请确认已在世界中用标签枪标记。` });
  }
  return issues;
}

// ---------- highlighting ----------
const KEYWORDS = new Set([
  'name', 'every', 'redstone', 'pulse', 'do', 'end', 'input', 'output', 'forget',
  'if', 'then', 'else', 'ticks', 'tick', 'seconds', 'second', 'global', 'plus',
  'each', 'retain', 'except', 'side', 'slots', 'slot', 'empty', 'in', 'round',
  'robin', 'by', 'block', 'label', 'with', 'without', 'not', 'and', 'or', 'has',
  'true', 'false'
]);

function highlightCode(code) {
  return String(code).split('\n').map(line => {
    let out = '';
    let last = 0;
    const re = /(--.*$)|("(?:[^"\\]|\\.)*")|([A-Za-z_][A-Za-z0-9_]*)|(\b\d+\b)|(\s+)|([^\s]+)/g;
    let m;
    while ((m = re.exec(line))) {
      if (m[1]) out += `<span class="tok-comment">${esc(m[1])}</span>`;
      else if (m[2]) out += `<span class="tok-string">${esc(m[2])}</span>`;
      else if (m[3]) out += KEYWORDS.has(m[3]) ? `<span class="tok-key">${esc(m[3])}</span>` : esc(m[3]);
      else if (m[4]) out += `<span class="tok-number">${esc(m[4])}</span>`;
      else if (m[5]) out += esc(m[5]);
      else out += `<span class="tok-resource">${esc(m[6])}</span>`;
      last = m.index + m[0].length;
    }
    if (last < line.length) out += esc(line.slice(last));
    return out;
  }).join('\n');
}

// ---------- rendering ----------
function render() {
  $('#programName').value = state.name;
  renderLabels();
  renderTriggers();
  refreshOutput();
}

function renderLabels() {
  const bank = $('#labelBank');
  if (!state.labels.length) {
    bank.innerHTML = '<span class="hint">还没有标签，先在左侧添加。</span>';
    return;
  }
  bank.innerHTML = state.labels.map(l => `
    <span class="label-chip">
      <span>${esc(l)}</span>
      <button class="chip-x" data-action="remove-label" data-label="${esc(l)}" title="删除标签">×</button>
    </span>
  `).join('');
}

function renderLabelPicker(targetType, targetId, selected) {
  const chosen = selected || [];
  if (!state.labels.length) return '<div class="label-picker"><span class="hint">先在左侧添加标签</span></div>';
  return `<div class="label-picker">
    <span class="picker-label">标签</span>
    ${state.labels.map(l => `
      <label class="label-chip ${chosen.includes(l) ? 'checked' : ''}">
        <input type="checkbox" data-label-choice data-target-type="${targetType}" data-target-id="${targetId}" value="${esc(l)}" ${chosen.includes(l) ? 'checked' : ''}>
        <span>${esc(l)}</span>
      </label>
    `).join('')}
  </div>`;
}

function renderSidePicker(targetType, targetId, selected) {
  const chosen = selected || [];
  return `<div class="side-picker">
    ${SIDES.map(side => `
      <label class="side-chip ${chosen.includes(side) ? 'checked' : ''}">
        <input type="checkbox" data-side-choice data-target-type="${targetType}" data-target-id="${targetId}" value="${side}" ${chosen.includes(side) ? 'checked' : ''}>
        <span>${side}</span>
      </label>
    `).join('')}
  </div>`;
}

function renderResourceRow(res) {
  const countHtml = `<label class="res-count"><span>数量</span><input type="number" min="0" data-res-field="count" data-res-id="${res.id}" value="${esc(res.count)}"><input type="checkbox" data-res-field="each" data-res-id="${res.id}" ${res.each ? 'checked' : ''} id="each-${res.id}"><label for="each-${res.id}">每种</label></label>`;
  const retainHtml = `<label class="res-count"><span>保留</span><input type="number" min="0" data-res-field="retain" data-res-id="${res.id}" value="${esc(res.retain)}"><input type="checkbox" data-res-field="retainEach" data-res-id="${res.id}" ${res.retainEach ? 'checked' : ''} id="re-${res.id}"><label for="re-${res.id}">每种</label></label>`;
  return `<div class="resource-row" data-res-id="${res.id}">
    <div class="res-compact">
      <select data-res-field="type" data-res-id="${res.id}">
        ${RESOURCE_TYPES.map(t => `<option value="${t.id}" ${res.type === t.id ? 'selected' : ''}>${t.label}</option>`).join('')}
      </select>
      <input data-res-field="ns" data-res-id="${res.id}" value="${esc(res.ns)}" placeholder="命名空间" class="res-ns">
      <span class="colon">:</span>
      <div class="name-autocomplete-wrap">
        <input data-res-field="name" data-res-id="${res.id}" value="${esc(res.name)}" placeholder="名称 / 正则" class="name-autocomplete-input" autocomplete="off">
        <div class="name-autocomplete-dropdown" data-res-id="${res.id}"></div>
      </div>
      <button class="btn btn-ghost btn-sm" data-action="open-regex-editor" data-res-id="${res.id}">正则</button>
      ${countHtml}
      ${retainHtml}
      <button class="icon-btn icon-sm" data-action="delete-resource" data-res-id="${res.id}" title="删除这条资源规则">×</button>
    </div>
    <div class="res-advanced">
      <select data-res-field="withMode" data-res-id="${res.id}">
        <option value="none" ${res.withMode === 'none' ? 'selected' : ''}>无标签筛选</option>
        <option value="with" ${res.withMode === 'with' ? 'selected' : ''}>with</option>
        <option value="without" ${res.withMode === 'without' ? 'selected' : ''}>without</option>
      </select>
      <input data-res-field="withExpr" data-res-id="${res.id}" value="${esc(res.withExpr)}" placeholder="#forge:ingots / not #...">
    </div>
  </div>`;
}

function renderResourceMini(res) {
  return `<div class="res-id">
    <input data-res-field="ns" data-res-id="${res.id}" value="${esc(res.ns)}" placeholder="命名空间">
    <span class="colon">:</span>
    <input data-res-field="name" data-res-id="${res.id}" value="${esc(res.name)}" placeholder="名称 / 正则">
    <button class="btn btn-ghost" data-action="open-regex-editor" data-res-id="${res.id}">正则</button>
  </div>`;
}

function renderIOBody(stmt) {
  const advId = 'adv-' + stmt.id;
  const advOpen = expandedIO.has(advId);
  const emptySlots = stmt.direction === 'output' ? `
    <label class="field toggle">
      <input type="checkbox" data-stmt-field="emptySlots" data-stmt-id="${stmt.id}" ${stmt.emptySlots ? 'checked' : ''}>
      <span>只放空槽</span>
    </label>` : '';
  const hasAdvanced = stmt.eachLabels || stmt.roundRobin !== 'none' || stmt.emptySlots ||
    (stmt.slots && String(stmt.slots).trim()) || String(stmt.except || '').trim() ||
    (stmt.resources || []).some(r => r.withMode !== 'none' && String(r.withExpr).trim());
  const advBtnLabel = advOpen ? '收起高级' : (hasAdvanced ? '高级 ▾ ●' : '高级 ▾');
  return `
    <div class="io-body" data-adv-id="${advId}">
      <div class="io-main">
        <div class="io-resources">
          <div class="io-resources-label">资源规则</div>
          ${(stmt.resources || []).map(renderResourceRow).join('')}
          <button class="btn btn-ghost btn-sm" data-action="add-resource" data-stmt-id="${stmt.id}">+ 资源</button>
        </div>
        <div class="io-labels">
          <div class="io-labels-label">目标标签</div>
          ${renderLabelPicker('stmt', stmt.id, stmt.labels)}
        </div>
        <div class="io-sides">
          <div class="io-sides-label">方向面</div>
          ${renderSidePicker('stmt', stmt.id, stmt.sides)}
        </div>
      </div>
      <button class="btn btn-ghost btn-sm io-adv-toggle" data-action="toggle-io-advanced" data-adv-id="${advId}">${advBtnLabel}</button>
      <div class="io-options ${advOpen ? '' : 'hidden'}">
        <label class="field toggle">
          <input type="checkbox" data-stmt-field="eachLabels" data-stmt-id="${stmt.id}" ${stmt.eachLabels ? 'checked' : ''}>
          <span>对每个标签分别计算</span>
        </label>
        <div class="field">
          <label>轮询</label>
          <select data-stmt-field="roundRobin" data-stmt-id="${stmt.id}">
            <option value="none" ${stmt.roundRobin === 'none' ? 'selected' : ''}>不使用</option>
            <option value="label" ${stmt.roundRobin === 'label' ? 'selected' : ''}>按标签</option>
            <option value="block" ${stmt.roundRobin === 'block' ? 'selected' : ''}>按方块</option>
          </select>
        </div>
        ${emptySlots}
        <div class="field">
          <label>槽位</label>
          <input data-stmt-field="slots" data-stmt-id="${stmt.id}" value="${esc(stmt.slots)}" placeholder="0,1,3-5">
        </div>
        <div class="field">
          <label>语句排除</label>
          <input data-stmt-field="except" data-stmt-id="${stmt.id}" value="${esc(stmt.except || '')}" placeholder="copper_ingot, gold_ingot">
        </div>
      </div>
    </div>
  `;
}

function renderConditionFields(c) {
  if (c.type === 'literal') {
    return `<div class="cond-has">
      <div class="field">
        <label>值</label>
        <select data-cond-field="literal" data-cond-id="${c.id}">
          <option value="true" ${c.literal === 'true' ? 'selected' : ''}>true</option>
          <option value="false" ${c.literal === 'false' ? 'selected' : ''}>false</option>
        </select>
      </div>
    </div>`;
  }
  if (c.type === 'redstone') {
    return `<div class="cond-has">
      <div class="field">
        <label>比较</label>
        <select data-cond-field="comparator" data-cond-id="${c.id}">
          ${COMPARATORS.map(op => `<option value="${op}" ${c.comparator === op ? 'selected' : ''}>${op}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>数量</label>
        <input type="number" min="0" data-cond-field="number" data-cond-id="${c.id}" value="${esc(c.number)}">
      </div>
    </div>`;
  }
  return `
    <div class="cond-has">
      <div class="field">
        <label>范围</label>
        <select data-cond-field="setOp" data-cond-id="${c.id}">
          ${SET_OPS.map(op => `<option value="${op}" ${c.setOp === op ? 'selected' : ''}>${op}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>比较</label>
        <select data-cond-field="comparator" data-cond-id="${c.id}">
          ${COMPARATORS.map(op => `<option value="${op}" ${c.comparator === op ? 'selected' : ''}>${op}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>数量</label>
        <input type="number" min="0" data-cond-field="number" data-cond-id="${c.id}" value="${esc(c.number)}">
      </div>
      <div class="field">
        <label>资源</label>
        ${renderResourceMini(c.resource)}
      </div>
      <div class="field">
        <label>筛选</label>
        <select data-cond-field="withMode" data-cond-id="${c.id}">
          <option value="none" ${c.withMode === 'none' ? 'selected' : ''}>不使用</option>
          <option value="with" ${c.withMode === 'with' ? 'selected' : ''}>with</option>
          <option value="without" ${c.withMode === 'without' ? 'selected' : ''}>without</option>
        </select>
      </div>
      <div class="field">
        <label>表达式</label>
        <input data-cond-field="withExpr" data-cond-id="${c.id}" value="${esc(c.withExpr)}" placeholder="#forge:ingots">
      </div>
      <div class="field">
        <label>排除</label>
        <input data-cond-field="except" data-cond-id="${c.id}" value="${esc(c.except)}" placeholder="copper_ingot">
      </div>
    </div>
    ${renderLabelPicker('cond', c.id, c.labels)}
    <div class="field slots-field">
      <label>槽位</label>
      <input data-cond-field="slots" data-cond-id="${c.id}" value="${esc(c.slots)}" placeholder="0,1,3-5">
    </div>
    <div class="cond-sides">${renderSidePicker('cond', c.id, c.sides)}</div>
  `;
}

function renderCondition(cond, groupId, index) {
  return `<div class="if-condition" data-cond-id="${cond.id}">
    <div class="cond-main">
      ${index > 0 ? `
        <select data-cond-field="connector" data-cond-id="${cond.id}">
          <option value="and" ${cond.connector === 'and' ? 'selected' : ''}>and</option>
          <option value="or" ${cond.connector === 'or' ? 'selected' : ''}>or</option>
        </select>
      ` : '<div></div>'}
      <label class="field toggle">
        <input type="checkbox" data-cond-field="not" data-cond-id="${cond.id}" ${cond.not ? 'checked' : ''}>
        <span>not</span>
      </label>
      <select data-cond-field="type" data-cond-id="${cond.id}">
        <option value="has" ${cond.type === 'has' ? 'selected' : ''}>资源数量</option>
        <option value="redstone" ${cond.type === 'redstone' ? 'selected' : ''}>红石信号</option>
        <option value="literal" ${cond.type === 'literal' ? 'selected' : ''}>常量</option>
      </select>
      <div class="cond-actions">
        <button class="icon-btn" data-action="delete-condition" data-cond-id="${cond.id}" title="删除条件">×</button>
      </div>
    </div>
    ${renderConditionFields(cond)}
  </div>`;
}

function renderConditionList(conditions, groupId) {
  if (!conditions.length) return '<div class="empty-state">还没有条件</div>';
  return conditions.map((c, i) => renderCondition(c, groupId, i)).join('');
}

function renderAddStatementBar(listKey) {
  return `<div class="add-statement-bar">
    <button class="btn btn-ghost" data-action="add-statement" data-list-key="${listKey}" data-kind="input">+ 输入</button>
    <button class="btn btn-ghost" data-action="add-statement" data-list-key="${listKey}" data-kind="output">+ 输出</button>
    <button class="btn btn-ghost" data-action="add-statement" data-list-key="${listKey}" data-kind="forget">+ 遗忘</button>
    <button class="btn btn-ghost" data-action="add-statement" data-list-key="${listKey}" data-kind="if">+ 条件</button>
  </div>`;
}

function renderIfBody(stmt) {
  return `
    <div class="branch-head">条件</div>
    ${renderConditionList(stmt.conditions, `if:${stmt.id}`)}
    <div class="add-row">
      <button class="btn btn-ghost" data-action="add-condition" data-cond-group-id="if:${stmt.id}">+ 添加条件</button>
    </div>
    <div class="branch">
      <div class="branch-head">then 分支</div>
      ${renderStatementList(stmt.then, `if:${stmt.id}:then`)}
      ${renderAddStatementBar(`if:${stmt.id}:then`)}
    </div>
    ${stmt.elseIfs.map(ei => `
      <div class="branch">
        <div class="branch-head">
          <span>else if 分支</span>
          <button class="icon-btn" data-action="delete-elseif" data-ei-id="${ei.id}" title="删除此分支">×</button>
        </div>
        ${renderConditionList(ei.conditions, `elseif:${ei.id}`)}
        <div class="add-row">
          <button class="btn btn-ghost" data-action="add-condition" data-cond-group-id="elseif:${ei.id}">+ 添加条件</button>
        </div>
        ${renderStatementList(ei.statements, `if:${stmt.id}:elseif:${ei.id}:then`)}
        ${renderAddStatementBar(`if:${stmt.id}:elseif:${ei.id}:then`)}
      </div>
    `).join('')}
    <div class="add-row">
      <button class="btn btn-ghost" data-action="add-elseif" data-if-id="${stmt.id}">+ 添加 else if</button>
    </div>
    <div class="branch">
      <div class="branch-head">else 分支</div>
      ${renderStatementList(stmt.else, `if:${stmt.id}:else`)}
      ${renderAddStatementBar(`if:${stmt.id}:else`)}
    </div>
  `;
}

function renderStatement(s, listKey, index) {
  const kindLabel = {
    io: s.direction === 'input' ? '输入' : '输出',
    forget: '遗忘',
    if: '条件'
  }[s.kind] || s.kind;
  const kindClass = {
    io: s.direction === 'input' ? 'input' : 'output',
    forget: 'forget',
    if: 'if'
  }[s.kind] || '';
  const inEdit = editingStmts.has(s.id);
  const toggleEditBtn = `<button class="icon-btn btn-sm" data-action="toggle-edit-stmt" data-stmt-id="${s.id}" title="${inEdit ? '完成编辑' : '编辑详情'}">${inEdit ? '✓' : '✎'}</button>`;
  // Head always shows a compact flow summary
  const summary = s.kind === 'io'
    ? renderIOCodeSummary(s)
    : s.kind === 'forget' ? '<span class="compact-hint">遗忘之前的输入</span>'
    : s.kind === 'if' ? renderIfSummary(s) : '';
  // Full detail shown only in edit mode
  const detail = inEdit
    ? `<div class="statement-detail">${s.kind === 'io' ? renderIOBody(s)
        : s.kind === 'forget' ? renderLabelPicker('stmt', s.id, s.labels)
        : s.kind === 'if' ? renderIfBody(s) : ''}</div>`
    : '';
  const flip = s.kind === 'io' && inEdit ? `
    <button class="icon-btn" data-action="flip-direction" data-stmt-id="${s.id}" title="切换输入/输出">⇄</button>
  ` : '';
  const note = s.note ? `<div class="stmt-note">${esc(s.note.split('\n').join(' · '))}</div>` : '';
  return `
    <article class="statement ${inEdit ? 'editing' : 'compact'}" data-stmt-id="${s.id}" title="双击编辑详情">
      <div class="statement-head">
        <span class="statement-kind ${kindClass}">${kindLabel}</span>
        <div class="stmt-summary">${summary}${note}</div>
        <div class="statement-actions">
          ${toggleEditBtn}
          ${flip}
          <button class="icon-btn" data-action="move-statement" data-stmt-id="${s.id}" data-list-key="${listKey}" data-dir="up" title="上移">↑</button>
          <button class="icon-btn" data-action="move-statement" data-stmt-id="${s.id}" data-list-key="${listKey}" data-dir="down" title="下移">↓</button>
          <button class="icon-btn" data-action="delete-statement" data-stmt-id="${s.id}" title="删除语句">×</button>
        </div>
      </div>
      ${detail}
    </article>
  `;
}

function renderIOCodeSummary(s) {
  // Compact single-line-ish summary of an IO statement
  const resParts = (s.resources || []).map(r => {
    const rid = resourceIdString(r);
    let txt = rid || '';
    if (r.count && num(r.count) > 0) txt = (txt ? txt + ' ' : '') + r.count;
    if (r.retain && num(r.retain) > 0) txt = (txt ? txt + ' ' : '') + 'retain ' + r.retain;
    if (r.each) txt += ' each';
    return txt || (r.type && r.type !== 'item' ? r.type : '物品');
  }).filter(Boolean);
  const resText = resParts.join(' · ');
  const labelText = (s.labels || []).map(fmtLabel).join(', ');
  const sideText = (s.sides || []).length ? '<span class="compact-side">[' + s.sides.join(',') + ']</span>' : '';
  const kw = s.direction === 'input' ? '<span class="compact-kw">输入</span>' : '<span class="compact-kw">输出</span>';
  const arrow = s.direction === 'input' ? '' : '→';
  const pre = s.direction === 'input' ? 'from' : 'to';
  const parts = [];
  if (s.direction === 'input') parts.push(kw);
  if (resText) parts.push('<span class="compact-res">' + esc(resText) + '</span>');
  parts.push('<span class="compact-lab">' + esc(pre) + ' ' + esc(labelText || '?') + '</span>' + sideText);
  if (s.direction === 'output') parts.unshift(kw + ' ' + arrow);
  return '<span class="compact-line">' + parts.join(' ') + '</span>';
}

function renderIfSummary(s) {
  const conds = (s.conditions || []).map(c => {
    if (c.type === 'has') return (c.labels || []).join(',') + ' ' + (c.comparator || '>') + ' ' + (c.number || '0');
    if (c.type === 'redstone') return 'redstone';
    return c.literal === 'false' ? 'false' : 'true';
  }).filter(Boolean).join(' 且 ');
  let txt = 'if ' + (conds || '…') + ' then …';
  if (s.elseIfs.length) txt += ' · else if ×' + s.elseIfs.length;
  if (s.else.length) txt += ' · else';
  return '<span class="compact-hint">' + esc(txt) + '</span>';
}

function renderStatementList(statements, listKey) {
  if (!statements.length) return '<div class="empty-state">还没有语句</div>';
  return statements.map((s, i) => renderStatement(s, listKey, i)).join('');
}

function renderTrigger(trig) {
  const timerFields = trig.type === 'timer' ? `
    <label class="field">每
      <input type="number" min="1" data-trigger-field="interval" data-trigger-id="${trig.id}" value="${esc(trig.interval)}">
      <select data-trigger-field="unit" data-trigger-id="${trig.id}">
        <option value="ticks" ${trig.unit === 'ticks' ? 'selected' : ''}>ticks</option>
        <option value="seconds" ${trig.unit === 'seconds' ? 'selected' : ''}>seconds</option>
      </select>
    </label>
    <label class="field">
      <input type="checkbox" data-trigger-field="global" data-trigger-id="${trig.id}" ${trig.global ? 'checked' : ''}>
      世界时间
    </label>
    <label class="field">偏移
      <input type="number" min="0" data-trigger-field="offset" data-trigger-id="${trig.id}" value="${esc(trig.offset)}">
    </label>
  ` : '';
  const badge = trig.type === 'pulse'
    ? '<span class="trigger-badge pulse">红石脉冲</span>'
    : '<span class="trigger-badge">定时触发器</span>';
  return `
    <section class="trigger" data-trigger-id="${trig.id}">
      <div class="trigger-head">
        <div class="trigger-title">
          ${badge}
          <div class="trigger-fields">${timerFields}</div>
        </div>
        <div class="trigger-head-actions">
          <button class="icon-btn" data-action="move-trigger" data-trigger-id="${trig.id}" data-dir="up" title="上移">↑</button>
          <button class="icon-btn" data-action="move-trigger" data-trigger-id="${trig.id}" data-dir="down" title="下移">↓</button>
          <button class="icon-btn" data-action="delete-trigger" data-trigger-id="${trig.id}" title="删除触发器">×</button>
        </div>
      </div>
      <div class="statement-list">${renderStatementList(trig.statements, `trig:${trig.id}`)}</div>
      ${renderAddStatementBar(`trig:${trig.id}`)}
    </section>
  `;
}

function renderTriggers() {
  const list = $('#triggerList');
  list.innerHTML = state.triggers.length
    ? state.triggers.map(renderTrigger).join('')
    : '<div class="empty-state">还没有触发器，点击上方按钮添加。</div>';
}

function renderIssues() {
  const issues = validate();
  if (!issues.length) {
    $('#issues').innerHTML = `
      <div class="issues-title">检查结果 · 通过</div>
      <div class="issue info"><span class="dot"></span>代码可以复制到 SFM 磁盘。</div>
    `;
    return;
  }
  $('#issues').innerHTML = `
    <div class="issues-title">检查结果 · ${issues.length} 项</div>
    ${issues.map(i => `
      <div class="issue ${i.level}"><span class="dot"></span>${esc(i.msg)}</div>
    `).join('')}
  `;
}

function refreshOutput() {
  const code = generateCode();
  $('#codeOutput').innerHTML = `<code>${highlightCode(code)}</code>`;
  $('#codeMeta').textContent = `${code.length.toLocaleString()} 字符 · ${code.split('\n').length} 行`;
  renderIssues();
}

function renderStatic() {
  $('#snippetList').innerHTML = SNIPPETS.map(s => `
    <button class="snippet-item" data-action="add-snippet" data-snippet-id="${s.id}">
      ${esc(s.title)}<small>${esc(s.desc)}</small>
    </button>
  `).join('');
  $('#exampleList').innerHTML = Object.entries(EXAMPLES).map(([id, ex]) => `
    <button class="example-item" data-action="load-example" data-example-id="${id}">
      ${esc(ex.title)}<small>${esc(ex.desc)}</small>
    </button>
  `).join('');
}

// ---------- snippets and examples ----------
function applySnippet(id) {
  const ensure = names => names.forEach(n => addLabel(n));
  switch (id) {
    case 'basic':
      ensure(['a', 'b']);
      state.triggers.push(makeTrigger('timer', [
        makeIO('input', { labels: ['a'] }),
        makeIO('output', { labels: ['b'] })
      ]));
      break;
    case 'energy':
      ensure(['energy', 'machine']);
      state.triggers.push(makeTrigger('timer', [
        makeIO('input', { labels: ['energy'], sides: ['top'], resources: [makeResource({ type: 'forge_energy' })] }),
        makeIO('output', { labels: ['machine'], sides: ['top'], resources: [makeResource({ type: 'forge_energy' })] })
      ], 1));
      break;
    case 'fluid':
      ensure(['water', 'tank']);
      state.triggers.push(makeTrigger('timer', [
        makeIO('input', { labels: ['water'], sides: ['top'], resources: [makeResource({ type: 'fluid' })] }),
        makeIO('output', { labels: ['tank'], sides: ['top'], resources: [makeResource({ type: 'fluid' })] })
      ]));
      break;
    case 'retain':
      ensure(['a', 'b']);
      state.triggers.push(makeTrigger('timer', [
        makeIO('input', { labels: ['a'], resources: [makeResource({ name: 'stone', retain: '5' })] }),
        makeIO('output', { labels: ['b'] })
      ]));
      break;
    case 'empty':
      ensure(['a', 'b']);
      state.triggers.push(makeTrigger('timer', [
        makeIO('input', { labels: ['a'] }),
        makeIO('output', { labels: ['b'], emptySlots: true })
      ]));
      break;
    case 'conditional':
      ensure(['a', 'b', 'c']);
      state.triggers.push(makeTrigger('timer', [
        makeIO('input', { labels: ['a'] }),
        makeIf({
          conditions: [makeCondition('has', { labels: ['a'], number: '5' })],
          then: [makeIO('output', { labels: ['b'], resources: [makeResource({ count: '1' })] })],
          else: [makeIO('output', { labels: ['c'] })]
        })
      ]));
      break;
    case 'pulse':
      ensure(['a', 'b']);
      state.triggers.push(makeTrigger('pulse', [
        makeIO('input', { labels: ['a'] }),
        makeIO('output', { labels: ['b'] })
      ]));
      break;
    case 'forget':
      ensure(['a', '熔炉', 'b']);
      state.triggers.push(makeTrigger('timer', [
        makeIO('input', { labels: ['a'] }),
        makeIO('output', { labels: ['熔炉'] }),
        makeForget(),
        makeIO('input', { labels: ['熔炉'], slots: '2' }),
        makeIO('output', { labels: ['b'] })
      ]));
      break;
  }
}

function loadExample(id) {
  const ex = EXAMPLES[id];
  if (!ex) return;
  state = ex.make();
  render();
  autosave();
  showToast(`已载入示例：${ex.title}`);
}

// ---------- name autocomplete with pinyin ----------
let autocompleteState = null; // { wrap, input, list, items[], selectedIndex }

function handleNameAutocomplete(input) {
  const wrap = input.closest('.name-autocomplete-wrap');
  const list = wrap.querySelector('.name-autocomplete-dropdown');
  const resId = list.dataset.resId;
  const res = findResourceById(resId);
  const type = res ? res.type : 'item';
  const q = input.value.trim().toLowerCase();

  // If it looks like a regex or has special chars, hide dropdown
  if (/[*+?()|[\]{}\\.^$]/.test(q) || !q) {
    list.classList.remove('active');
    list.innerHTML = '';
    autocompleteState = null;
    return;
  }

  // Build candidates from DB
  let candidates = db.items;
  if (type && TYPE_MASK[type]) candidates = candidates.filter(e => e[3] & TYPE_MASK[type]);

  // Filter: match against ID, zh_name, en_name, or pinyin
  const matchSet = new Set();
  candidates.forEach(e => {
    if (e[0].toLowerCase().includes(q)) matchSet.add(e);
    else if ((e[1] || '').toLowerCase().includes(q)) matchSet.add(e);
    else if ((e[2] || '').toLowerCase().includes(q)) matchSet.add(e);
  });

  // If direct text gives few results, also try pinyin initials
  if (matchSet.size < 5 && /^[a-z]+$/.test(q) && typeof pinyinPro !== 'undefined') {
    candidates.forEach(e => {
      const zh = e[1] || '';
      if (!zh) return;
      const initials = pinyinPro.pinyin(zh, { pattern: 'first', toneType: 'none', type: 'string' }).toLowerCase().replace(/\s/g, '');
      if (initials.includes(q)) matchSet.add(e);
    });
  }

  const items = Array.from(matchSet).slice(0, 80);
  if (!items.length) {
    list.classList.remove('active');
    list.innerHTML = '';
    autocompleteState = null;
    return;
  }

  list.innerHTML = items.map((e, i) => {
    const [id, zh, en] = e;
    return `<button class="name-autocomplete-item ${i === 0 ? 'highlighted' : ''}" data-index="${i}"><strong>${esc(id)}</strong>${zh ? `<small>${esc(zh)}${en ? ' · ' + esc(en) : ''}</small>` : ''}</button>`;
  }).join('');

  list.classList.add('active');

  autocompleteState = { wrap, input, list, items, selectedIndex: 0 };

  // Click-to-select
  list.querySelectorAll('.name-autocomplete-item').forEach(btn => {
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      const idx = parseInt(btn.dataset.index, 10);
      pickAutocomplete(idx);
    });
  });
}

function pickAutocomplete(idx) {
  if (!autocompleteState) return;
  const { input, items } = autocompleteState;
  const item = items[idx];
  if (!item) return;
  const resId = input.closest('.name-autocomplete-wrap').querySelector('.name-autocomplete-dropdown').dataset.resId;
  const res = findResourceById(resId);
  if (!res) return;

  // Parse the selected ID into ns:name
  const colon = item[0].indexOf(':');
  if (colon !== -1) {
    res.ns = item[0].slice(0, colon);
    res.name = item[0].slice(colon + 1);
  } else {
    res.ns = '';
    res.name = item[0];
  }

  clearAutocomplete();
  render();
  autosave();
}

function clearAutocomplete() {
  if (autocompleteState) {
    autocompleteState.list.classList.remove('active');
    autocompleteState.list.innerHTML = '';
    autocompleteState = null;
  }
}

function navigateAutocomplete(dir) {
  if (!autocompleteState) return;
  const { list, items, selectedIndex } = autocompleteState;
  const max = items.length - 1;
  let idx = selectedIndex + dir;
  if (idx < 0) idx = max;
  if (idx > max) idx = 0;
  autocompleteState.selectedIndex = idx;
  list.querySelectorAll('.name-autocomplete-item').forEach((btn, i) => {
    btn.classList.toggle('highlighted', i === idx);
  });
}

// ---------- regex editor ----------
function openRegexEditor(resId) {
  const res = findResourceById(resId);
  if (!res) return;
  pendingResourceId = resId;
  const ns = res.ns || '';
  const name = res.name || '';
  $('#regexInput').value = ns ? ns + ':' + name : name;
  $('#regexModal').classList.remove('hidden');
  setTimeout(() => $('#regexInput').focus(), 60);
}

function applyRegex() {
  const raw = $('#regexInput').value.trim();
  const res = pendingResourceId ? findResourceById(pendingResourceId) : null;
  if (res) {
    if (raw.includes(':')) {
      const colon = raw.indexOf(':');
      res.ns = raw.slice(0, colon);
      res.name = raw.slice(colon + 1);
    } else {
      res.ns = '';
      res.name = raw;
    }
  }
  pendingResourceId = null;
  $('#regexModal').classList.add('hidden');
  render();
  autosave();
}

// ---------- data loading ----------
function initData() {
  if (window.ATM10_ITEMS && Array.isArray(window.ATM10_ITEMS.items)) {
    db = window.ATM10_ITEMS;
    const el = $('#dbStatus');
    el.textContent = `已加载内置索引：${db.items.length.toLocaleString()} 条`;
    el.classList.add('ok');
    el.classList.remove('fail');
  } else {
    const el = $('#dbStatus');
    el.textContent = '内置索引未加载，可手动选择数据库文件。';
    el.classList.add('fail');
    el.classList.remove('ok');
  }
}

function entriesToCompact(entries) {
  const maskMap = { item: 1, fluid: 2, chemical: 4 };
  return entries.map(e => {
    let mask = 0;
    (e.types || []).forEach(t => { mask |= maskMap[t] || 0; });
    return [e.id, e.name_zh || '', e.name_en || '', mask];
  }).filter(e => e[3]);
}

function openDbFilePicker() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      if (json.entries) {
        db = { meta: json.meta, items: entriesToCompact(json.entries) };
      } else if (Array.isArray(json.items)) {
        db = json;
      } else {
        throw new Error('unsupported format');
      }
      const el = $('#dbStatus');
      el.textContent = `已加载 ${file.name}：${db.items.length.toLocaleString()} 条`;
      el.classList.add('ok');
      el.classList.remove('fail');
      showToast('物品数据库已更新');
      refreshOutput();
    } catch (_) {
      showToast('无法读取该 JSON 文件');
    }
  };
  input.click();
}

// ---------- resource modal ----------
function openResourcePicker(resId) {
  const res = findResourceById(resId);
  if (!res) return;
  pendingResourceId = resId;
  $('#resourceSearch').value = '';
  $('#resourceModal').classList.remove('hidden');
  renderResourceResults('');
  setTimeout(() => $('#resourceSearch').focus(), 60);
}

function closeModal() {
  pendingResourceId = null;
  $('#resourceModal').classList.add('hidden');
}

function renderResourceResults(query) {
  const box = $('#resourceResults');
  const res = pendingResourceId ? findResourceById(pendingResourceId) : null;
  const type = res ? res.type : null;
  if (!db.items.length) {
    box.innerHTML = '<div class="empty-state">数据库为空，请先选择 ATM10_ID_Database.json。</div>';
    return;
  }
  if (type && !['item', 'fluid', 'chemical'].includes(type)) {
    box.innerHTML = '<div class="empty-state">该资源类型无需从数据库选择。</div>';
    return;
  }
  const q = String(query || '').trim().toLowerCase();
  let list = db.items;
  if (type && TYPE_MASK[type]) list = list.filter(e => e[3] & TYPE_MASK[type]);
  if (q) {
    list = list.filter(e =>
      e[0].toLowerCase().includes(q) ||
      e[1].toLowerCase().includes(q) ||
      e[2].toLowerCase().includes(q)
    );
  }
  list = list.slice(0, 200);
  box.innerHTML = list.length ? list.map(e => {
    const colon = e[0].indexOf(':');
    const ns = colon === -1 ? '' : e[0].slice(0, colon);
    const name = colon === -1 ? e[0] : e[0].slice(colon + 1);
    const badgeType = TYPE_LABEL[type] || (e[3] & 4 ? '化学品' : e[3] & 2 ? '流体' : '物品');
    return `
      <button class="resource-result" data-action="pick-resource" data-ns="${esc(ns)}" data-name="${esc(name)}">
        <div>
          <strong>${esc(e[0])}</strong>
          <span>${esc(e[1] || '')}${e[1] && e[2] ? ' · ' : ''}${esc(e[2] || '')}</span>
        </div>
        <span class="resource-type-badge ${type === 'fluid' ? 'fluid' : type === 'chemical' ? 'chemical' : ''}">${badgeType}</span>
      </button>
    `;
  }).join('') : '<div class="empty-state">没有匹配结果。</div>';
}

// ---------- clipboard / download / toast ----------
function showToast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 1800);
}

async function copyCode() {
  const code = generateCode();
  try {
    await navigator.clipboard.writeText(code);
    showToast('代码已复制');
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = code;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast('代码已复制');
  }
}

function downloadCode() {
  const code = generateCode();
  const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${String(state.name || 'program').replace(/[\\/:*?"<>|]/g, '_')}.sfm`;
  a.click();
  URL.revokeObjectURL(url);
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text || !text.trim()) {
      showToast('剪切板内容为空');
      return;
    }
    // Route through the import parser
    const ta = $('#importCode');
    ta.value = text;
    runImport();
    showToast('已从剪切板粘贴并识别');
  } catch (_) {
    // Fallback for older browsers / no permission
    try {
      const ta = document.createElement('textarea');
      document.body.appendChild(ta);
      ta.focus();
      document.execCommand('paste');
      const text = ta.value;
      ta.remove();
      if (text) {
        const importTa = $('#importCode');
        importTa.value = text;
        runImport();
        showToast('已从剪切板粘贴并识别');
        return;
      }
    } catch (_2) {}
    showToast('无法读取剪切板，请手动使用导入功能');
  }
}

// ---------- events ----------
function handleInput(e) {
  const t = e.target;
  if (t.id === 'resourceSearch') {
    renderResourceResults(t.value);
    return;
  }
  if (t.dataset.globalField === 'name') {
    state.name = t.value;
    refreshOutput();
    autosave();
    return;
  }
  if (t.dataset.triggerField) {
    const trig = state.triggers.find(x => x.id === t.dataset.triggerId);
    if (!trig) return;
    const f = t.dataset.triggerField;
    if (f === 'interval') trig.interval = t.value;
    else if (f === 'unit') trig.unit = t.value;
    else if (f === 'offset') trig.offset = t.value;
    else if (f === 'global') trig.global = t.checked;
    refreshOutput();
    autosave();
    return;
  }
  if (t.dataset.stmtField) {
    const stmt = findStatementById(t.dataset.stmtId);
    if (!stmt) return;
    const f = t.dataset.stmtField;
    if (f === 'note') stmt.note = t.value;
    else if (f === 'slots') stmt.slots = t.value;
    else if (f === 'except') stmt.except = t.value;
    else if (f === 'emptySlots') stmt.emptySlots = t.checked;
    else if (f === 'eachLabels') stmt.eachLabels = t.checked;
    else if (f === 'roundRobin') stmt.roundRobin = t.value;
    else if (f === 'direction') stmt.direction = t.value;
    refreshOutput();
    autosave();
    return;
  }
  // ---- pinyin autocomplete for name input ----
  if (t.classList.contains('name-autocomplete-input')) {
    // Keep the underlying model in sync as the user types
    const res = findResourceById(t.dataset.resId);
    if (res) {
      res.name = t.value;
      refreshOutput();
      autosave();
    }
    handleNameAutocomplete(t);
    return;
  }
  if (t.dataset.resField) {
    const res = findResourceById(t.dataset.resId);
    if (!res) return;
    const f = t.dataset.resField;
    if (f === 'type') res.type = t.value;
    else if (f === 'ns') res.ns = t.value;
    else if (f === 'name') res.name = t.value;
    else if (f === 'count') res.count = t.value;
    else if (f === 'each') res.each = t.checked;
    else if (f === 'retain') res.retain = t.value;
    else if (f === 'retainEach') res.retainEach = t.checked;
    else if (f === 'withMode') res.withMode = t.value;
    else if (f === 'withExpr') res.withExpr = t.value;
    else if (f === 'except') res.except = t.value;
    refreshOutput();
    autosave();
    return;
  }
  if (t.dataset.condField) {
    const cond = findConditionById(t.dataset.condId);
    if (!cond) return;
    const f = t.dataset.condField;
    if (f === 'connector') cond.connector = t.value;
    else if (f === 'not') cond.not = t.checked;
    else if (f === 'type') cond.type = t.value;
    else if (f === 'setOp') cond.setOp = t.value;
    else if (f === 'comparator') cond.comparator = t.value;
    else if (f === 'number') cond.number = t.value;
    else if (f === 'literal') cond.literal = t.value;
    else if (f === 'withMode') cond.withMode = t.value;
    else if (f === 'withExpr') cond.withExpr = t.value;
    else if (f === 'except') cond.except = t.value;
    else if (f === 'slots') cond.slots = t.value;
    refreshOutput();
    autosave();
  }
}

function handleChange(e) {
  const t = e.target;
  if (t.dataset.labelChoice !== undefined) {
    const targetType = t.dataset.targetType;
    const targetId = t.dataset.targetId;
    const label = t.value;
    let list = null;
    if (targetType === 'stmt') {
      const stmt = findStatementById(targetId);
      if (stmt) list = stmt.labels;
    } else if (targetType === 'cond') {
      const cond = findConditionById(targetId);
      if (cond) list = cond.labels;
    }
    if (list) {
      if (t.checked) {
        if (!list.includes(label)) list.push(label);
      } else {
        const idx = list.indexOf(label);
        if (idx !== -1) list.splice(idx, 1);
      }
    }
    render();
    autosave();
    return;
  }
  if (t.dataset.sideChoice !== undefined) {
    const targetType = t.dataset.targetType;
    const targetId = t.dataset.targetId;
    const side = t.value;
    let list = null;
    if (targetType === 'stmt') {
      const stmt = findStatementById(targetId);
      if (stmt) list = stmt.sides;
    } else if (targetType === 'cond') {
      const cond = findConditionById(targetId);
      if (cond) list = cond.sides;
    }
    if (list) {
      if (t.checked) {
        if (side === 'each') {
          list.splice(0, list.length, 'each');
        } else {
          if (list.includes('each')) list.splice(0, list.length);
          if (!list.includes(side)) list.push(side);
        }
      } else {
        const idx = list.indexOf(side);
        if (idx !== -1) list.splice(idx, 1);
      }
    }
    render();
    autosave();
    return;
  }
  if (
    (t.dataset.resField === 'type') ||
    (t.dataset.condField === 'type') ||
    (t.dataset.stmtField === 'direction')
  ) {
    render();
    autosave();
  }
}

function handleClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === 'add-label') {
    const input = $('#labelInput');
    addLabel(input.value);
    input.value = '';
    render();
    autosave();
    return;
  }
  if (action === 'remove-label') {
    state.labels = state.labels.filter(l => l !== btn.dataset.label);
    render();
    autosave();
    return;
  }
  if (action === 'clear-labels') {
    state.labels = [];
    render();
    autosave();
    return;
  }
  if (action === 'new-program') {
    if (confirm('清空当前工程并新建？')) {
      state = defaultState();
      render();
      autosave();
    }
    return;
  }
  if (action === 'save-project') {
    downloadCode();
    showToast('已生成 .sfm 文件并下载');
    return;
  }
  if (action === 'add-trigger-timer') {
    state.triggers.push(makeTrigger('timer'));
    render();
    autosave();
    return;
  }
  if (action === 'add-trigger-pulse') {
    state.triggers.push(makeTrigger('pulse'));
    render();
    autosave();
    return;
  }
  if (action === 'delete-trigger') {
    state.triggers = state.triggers.filter(t => t.id !== btn.dataset.triggerId);
    render();
    autosave();
    return;
  }
  if (action === 'move-trigger') {
    const idx = state.triggers.findIndex(t => t.id === btn.dataset.triggerId);
    const dir = btn.dataset.dir;
    if (dir === 'up' && idx > 0) {
      [state.triggers[idx - 1], state.triggers[idx]] = [state.triggers[idx], state.triggers[idx - 1]];
      render();
      autosave();
    } else if (dir === 'down' && idx > -1 && idx < state.triggers.length - 1) {
      [state.triggers[idx + 1], state.triggers[idx]] = [state.triggers[idx], state.triggers[idx + 1]];
      render();
      autosave();
    }
    return;
  }
  if (action === 'add-statement') {
    const list = getStatementList(btn.dataset.listKey);
    if (!list) return;
    const kind = btn.dataset.kind;
    if (kind === 'input') {
      list.push(makeIO('input', { labels: state.labels.length ? [state.labels[0]] : [] }));
    } else if (kind === 'output') {
      list.push(makeIO('output', { labels: state.labels.length ? [state.labels[0]] : [] }));
    } else if (kind === 'forget') {
      list.push(makeForget());
    } else if (kind === 'if') {
      list.push(makeIf());
    }
    render();
    autosave();
    return;
  }
  if (action === 'delete-statement') {
    let removed = false;
    const removeFrom = list => {
      const idx = list.findIndex(s => s.id === btn.dataset.stmtId);
      if (idx !== -1) {
        list.splice(idx, 1);
        removed = true;
      }
    };
    state.triggers.forEach(t => {
      visitStatements(t.statements, s => {
        if (s.kind === 'if') {
          removeFrom(s.then);
          removeFrom(s.else);
          s.elseIfs.forEach(ei => removeFrom(ei.statements));
        }
      });
      removeFrom(t.statements);
    });
    if (removed) {
      render();
      autosave();
    }
    return;
  }
  if (action === 'move-statement') {
    const list = getStatementList(btn.dataset.listKey);
    if (!list) return;
    const idx = list.findIndex(s => s.id === btn.dataset.stmtId);
    const dir = btn.dataset.dir;
    if (dir === 'up' && idx > 0) {
      [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
      render();
      autosave();
    } else if (dir === 'down' && idx > -1 && idx < list.length - 1) {
      [list[idx + 1], list[idx]] = [list[idx], list[idx + 1]];
      render();
      autosave();
    }
    return;
  }
  if (action === 'flip-direction') {
    const stmt = findStatementById(btn.dataset.stmtId);
    if (stmt && stmt.kind === 'io') {
      stmt.direction = stmt.direction === 'input' ? 'output' : 'input';
      render();
      autosave();
    }
    return;
  }
  if (action === 'add-resource') {
    const stmt = findStatementById(btn.dataset.stmtId);
    if (stmt && stmt.kind === 'io') stmt.resources.push(makeResource());
    render();
    autosave();
    return;
  }
  if (action === 'toggle-io-advanced') {
    const advId = btn.dataset.advId;
    if (expandedIO.has(advId)) expandedIO.delete(advId);
    else expandedIO.add(advId);
    render();
    return;
  }
  if (action === 'toggle-edit-stmt') {
    const sid = btn.dataset.stmtId;
    if (editingStmts.has(sid)) editingStmts.delete(sid);
    else editingStmts.add(sid);
    render();
    return;
  }
  if (action === 'delete-resource') {
    const remove = s => {
      if (s.kind === 'io') s.resources = s.resources.filter(r => r.id !== btn.dataset.resId);
      if (s.kind === 'if') {
        s.conditions.forEach(c => {
          if (c.resource && c.resource.id === btn.dataset.resId) c.resource = makeResource();
        });
        s.elseIfs.forEach(ei => ei.conditions.forEach(c => {
          if (c.resource && c.resource.id === btn.dataset.resId) c.resource = makeResource();
        }));
      }
    };
    state.triggers.forEach(t => visitStatements(t.statements, remove));
    render();
    autosave();
    return;
  }
  if (action === 'add-condition') {
    const group = findConditionGroup(btn.dataset.condGroupId);
    if (group) group.push(makeCondition('has'));
    render();
    autosave();
    return;
  }
  if (action === 'delete-condition') {
    const remove = s => {
      if (s.kind !== 'if') return;
      s.conditions = s.conditions.filter(c => c.id !== btn.dataset.condId);
      s.elseIfs.forEach(ei => {
        ei.conditions = ei.conditions.filter(c => c.id !== btn.dataset.condId);
      });
    };
    state.triggers.forEach(t => visitStatements(t.statements, remove));
    render();
    autosave();
    return;
  }
  if (action === 'add-elseif') {
    const ifStmt = findStatementById(btn.dataset.ifId);
    if (ifStmt && ifStmt.kind === 'if') {
      ifStmt.elseIfs.push({ id: uid(), conditions: [makeCondition('has')], statements: [] });
      render();
      autosave();
    }
    return;
  }
  if (action === 'delete-elseif') {
    const remove = s => {
      if (s.kind !== 'if') return;
      s.elseIfs = s.elseIfs.filter(ei => ei.id !== btn.dataset.eiId);
    };
    state.triggers.forEach(t => visitStatements(t.statements, remove));
    render();
    autosave();
    return;
  }
  if (action === 'open-resource-picker') {
    openResourcePicker(btn.dataset.resId);
    return;
  }
  if (action === 'pick-resource') {
    const res = pendingResourceId ? findResourceById(pendingResourceId) : null;
    if (res) {
      res.ns = btn.dataset.ns || '';
      res.name = btn.dataset.name || '';
    }
    closeModal();
    render();
    autosave();
    return;
  }
  if (action === 'close-modal') {
    closeModal();
    return;
  }
  if (action === 'open-import') {
    openImportModal();
    return;
  }
  if (action === 'close-import-modal') {
    closeImportModal();
    return;
  }
  if (action === 'import-code-sample') {
    fillImportSample();
    return;
  }
  if (action === 'import-code') {
    runImport();
    return;
  }
  if (action === 'copy-code') {
    copyCode();
    return;
  }
  if (action === 'paste-code') {
    pasteFromClipboard();
    return;
  }
  if (action === 'download-code') {
    downloadCode();
    return;
  }
  if (action === 'open-regex-editor') {
    openRegexEditor(btn.dataset.resId);
    return;
  }
  if (action === 'apply-regex') {
    applyRegex();
    return;
  }
  if (action === 'close-regex-modal') {
    pendingResourceId = null;
    $('#regexModal').classList.add('hidden');
    return;
  }
  if (action === 'load-example') {
    loadExample(btn.dataset.exampleId);
    return;
  }
  if (action === 'add-snippet') {
    applySnippet(btn.dataset.snippetId);
    render();
    autosave();
    showToast('快捷片段已加入');
    return;
  }
  if (action === 'load-db-file') {
    openDbFilePicker();
    return;
  }
}

function handleKeydown(e) {
  // Autocomplete navigation
  if (autocompleteState) {
    if (e.key === 'ArrowDown') { e.preventDefault(); navigateAutocomplete(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); navigateAutocomplete(-1); return; }
    if (e.key === 'Tab' || e.key === 'Enter') {
      if (autocompleteState.selectedIndex >= 0) {
        e.preventDefault();
        pickAutocomplete(autocompleteState.selectedIndex);
        return;
      }
    }
    if (e.key === 'Escape') { clearAutocomplete(); return; }
  }

  if (e.key === 'Enter' && e.target.id === 'labelInput') {
    e.preventDefault();
    addLabel(e.target.value);
    e.target.value = '';
    render();
    autosave();
  }
  if (e.key === 'Escape') {
    closeModal();
    closeImportModal();
    // Also close regex modal
    $('#regexModal').classList.add('hidden');
    pendingResourceId = null;
  }
}

function bindEvents() {
  document.addEventListener('input', handleInput);
  document.addEventListener('change', handleChange);
  document.addEventListener('click', handleClick);
  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('mousedown', e => {
    if (autocompleteState && !autocompleteState.wrap.contains(e.target)) {
      clearAutocomplete();
    }
  });
  document.addEventListener('dblclick', e => {
    const article = e.target.closest('.statement[data-stmt-id]');
    if (!article) return;
    const sid = article.dataset.stmtId;
    if (editingStmts.has(sid)) editingStmts.delete(sid);
    else editingStmts.add(sid);
    render();
  });
}

// ---------- init ----------
function init() {
  initData();
  loadSaved();
  renderStatic();
  render();
  bindEvents();
}

init();
