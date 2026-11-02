import { solve, checkAssignment, getSeats, seatLabel, keyOf, parseKey } from './solver.js';
import { load, save, defaultState, downloadJSON, readJSONFile } from './storage.js';
import { newId, parseRosterText, sortStudents, sampleStudents, genderLabel } from './roster.js';
import { renderBoard, fitNames, setCellName } from './layout.js';

const $ = (sel) => document.querySelector(sel);
let state = load();
let currentTab = null;
let selectedKey = null;
let busy = false;

// ---------- 共通 ----------
function persist() {
  if (!save(state)) toast('この端末に保存できませんでした。「保存」タブからファイルに書き出してください。');
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 2600);
}

const studentsById = () => new Map(state.students.map((s) => [s.id, s]));
const studentText = (s) => `${s.no ?? ''}. ${s.name}`;
const nameOf = (id) => studentsById().get(id)?.name ?? '（名簿にいない児童）';
const formatDate = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
};
const lastHistory = () => state.history[state.history.length - 1] || null;

function option(value, text) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = text;
  return o;
}

function showTab(name) {
  currentTab = name;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach((s) => { s.hidden = s.id !== `tab-${name}`; });
  render();
}

function render() {
  ({ shuffle: renderShuffle, roster: renderRoster, layout: renderLayout, rules: renderRules, history: renderHistory })[currentTab]?.();
}

// ---------- 席替え ----------
function showMessages(items) {
  const box = $('#messages');
  box.replaceChildren(...items.map(([type, text]) => {
    const p = document.createElement('p');
    p.className = `msg ${type}`;
    p.textContent = text;
    return p;
  }));
}

function violationMessages() {
  if (!state.current) return [];
  return checkAssignment({ ...state, assignment: state.current.assignment }).map((t) => ['warn', t]);
}

function renderShuffle() {
  $('#opt-anim').checked = state.view.animation;
  $('#opt-orient').value = state.view.orientation;
  $('#class-name').value = state.view.className || '';
  const cur = state.current;
  $('#stage-date').textContent = cur ? formatDate(cur.date) : '';
  $('#btn-commit').disabled = !cur || cur.committed;
  $('#btn-commit').textContent = cur && cur.committed ? '決定ずみ' : 'この席で決定';

  const empty = $('#stage-empty');
  if (state.students.length === 0) {
    empty.hidden = false;
    empty.textContent = 'まず「名簿」タブで児童を登録してください。';
  } else if (!cur) {
    empty.hidden = false;
    empty.textContent = '「席替えスタート！」を押すと席替えします。';
  } else {
    empty.hidden = true;
  }
  renderBoard($('#board'), {
    layout: state.layout,
    assignment: cur ? cur.assignment : {},
    studentsById: studentsById(),
    orientation: state.view.orientation,
    selected: selectedKey,
    onCell: cur ? onSeatTap : null,
  });
}

function onSeatTap(key) {
  if (busy || !state.current) return;
  if (!selectedKey) {
    selectedKey = key;
  } else if (selectedKey === key) {
    selectedKey = null;
  } else {
    const a = state.current.assignment;
    const x = a[selectedKey], y = a[key];
    delete a[selectedKey]; delete a[key];
    if (x) a[key] = x;
    if (y) a[selectedKey] = y;
    state.current.committed = false;
    selectedKey = null;
    persist();
    showMessages(violationMessages());
  }
  renderShuffle();
}

async function startShuffle() {
  if (busy) return;
  if (state.students.length === 0) {
    toast('名簿に児童がいません。');
    showTab('roster');
    return;
  }
  selectedKey = null;
  const res = solve({
    layout: state.layout,
    students: state.students,
    constraints: state.constraints,
    prev: lastHistory()?.assignment,
  });
  if (!res.ok) {
    showMessages(res.reasons.map((t) => ['error', t]));
    return;
  }
  showMessages([]);
  const next = { assignment: res.assignment, date: new Date().toISOString(), committed: false };
  if (state.view.animation) await playAnimation(res.assignment);
  state.current = next;
  persist();
  renderShuffle();
  showMessages(res.warnings.map((t) => ['warn', t]));
}

