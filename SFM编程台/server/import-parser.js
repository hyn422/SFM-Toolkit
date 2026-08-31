'use strict';

// ---- tokenizer ----
function sfmTokenize(code) {
  const tokens = [];
  let i = 0;
  let line = 1;
  const len = code.length;
  while (i < len) {
    const c = code[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '-' && code[i + 1] === '-') {
      const startLine = line;
      i += 2;
      let comment = '';
      while (i < len && code[i] !== '\n') {
        comment += code[i];
        i++;
      }
      tokens.push({ type: 'comment', value: comment.trim(), line: startLine });
      continue;
    }
    if (c === '"') {
      const startLine = line;
      i++;
      let val = '';
      let closed = false;
      while (i < len) {
        if (code[i] === '\n') line++;
        if (code[i] === '\\' && i + 1 < len) {
          val += code[i + 1];
          i += 2;
          continue;
        }
        if (code[i] === '"') { closed = true; i++; break; }
        val += code[i];
        i++;
      }
      if (!closed) throw new Error(`第 ${startLine} 行附近的字符串缺少结尾的双引号。`);
      tokens.push({ type: 'string', value: val, line: startLine });
      continue;
    }
    if (c === ',' || c === '(' || c === ')' || c === '+') {
      tokens.push({ type: 'punct', value: c, line });
      i++;
      continue;
    }
    const start = i;
    const startLine = line;
    while (i < len && !/[\s,"()]/.test(code[i])) {
      if (code[i] === '\n') line++;
      i++;
    }
    tokens.push({ type: 'word', value: code.slice(start, i), line: startLine });
  }
  return tokens;
}

// ---- parser helpers ----
const SFM_RESOURCE_ALIAS = {
  item: 'item',
  fluid: 'fluid',
  fe: 'forge_energy',
  rf: 'forge_energy',
  energy: 'forge_energy',
  power: 'forge_energy',
  forge_energy: 'forge_energy',
  mekanism_energy: 'mekanism_energy',
  chemical: 'chemical',
  gas: 'chemical',
  infusion: 'chemical',
  slurry: 'chemical',
  pigment: 'chemical',
  redstone: 'redstone'
};
const SFM_SIDES = new Set(['top', 'bottom', 'north', 'east', 'south', 'west', 'left', 'right', 'front', 'back', 'null', 'each']);
const SFM_SET_OPS = new Set(['overall', 'each', 'every', 'some', 'one', 'lone']);
const SFM_COMPARATOR_ALIAS = { gt: '>', lt: '<', eq: '=', le: '<=', ge: '>=' };

function peek(p) {
  return p.tokens[p.pos];
}
function peekLower(p) {
  const t = peek(p);
  return t ? String(t.value).toLowerCase() : '';
}
function advance(p) {
  return p.tokens[p.pos++];
}
function isWord(p, word) {
  return peekLower(p) === word;
}
function matchWord(p, word) {
  if (!isWord(p, word)) return false;
  p.pos++;
  return true;
}
function expectWord(p, word) {
  if (!matchWord(p, word)) {
    const t = peek(p);
    throw new Error(`第 ${t ? t.line : '?'} 行附近：应为 "${word}"，实际是 "${t ? t.value : '文件结尾'}"。`);
  }
}
function isPunct(p, value) {
  const t = peek(p);
  return !!t && t.type === 'punct' && t.value === value;
}
function readWordOrString(p, what) {
  const t = peek(p);
  if (!t) throw new Error(`第 ${p.tokens.length ? p.tokens[p.tokens.length - 1].line : 1} 行附近：缺少${what}。`);
  if (t.type !== 'word' && t.type !== 'string') {
    throw new Error(`第 ${t.line} 行附近：${what}不应是 "${t.value}"。`);
  }
  p.pos++;
  return t.value;
}
function readNumber(p, what) {
  const s = readWordOrString(p, what);
  if (!/^\d+$/.test(s)) throw new Error(`第 ${(peek(p) || p.tokens[p.pos - 1]).line} 行附近：${what}应为整数，实际是 "${s}"。`);
  return parseInt(s, 10);
}
function joinRawParts(parts) {
  let out = '';
  parts.forEach(part => {
    if (!out) out = part;
    else if (part === ',' || out.endsWith(',')) out += part;
    else if (part === '(' || part === ')') out += part;
    else out += ' ' + part;
  });
  return out;
}
function readRawUntil(p, stopWords, { skipCommas = false } = {}) {
  const parts = [];
  while (p.pos < p.tokens.length) {
    const t = peek(p);
    const low = String(t.value).toLowerCase();
    if (t.type === 'word' && stopWords.includes(low)) break;
    if (t.type === 'punct' && stopWords.includes(t.value)) break;
    if (t.value === ',' && skipCommas) { p.pos++; continue; }
    parts.push(t.value);
    p.pos++;
  }
  return joinRawParts(parts);
}
function addParsedLabel(p, label) {
  const clean = String(label || '').trim();
  if (clean && !p.labels.includes(clean)) p.labels.push(clean);
}

function setResourceFromText(res, text) {
  const raw = String(text || '').trim();
  if (!raw) return;
  const segs = raw.split(':');
  let type = 'item';
  let ns = '';
  let name = '';
  if (segs.length >= 4 && segs[0].toLowerCase() === 'sfm') {
    type = SFM_RESOURCE_ALIAS[segs[1].toLowerCase()] || segs[1];
    ns = segs[2];
    name = segs.slice(3).join(':');
  } else if (segs.length >= 2 && SFM_RESOURCE_ALIAS[segs[0].toLowerCase()]) {
    type = SFM_RESOURCE_ALIAS[segs[0].toLowerCase()];
    ns = segs[1];
    name = segs.slice(2).join(':');
  } else if (segs.length === 2) {
    ns = segs[0];
    name = segs[1];
  } else {
    name = raw;
  }
  res.type = type;
  res.ns = ns;
  res.name = name;
}

// ---- statement parsers ----
function parseIOResourceGroup(p, stmt) {
  const res = makeResource();
  const rawParts = [];
  while (p.pos < p.tokens.length) {
    if (isPunct(p, ',')) break;
    if (isWord(p, 'except') || isWord(p, 'from') || isWord(p, 'to')) break;
    if (matchWord(p, 'retain')) {
      res.retain = String(readNumber(p, 'retain 数量'));
      if (matchWord(p, 'each')) res.retainEach = true;
      continue;
    }
    if (matchWord(p, 'with') || matchWord(p, 'without')) {
      res.withMode = peekLower(p) === 'without' ? 'without' : 'with';
      p.pos--;
      p.pos++; // consume the keyword already consumed by matchWord
      res.withMode = p.tokens[p.pos - 1].value.toLowerCase();
      res.withExpr = readRawUntil(p, ['except', 'from', 'to', ','], { skipCommas: false });
      continue;
    }
    const t = peek(p);
    if (t.type === 'word' && /^\d+$/.test(t.value) && !rawParts.length) {
      p.pos++;
      res.count = t.value;
      if (matchWord(p, 'each')) res.each = true;
      continue;
    }
    rawParts.push(readWordOrString(p, '资源 ID'));
  }
  if (rawParts.length) setResourceFromText(res, joinRawParts(rawParts));
  // `or` disjunction is kept as one quoted expression instead of being lost.
  if (rawParts.length && /(^|\s)or(\s|$)/i.test(joinRawParts(rawParts))) {
    stmt._importWarnings = stmt._importWarnings || [];
    stmt._importWarnings.push('检测到资源 or 组合，已按整体表达式保留，请在右侧核对。');
  }
  return res;
}

function parseIOResources(p, stmt) {
  // Remove the placeholder empty resource from makeIO
  stmt.resources = [];
  while (p.pos < p.tokens.length) {
    if (isWord(p, 'from') || isWord(p, 'to')) return;
    if (matchWord(p, 'except')) {
      stmt.except = readRawUntil(p, ['from', 'to'], { skipCommas: false });
      continue;
    }
    stmt.resources.push(parseIOResourceGroup(p, stmt));
    if (isPunct(p, ',')) { p.pos++; continue; }
  }
}

function parseSideTokens(p) {
  const sides = [];
  while (p.pos < p.tokens.length && SFM_SIDES.has(peekLower(p))) {
    sides.push(advance(p).value);
    if (isPunct(p, ',')) p.pos++;
    else break;
  }
  if (sides.includes('each')) return ['each'];
  return sides;
}

function parseSlotsText(p, target) {
  if (!matchWord(p, 'slots') && !matchWord(p, 'slot')) return;
  const parts = [];
  while (p.pos < p.tokens.length) {
    const t = peek(p);
    const low = String(t.value).toLowerCase();
    if (t.type === 'word' && ['input', 'output', 'forget', 'if', 'end', 'else', 'then', 'do', 'round', 'slots', 'slot', 'has'].includes(low)) break;
    if (t.type === 'word' && SFM_SIDES.has(low)) break;
    parts.push(t.value);
    p.pos++;
  }
  target.slots = joinRawParts(parts);
}

function isStatementBoundary(p) {
  const low = peekLower(p);
  return ['input', 'output', 'forget', 'if', 'end', 'else', 'then', 'do'].includes(low);
}

function parseLabelList(p, collector) {
  const labels = [];
  while (p.pos < p.tokens.length) {
    if (isPunct(p, ',')) { p.pos++; continue; }
    const t = peek(p);
    if (!t) break;
    if (t.type !== 'string' && t.type !== 'word') break;
    const low = String(t.value).toLowerCase();
    if (t.type === 'word' && (isStatementBoundary(p) || low === 'round' || low === 'slots' || low === 'slot' || low === 'has' || SFM_SIDES.has(low))) break;
    labels.push(advance(p).value);
    collector(labels[labels.length - 1]);
  }
  return labels;
}

function parseIOOptions(p, stmt) {
  if (matchWord(p, 'empty')) {
    if (matchWord(p, 'slots') || matchWord(p, 'slot')) {
      expectWord(p, 'in');
      stmt.emptySlots = true;
    }
  }
  if (matchWord(p, 'each')) stmt.eachLabels = true;
  stmt.labels = parseLabelList(p, l => addParsedLabel(p, l));
  if (matchWord(p, 'round')) {
    expectWord(p, 'robin');
    expectWord(p, 'by');
    if (matchWord(p, 'label')) stmt.roundRobin = 'label';
    else { expectWord(p, 'block'); stmt.roundRobin = 'block'; }
  }
  if (p.pos < p.tokens.length && SFM_SIDES.has(peekLower(p))) {
    stmt.sides = parseSideTokens(p);
    if (matchWord(p, 'side')) { /* sides already captured */ }
  }
  parseSlotsText(p, stmt);
}

function parseIO(p, directionToken) {
  p.pos++;
  const stmt = makeIO(directionToken === 'input' ? 'input' : 'output');
  if (isWord(p, 'from') || isWord(p, 'to')) {
    const from = advance(p).value.toLowerCase() === 'from';
    stmt.direction = from ? 'input' : 'output';
    stmt.resources = [];
    parseIOOptions(p, stmt);
    return stmt;
  }
  parseIOResources(p, stmt);
  if (!isWord(p, 'from') && !isWord(p, 'to')) {
    const t = peek(p);
    throw new Error(`第 ${t ? t.line : '?'} 行附近：输入/输出语句缺少 from 或 to。`);
  }
  p.pos++;
  parseIOOptions(p, stmt);
  (stmt._importWarnings || []).forEach(w => p.warnings.push(`${w}（第 ${p.tokens[p.pos - 1].line} 行附近）`));
  return stmt;
}

function parseForget(p) {
  p.pos++;
  const stmt = makeForget();
  stmt.labels = parseLabelList(p, l => addParsedLabel(p, l));
  return stmt;
}

// ---- condition parsers ----
function parseWithOrWithoutCondition(p, cond) {
  if (matchWord(p, 'with') || matchWord(p, 'without')) {
    const kw = p.tokens[p.pos - 1].value.toLowerCase();
    cond.withMode = kw;
    cond.withExpr = readRawUntil(p, ['except', 'and', 'or', 'then', 'end', 'else', ','], { skipCommas: false });
  }
  if (matchWord(p, 'except')) {
    cond.except = readRawUntil(p, ['and', 'or', 'then', 'end', 'else'], { skipCommas: false });
  }
}

function parseHasCondition(p) {
  const cond = makeCondition('has');
  if (p.pos < p.tokens.length && SFM_SET_OPS.has(peekLower(p))) {
    const setOp = advance(p).value.toLowerCase();
    cond.setOp = setOp === 'every' ? 'each' : setOp;
  }
  cond.labels = parseLabelList(p, l => addParsedLabel(p, l));
  if (!cond.labels.length) {
    const t = peek(p);
    throw new Error(`第 ${t ? t.line : '?'} 行附近：has 条件缺少标签。`);
  }
  if (matchWord(p, 'round')) {
    expectWord(p, 'robin');
    expectWord(p, 'by');
    advance(p);
  }
  if (p.pos < p.tokens.length && SFM_SIDES.has(peekLower(p))) {
    cond.sides = parseSideTokens(p);
    if (matchWord(p, 'side')) { /* ok */ }
  }
  if (isWord(p, 'slots') || isWord(p, 'slot')) parseSlotsText(p, cond);
  expectWord(p, 'has');
  const compTok = readWordOrString(p, '比较符');
  cond.comparator = SFM_COMPARATOR_ALIAS[compTok.toLowerCase()] || compTok;
  cond.number = String(readNumber(p, '条件数量'));
  if (p.pos < p.tokens.length) {
    const low = peekLower(p);
    if (!['and', 'or', 'then', 'end', 'else', 'with', 'without', 'except', ')'].includes(low)) {
      const raw = [];
      while (p.pos < p.tokens.length) {
        const t = peek(p);
        const l = String(t.value).toLowerCase();
        if (t.type === 'word' && ['and', 'or', 'then', 'end', 'else', 'with', 'without', 'except'].includes(l)) break;
        if (t.type === 'punct' && (t.value === ')' || t.value === ',')) break;
        raw.push(t.value);
        p.pos++;
      }
      if (raw.length) setResourceFromText(cond.resource, joinRawParts(raw));
    }
  }
  parseWithOrWithoutCondition(p, cond);
  return cond;
}

function parseConditionList(p, stopWords) {
  const conds = [];
  let connector = 'and';
  let parenWarned = false;
  while (p.pos < p.tokens.length) {
    const low = peekLower(p);
    if (!low) break;
    if (stopWords.includes(low) || (low === ')' && stopWords.includes(')'))) break;
    if (isPunct(p, ')')) { p.pos++; continue; }
    if (conds.length && !['and', 'or'].includes(low)) {
      connector = 'and';
    } else if (conds.length && (low === 'and' || low === 'or')) {
      connector = advance(p).value.toLowerCase();
      continue;
    }
    if (isPunct(p, '(')) {
      if (!parenWarned) {
        p.warnings.push('检测到带括号的条件，已按从左到右顺序展开导入，请在右侧核对逻辑。');
        parenWarned = true;
      }
      p.pos++;
      continue;
    }
    let neg = false;
    if (matchWord(p, 'not')) neg = true;
    let cond;
    if (isWord(p, 'true') || isWord(p, 'false')) {
      cond = makeCondition('literal');
      cond.literal = advance(p).value.toLowerCase();
    } else if (isWord(p, 'redstone')) {
      p.pos++;
      cond = makeCondition('redstone');
      const t = peek(p);
      if (t && t.type === 'word' && (SFM_COMPARATOR_ALIAS[t.value.toLowerCase()] || ['>', '<', '=', '<=', '>='].includes(t.value))) {
        const comp = advance(p).value.toLowerCase();
        cond.comparator = SFM_COMPARATOR_ALIAS[comp] || comp;
        cond.number = String(readNumber(p, '红石信号强度'));
      }
    } else {
      cond = parseHasCondition(p);
    }
    cond.connector = connector;
    cond.not = neg;
    conds.push(cond);
  }
  return conds;
}

function parseIf(p) {
  p.pos++;
  const stmt = makeIf();
  stmt.conditions = parseConditionList(p, ['then']);
  expectWord(p, 'then');
  stmt.then = parseStatementsUntil(p, ['end', 'else']);
  let closed = false;
  while (!closed) {
    if (matchWord(p, 'else')) {
      if (matchWord(p, 'if')) {
        const ei = { id: uid(), conditions: parseConditionList(p, ['then']), statements: [] };
        expectWord(p, 'then');
        ei.statements = parseStatementsUntil(p, ['end', 'else']);
        stmt.elseIfs.push(ei);
      } else {
        stmt.else = parseStatementsUntil(p, ['end']);
        expectWord(p, 'end');
        closed = true;
      }
    } else if (matchWord(p, 'end')) {
      closed = true;
    } else {
      const t = peek(p);
      throw new Error(`第 ${t ? t.line : '?'} 行附近：if 语句应有 else 或 end，实际是 "${t ? t.value : '文件结尾'}"。`);
    }
  }
  return stmt;
}

// ---- trigger / program ----
function takePendingNotes(p) {
  if (!p.pendingNotes || !p.pendingNotes.length) return '';
  const notes = p.pendingNotes.join('\n');
  p.pendingNotes = [];
  return notes;
}

function parseStatementsUntil(p, stopWords) {
  const stmts = [];
  while (p.pos < p.tokens.length) {
    const t = peek(p);
    if (t && t.type === 'comment') {
      if (!p.pendingNotes) p.pendingNotes = [];
      p.pendingNotes.push(t.value);
      p.pos++;
      continue;
    }
    const low = peekLower(p);
    if (stopWords.includes(low)) break;
    if (isStatementBoundary(p)) {
      let stmt;
      if (low === 'input' || low === 'output') stmt = parseIO(p, low);
      else if (low === 'forget') stmt = parseForget(p);
      else if (low === 'if') stmt = parseIf(p);
      else throw new Error(`第 ${peek(p).line} 行附近：意外的语句 "${low}"。`);
      // Attach leading comments as note
      const notes = takePendingNotes(p);
      if (notes && stmt) {
        stmt.note = (stmt.note ? stmt.note + '\n' : '') + notes;
      }
      stmts.push(stmt);
    } else {
      throw new Error(`第 ${peek(p).line} 行附近：无法识别的语句 "${peek(p).value}"。`);
    }
  }
  return stmts;
}

function parseTrigger(p, firstToken) {
  // firstToken is already consumed by parseSFMLCode; don't advance further
  if (matchWord(p, 'redstone')) {
    expectWord(p, 'pulse');
    expectWord(p, 'do');
    const trig = makeTrigger('pulse');
    trig.statements = parseStatementsUntil(p, ['end']);
    expectWord(p, 'end');
    return trig;
  }
  const trig = makeTrigger('timer');
  let unit = '';
  let interval = 1;
  let global = false;
  let offset = 0;
  if (['ticks', 'tick', 'seconds', 'second'].includes(peekLower(p))) {
    unit = advance(p).value.toLowerCase();
  } else {
    const first = readWordOrString(p, '触发器间隔');
    const m = String(first).match(/^(\d+)([gG])?$/);
    if (!m) throw new Error(`第 ${p.tokens[p.pos - 1].line} 行附近：无法识别定时触发器 "${first}"。`);
    interval = parseInt(m[1], 10);
    global = !!m[2];
    if (isWord(p, 'g') || isWord(p, 'global')) {
      advance(p);
      global = true;
    }
    if (isWord(p, 'plus')) {
      advance(p);
      offset = readNumber(p, '偏移量');
    } else if (isPunct(p, '+')) {
      p.pos++;
      offset = readNumber(p, '偏移量');
    }
    if (!unit) {
      if (!['ticks', 'tick', 'seconds', 'second'].includes(peekLower(p))) {
        throw new Error(`第 ${peek(p) ? peek(p).line : '?'} 行附近：触发器缺少 ticks 或 seconds。`);
      }
      unit = advance(p).value.toLowerCase();
    }
  }
  trig.interval = String(interval);
  trig.global = global;
  trig.offset = String(offset || 0);
  trig.unit = unit;
  expectWord(p, 'do');
  trig.statements = parseStatementsUntil(p, ['end']);
  expectWord(p, 'end');
  return trig;
}

function parseSFMLCode(input) {
  const text = String(input || '').trim();
  if (!text) throw new Error('请先粘贴要识别的 SFM 代码。');
  const tokens = sfmTokenize(text);
  const p = { tokens, pos: 0, labels: [], warnings: [], pendingNotes: [] };
  const name = '导入的程序';
  let programName = '';
  const triggers = [];
  while (p.pos < tokens.length) {
    const tt = peek(p);
    if (tt && tt.type === 'comment') {
      if (tt.value) {
        if (!p.pendingNotes) p.pendingNotes = [];
        p.pendingNotes.push(tt.value);
      }
      p.pos++;
      continue;
    }
    if (isWord(p, 'name')) {
      p.pos++;
      programName = readWordOrString(p, '程序名');
      continue;
    }
    if (isWord(p, 'every')) {
      const trig = parseTrigger(p, advance(p));
      // Attach top-level comments preceding this trigger to its first statement
      const notes = takePendingNotes(p);
      if (notes && trig.statements.length) {
        const first = trig.statements[0];
        first.note = (first.note ? first.note + '\n' : '') + notes;
      }
      triggers.push(trig);
      continue;
    }
    const t2 = peek(p);
    throw new Error(`第 ${t2 ? t2.line : '?'} 行附近：程序顶层只能有 name 和 every，实际是 "${t2 ? t2.value : '文件结尾'}"。`);
  }
  const state = { name: programName || name, labels: p.labels, triggers };
  return { state, warnings: p.warnings };
}

// ---- import modal UI ----
function openImportModal() {
  const modal = $('#importModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  $('#importFeedback').textContent = '';
  $('#importFeedback').className = 'import-feedback';
  const ta = $('#importCode');
  if (!ta.value) ta.value = 'name "我的工厂"\n\nevery 20 ticks do\n    input from a\n    output to b\nend';
  setTimeout(() => ta.focus(), 60);
}

function closeImportModal() {
  const modal = $('#importModal');
  if (modal) modal.classList.add('hidden');
}

function fillImportSample() {
  $('#importCode').value = [
    'name "导入示例"',
    '',
    'every 20 ticks do',
    '    -- 石头保留 5 个，其余搬去 b',
    '    input retain 5 stone from a',
    '    output 1 to b',
    '    forget',
    '    input fluid::water from "水槽" top side',
    '    output retain 1000 fluid::water to "机器" top side',
    '    if a has > 5 stone then',
    '        output 2 to b',
    '    else if redstone > 8 then',
    '        output 1 to c',
    '    else',
    '        output to d',
    '    end',
    'end',
    '',
    'every redstone pulse do',
    '    input fe:: from energy top side',
    '    output fe:: to machine east, front side',
    'end'
  ].join('\n');
  $('#importFeedback').textContent = '示例已填好，点击“识别并导入”。';
  $('#importFeedback').className = 'import-feedback ok';
}

function runImport() {
  const ta = $('#importCode');
  const feedback = $('#importFeedback');
  let parsed;
  try {
    parsed = parseSFMLCode(ta.value);
  } catch (err) {
    feedback.textContent = err.message;
    feedback.className = 'import-feedback error';
    return;
  }
  if (!parsed.state.triggers.length) {
    feedback.textContent = '识别完成，但代码里没有任何 every 触发器。';
    feedback.className = 'import-feedback error';
    return;
  }
  state = normalizeState(parsed.state);
  render();
  autosave();
  closeImportModal();
  const counts = parsed.state.triggers.length;
  showToast(`已识别 ${counts} 个触发器`);
}