function playAnimation(assignment) {
  return new Promise((resolve) => {
    busy = true;
    setBusyButtons(true);
    $('#stage-empty').hidden = true;
    renderBoard($('#board'), {
      layout: state.layout,
      assignment: {},
      studentsById: new Map(),
      orientation: state.view.orientation,
    });
    const map = studentsById();
    const names = state.students.map((s) => s.name);
    const keys = Object.keys(assignment);
    const cells = new Map([...document.querySelectorAll('#board .seat')].map((c) => [c.dataset.key, c]));
    const waiting = new Set(keys);
    keys.forEach((k) => cells.get(k)?.classList.add('spinning'));
    const order = [...keys].sort(() => Math.random() - 0.5);
    const revealEvery = Math.max(50, Math.min(150, 2400 / keys.length));
    const spinMs = 1200;
    const start = performance.now();
    let revealed = 0;

    const tick = setInterval(() => {
      const t = performance.now() - start;
      const shouldReveal = t < spinMs ? 0 : Math.min(order.length, Math.floor((t - spinMs) / revealEvery) + 1);
      while (revealed < shouldReveal) {
        const k = order[revealed++];
        waiting.delete(k);
        const cell = cells.get(k);
        if (!cell) continue;
        cell.classList.remove('spinning');
        cell.classList.add('filled', 'reveal');
        setCellName(cell, map.get(assignment[k])?.name ?? '');
      }
      for (const k of waiting) {
        const cell = cells.get(k);
        if (cell) setCellName(cell, names[Math.floor(Math.random() * names.length)]);
      }
      fitNames($('#board'));
      if (revealed >= order.length) {
        clearInterval(tick);
        setTimeout(() => {
          busy = false;
          setBusyButtons(false);
          resolve();
        }, 500);
      }
    }, 70);
  });
}

function setBusyButtons(on) {
  ['#btn-shuffle', '#btn-shuffle-full', '#btn-commit'].forEach((s) => { $(s).disabled = on; });
}

function commitCurrent() {
  if (!state.current || state.current.committed) return;
  state.history.push({
    id: newId(),
    date: state.current.date,
    className: state.view.className || '',
    layout: structuredClone(state.layout),
    assignment: { ...state.current.assignment },
  });
  state.current.committed = true;
  persist();
  renderShuffle();
  toast('履歴に保存しました。次の席替えでは、この席を「前回」として使います。');
}

function toggleFullscreen() {
  const stage = $('#stage');
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
  } else if (stage.requestFullscreen) {
    stage.requestFullscreen().catch(() => stage.classList.toggle('pseudo-full'));
  } else {
    stage.classList.toggle('pseudo-full');
  }
}

// ---------- 名簿 ----------
function renderRoster() {
  const body = $('#roster-body');
  const list = sortStudents(state.students);
  body.replaceChildren(...list.map((s) => {
    const tr = document.createElement('tr');
    const no = document.createElement('input');
    no.type = 'number'; no.min = '1'; no.value = s.no ?? ''; no.className = 'no-input';
    no.setAttribute('aria-label', '番号');
    no.addEventListener('change', () => { s.no = Number(no.value) || null; persist(); renderRoster(); });
    const name = document.createElement('input');
    name.value = s.name; name.className = 'name-input';
    name.setAttribute('aria-label', '名前');
    name.addEventListener('change', () => { s.name = name.value.trim() || s.name; persist(); });
    const gender = document.createElement('select');
    gender.setAttribute('aria-label', '性別');
    gender.append(option('', '-'), option('M', '男'), option('F', '女'));
    gender.value = s.gender || '';
    gender.addEventListener('change', () => { s.gender = gender.value; persist(); updateRosterCount(); });
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'btn small danger subtle'; del.textContent = '削除';
    del.addEventListener('click', () => {
      if (!confirm(`${s.name}さんを名簿から削除しますか？`)) return;
      removeStudent(s.id);
      renderRoster();
    });
    const tds = [no, name, gender, del].map((el) => { const td = document.createElement('td'); td.appendChild(el); return td; });
    tr.append(...tds);
    return tr;
  }));
  updateRosterCount();
}

function updateRosterCount() {
  const boys = state.students.filter((s) => s.gender === 'M').length;
  const girls = state.students.filter((s) => s.gender === 'F').length;
  const seats = getSeats(state.layout).length;
  const n = state.students.length;
  $('#roster-count').textContent = `${n}人（男子${boys}人・女子${girls}人${n - boys - girls ? `・未設定${n - boys - girls}人` : ''}）／座席${seats}席` +
    (n > seats ? '　※座席が足りません' : '');
}

function removeStudent(id) {
  state.students = state.students.filter((s) => s.id !== id);
  const c = state.constraints;
  c.front = c.front.filter((x) => x.studentId !== id);
  c.fixed = c.fixed.filter((x) => x.studentId !== id);
  c.apart = c.apart.filter((x) => x.a !== id && x.b !== id);
  c.near = c.near.filter((x) => x.a !== id && x.b !== id);
  persist();
}

function setRoster(students, append) {
  if (!append) {
    if (state.students.length && !confirm('今の名簿を置きかえます。条件（固定・離すなど）と表示中の席もリセットされます。よろしいですか？')) return false;
    state.students = students;
    const c = state.constraints;
    c.front = []; c.fixed = []; c.apart = []; c.near = [];
    state.current = null;
  } else {
    state.students = [...state.students, ...students];
  }
  persist();
  renderRoster();
  toast(`${students.length}人を${append ? '追加' : '登録'}しました。`);
  return true;
}

function nextNo() {
  return state.students.reduce((m, s) => Math.max(m, s.no || 0), 0) + 1;
}

// ---------- 座席レイアウト ----------
function renderLayout() {
  $('#layout-rows').value = state.layout.rows;
  $('#layout-cols').value = state.layout.cols;
  const seats = getSeats(state.layout).length;
  const n = state.students.length;
  $('#layout-count').textContent = `座席${seats}席／児童${n}人` + (n > seats ? '　※座席が足りません' : n < seats ? `（${seats - n}席あまります）` : '');
  renderBoard($('#layout-board'), {
    layout: state.layout,
    mode: 'edit',
    onCell: (key) => {
      const d = new Set(state.layout.disabled);
      d.has(key) ? d.delete(key) : d.add(key);
      state.layout.disabled = [...d];
      persist();
      renderLayout();
    },
  });
}

function changeLayoutSize() {
  const clamp = (v) => Math.max(1, Math.min(12, Number(v) || 1));
  state.layout.rows = clamp($('#layout-rows').value);
  state.layout.cols = clamp($('#layout-cols').value);
  state.layout.disabled = state.layout.disabled.filter((k) => {
    const { r, c } = parseKey(k);
    return r < state.layout.rows && c < state.layout.cols;
  });
  persist();
  renderLayout();
}

// ---------- 条件 ----------
function fillStudentSelect(sel) {
  const prev = sel.value;
  sel.replaceChildren(option('', '児童をえらぶ'), ...sortStudents(state.students).map((s) => option(s.id, studentText(s))));
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
}

function fillNumberSelect(sel, max, fmt) {
  const prev = sel.value;
  sel.replaceChildren(...Array.from({ length: max }, (_, i) => option(i + 1, fmt(i + 1))));
  if (prev && Number(prev) <= max) sel.value = prev;
}

function renderRuleList(ul, items, text, onDelete) {
  ul.replaceChildren(...items.map((item, i) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = text(item);
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'btn small subtle'; del.textContent = '削除';
    del.addEventListener('click', () => onDelete(i));
    li.append(span, del);
    return li;
  }));
  if (items.length === 0) {
    const li = document.createElement('li');
    li.className = 'none';
    li.textContent = 'なし';
    ul.appendChild(li);
  }
}

function renderRules() {
  const c = state.constraints;
  $('#rule-checker').checked = c.checker;
  $('#rule-same-seat').checked = c.avoidSameSeat;
  $('#rule-same-neighbor').checked = c.avoidSameNeighbor;

  ['#front-student', '#fixed-student', '#apart-a', '#apart-b', '#near-a', '#near-b'].forEach((s) => fillStudentSelect($(s)));
  fillNumberSelect($('#front-rows'), state.layout.rows, (n) => `前から${n}列目まで`);
  fillNumberSelect($('#apart-n'), 5, (n) => String(n));
  fillNumberSelect($('#near-n'), 5, (n) => String(n));
  const fixedSeat = $('#fixed-seat');
  const prevSeat = fixedSeat.value;
  fixedSeat.replaceChildren(option('', '席をえらぶ'), ...getSeats(state.layout).map((s) => option(s.key, seatLabel(s.r, s.c))));
  fixedSeat.value = prevSeat;

  const del = (list) => (i) => { c[list].splice(i, 1); persist(); renderRules(); };
  renderRuleList($('#front-list'), c.front, (x) => `${nameOf(x.studentId)}：前から${x.rows}列目まで`, del('front'));
  renderRuleList($('#fixed-list'), c.fixed, (x) => `${nameOf(x.studentId)}：${seatLabel(x.r, x.c)}`, del('fixed'));
  renderRuleList($('#apart-list'), c.apart, (x) => `${nameOf(x.a)} と ${nameOf(x.b)}：${x.n}席以上あける`, del('apart'));
  renderRuleList($('#near-list'), c.near, (x) => `${nameOf(x.a)} と ${nameOf(x.b)}：${x.n}席以内`, del('near'));
}

function addPairRule(kind) {
  const a = $(`#${kind}-a`).value, b = $(`#${kind}-b`).value, n = Number($(`#${kind}-n`).value);
  if (!a || !b) return toast('児童を2人えらんでください。');
  if (a === b) return toast('ちがう児童をえらんでください。');
  const c = state.constraints;
  const same = (x) => (x.a === a && x.b === b) || (x.a === b && x.b === a);
  c.apart = c.apart.filter((x) => !same(x));
  c.near = c.near.filter((x) => !same(x));
  c[kind].push({ a, b, n });
  persist();
  renderRules();
}

// ---------- 履歴 ----------
function renderHistory() {
  const box = $('#history-list');
  if (state.history.length === 0) {
    const p = document.createElement('p');
    p.className = 'note';
    p.textContent = 'まだ履歴はありません。';
    box.replaceChildren(p);
    return;
  }
  const map = studentsById();
  box.replaceChildren(...[...state.history].reverse().map((h) => {
    const card = document.createElement('div');
    card.className = 'card history-item';
    const head = document.createElement('div');
    head.className = 'history-head';
    const title = document.createElement('strong');
    title.textContent = `${formatDate(h.date)}${h.className ? `　${h.className}` : ''}`;
    const show = document.createElement('button');
    show.type = 'button'; show.className = 'btn small'; show.textContent = '席替え画面に表示';
    show.addEventListener('click', () => {
      if (h.layout) state.layout = structuredClone(h.layout);
      state.current = { assignment: { ...h.assignment }, date: h.date, committed: true };
      persist();
      showMessages([]);
      showTab('shuffle');
    });
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'btn small danger subtle'; del.textContent = '削除';
    del.addEventListener('click', () => {
      if (!confirm('この履歴を削除しますか？')) return;
      state.history = state.history.filter((x) => x.id !== h.id);
      persist();
      renderHistory();
    });
    head.append(title, show, del);
    const mini = document.createElement('div');
    renderBoard(mini, { layout: h.layout || state.layout, assignment: h.assignment, studentsById: map, mode: 'mini' });
    card.append(head, mini);
    return card;
  }));
}

// ---------- イベント ----------
function bind() {
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => !busy && showTab(b.dataset.tab)));

  // 席替え
  $('#btn-shuffle').addEventListener('click', startShuffle);
  $('#btn-shuffle-full').addEventListener('click', startShuffle);
  $('#btn-commit').addEventListener('click', commitCurrent);
  $('#opt-anim').addEventListener('change', (e) => { state.view.animation = e.target.checked; persist(); });
  $('#opt-orient').addEventListener('change', (e) => { state.view.orientation = e.target.value; persist(); renderShuffle(); });
  $('#class-name').addEventListener('input', (e) => { state.view.className = e.target.value; persist(); });
  $('#btn-full').addEventListener('click', toggleFullscreen);
  $('#btn-exit-full').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    $('#stage').classList.remove('pseudo-full');
  });
  $('#btn-print').addEventListener('click', () => window.print());
  document.addEventListener('fullscreenchange', () => requestAnimationFrame(() => fitNames($('#board'))));
  window.addEventListener('resize', () => {
    clearTimeout(bind.rt);
    bind.rt = setTimeout(() => document.querySelectorAll('#board, #layout-board').forEach(fitNames), 100);
  });
  window.addEventListener('beforeprint', () => fitNames($('#board')));
  window.addEventListener('afterprint', () => fitNames($('#board')));
  document.addEventListener('keydown', (e) => {
    const inFull = document.fullscreenElement || $('#stage').classList.contains('pseudo-full');
    if (inFull && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); startShuffle(); }
    if (e.key === 'Escape') $('#stage').classList.remove('pseudo-full');
  });

  // 名簿
  $('#btn-add-student').addEventListener('click', () => {
    state.students.push({ id: newId(), no: nextNo(), name: `児童${nextNo()}`, gender: '' });
    persist();
    renderRoster();
    const inputs = document.querySelectorAll('#roster-body .name-input');
    inputs[inputs.length - 1]?.select();
  });
  $('#btn-sample').addEventListener('click', () => setRoster(sampleStudents(), false));
  $('#btn-clear-roster').addEventListener('click', () => {
    if (!state.students.length || !confirm('名簿をすべて消しますか？')) return;
    state.students = [];
    state.current = null;
    Object.assign(state.constraints, { front: [], fixed: [], apart: [], near: [] });
    persist();
    renderRoster();
  });
  const bulk = (append) => {
    const list = parseRosterText($('#bulk-input').value, append ? nextNo() : 1);
    if (!list.length) return toast('名前が入力されていません。');
    if (setRoster(list, append)) $('#bulk-input').value = '';
  };
  $('#btn-bulk-replace').addEventListener('click', () => bulk(false));
  $('#btn-bulk-append').addEventListener('click', () => bulk(true));
  $('#csv-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const buf = await file.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('shift_jis').decode(buf); // Excelの日本語CSV
    $('#bulk-input').value = text;
    toast('読み込みました。内容を確認して「名簿を置きかえる」を押してください。');
  });

  // 座席
  $('#layout-rows').addEventListener('change', changeLayoutSize);
  $('#layout-cols').addEventListener('change', changeLayoutSize);
  $('#btn-layout-reset').addEventListener('click', () => { state.layout.disabled = []; persist(); renderLayout(); });

  // 条件
  const toggle = (sel, key) => $(sel).addEventListener('change', (e) => { state.constraints[key] = e.target.checked; persist(); });
  toggle('#rule-checker', 'checker');
  toggle('#rule-same-seat', 'avoidSameSeat');
  toggle('#rule-same-neighbor', 'avoidSameNeighbor');
  $('#btn-front-add').addEventListener('click', () => {
    const id = $('#front-student').value;
    if (!id) return toast('児童をえらんでください。');
    const c = state.constraints;
    c.front = c.front.filter((x) => x.studentId !== id);
    c.front.push({ studentId: id, rows: Number($('#front-rows').value) });
    persist();
    renderRules();
  });
  $('#btn-fixed-add').addEventListener('click', () => {
    const id = $('#fixed-student').value, key = $('#fixed-seat').value;
    if (!id || !key) return toast('児童と席をえらんでください。');
    const c = state.constraints;
    const taken = c.fixed.find((x) => keyOf(x.r, x.c) === key && x.studentId !== id);
    if (taken) return toast(`その席には${nameOf(taken.studentId)}さんが固定されています。`);
    c.fixed = c.fixed.filter((x) => x.studentId !== id);
    c.fixed.push({ studentId: id, ...parseKey(key) });
    persist();
    renderRules();
  });
  $('#btn-apart-add').addEventListener('click', () => addPairRule('apart'));
  $('#btn-near-add').addEventListener('click', () => addPairRule('near'));

  // 保存
  $('#btn-export').addEventListener('click', () => downloadJSON(state));
  $('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = await readJSONFile(file);
      if (!confirm('今のデータを、ファイルの内容で置きかえます。よろしいですか？')) return;
      state = data;
      persist();
      toast('読み込みました。');
      showTab('shuffle');
    } catch {
      toast('ファイルを読み込めませんでした。');
    }
  });
  $('#btn-reset-all').addEventListener('click', () => {
    if (!confirm('すべてのデータを消します。元に戻せません。よろしいですか？')) return;
    state = defaultState();
    persist();
    showTab('roster');
  });
}

bind();
showTab(state.students.length ? 'shuffle' : 'roster');
