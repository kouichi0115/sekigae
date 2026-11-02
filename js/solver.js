// 席替えの計算（画面に依存しない純粋な処理）
// 座標: r = 前から何列目(0始まり), c = 児童から見て左から何番目(0始まり)

export const keyOf = (r, c) => `${r},${c}`;

export function parseKey(key) {
  const [r, c] = key.split(',').map(Number);
  return { r, c };
}

// 前後左右ななめを1とした席の距離
export function dist(a, b) {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c));
}

export function getSeats(layout) {
  const disabled = new Set(layout.disabled || []);
  const seats = [];
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      const key = keyOf(r, c);
      if (!disabled.has(key)) seats.push({ r, c, key });
    }
  }
  return seats;
}

export function seatLabel(r, c) {
  return `前から${r + 1}列目・左から${c + 1}番目`;
}

const W_SAME_SEAT = 10;
const W_SAME_NEIGHBOR = 5;
const W_CHECKER = 50;

function shuffle(arr, random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function emptyConstraints() {
  return { checker: false, avoidSameSeat: false, avoidSameNeighbor: false, front: [], fixed: [], apart: [], near: [] };
}

// 前回となり同士（同じ列で左右に並んでいた）ペアの集合
function neighborPairsOf(assignment) {
  const pairs = new Set();
  if (!assignment) return pairs;
  for (const [key, id] of Object.entries(assignment)) {
    const { r, c } = parseKey(key);
    const right = assignment[keyOf(r, c + 1)];
    if (right) pairs.add([id, right].sort().join('|'));
  }
  return pairs;
}

// 問題を内部表現に変換する。致命的な問題があれば errors に入れる
function buildContext({ layout, students, constraints, prev }) {
  const cons = { ...emptyConstraints(), ...(constraints || {}) };
  const seats = getSeats(layout);
  const errors = [];
  const n = students.length;
  const idx = new Map(students.map((s, i) => [s.id, i]));
  const seatIdx = new Map(seats.map((s, i) => [s.key, i]));
  const nameOf = (id) => students[idx.get(id)]?.name || '（不明）';

  if (n > seats.length) {
    errors.push(`座席が足りません（児童${n}人・座席${seats.length}席）。座席レイアウトで席を増やしてください。`);
  }

  const all = seats.map((_, i) => i);
  const domains = students.map(() => new Set(all));
  const restrict = (i, allowed) => {
    for (const s of [...domains[i]]) if (!allowed(seats[s])) domains[i].delete(s);
  };

  const fixedSeatOwner = new Map();
  for (const f of cons.fixed) {
    const i = idx.get(f.studentId);
    if (i === undefined) continue;
    const key = keyOf(f.r, f.c);
    if (!seatIdx.has(key)) {
      errors.push(`${nameOf(f.studentId)}さんの固定席（${seatLabel(f.r, f.c)}）は使えない席です。`);
      continue;
    }
    if (fixedSeatOwner.has(key) && fixedSeatOwner.get(key) !== f.studentId) {
      errors.push(`${nameOf(fixedSeatOwner.get(key))}さんと${nameOf(f.studentId)}さんが同じ席に固定されています。`);
    }
    fixedSeatOwner.set(key, f.studentId);
    restrict(i, (s) => s.key === key);
  }
  for (const f of cons.front) {
    const i = idx.get(f.studentId);
    if (i === undefined) continue;
    restrict(i, (s) => s.r < f.rows);
  }

  // 2人の距離の条件
  const pairs = students.map(() => []);
  const addPair = (a, b, ok) => {
    const i = idx.get(a), j = idx.get(b);
    if (i === undefined || j === undefined || i === j) return;
    pairs[i].push({ j, ok });
    pairs[j].push({ j: i, ok });
  };
  for (const p of cons.apart) addPair(p.a, p.b, (d) => d >= p.n + 1);
  for (const p of cons.near) addPair(p.a, p.b, (d) => d <= p.n);

  // 男女交互（市松模様）
  const warnings = [];
  let checkerOptions = [null]; // null = 交互なし
  let checkerSoft = false;
  if (cons.checker) {
    const color = (s) => (s.r + s.c) % 2;
    const boys = students.filter((s) => s.gender === 'M').length;
    const girls = students.filter((s) => s.gender === 'F').length;
    const cnt = [0, 0];
    for (const s of seats) cnt[color(s)]++;
    const fits = [0, 1].filter((o) => boys <= cnt[o] && girls <= cnt[1 - o]);
    if (fits.length > 0) {
      checkerOptions = fits;
    } else {
      checkerSoft = true;
      const over = (o) => Math.max(0, boys - cnt[o]) + Math.max(0, girls - cnt[1 - o]);
      checkerOptions = [over(0) <= over(1) ? 0 : 1];
      warnings.push('男女の人数と座席の数が合わないため、一部は男女交互になりません。');
    }
  }

  const prevSeat = new Map();
  if (prev) for (const [key, id] of Object.entries(prev)) prevSeat.set(id, key);
  const prevNeighbors = neighborPairsOf(prev);

  return { seats, students, n, domains, pairs, cons, errors, warnings, checkerOptions, checkerSoft, prevSeat, prevNeighbors, nameOf };
}

// 男女交互の向き o を反映した、各児童の座れる席
function domainsWithChecker(ctx, o) {
  if (o === null || ctx.checkerSoft) return ctx.domains.map((d) => [...d]);
  return ctx.students.map((st, i) => {
    const d = [...ctx.domains[i]];
    if (st.gender === 'M') return d.filter((s) => (ctx.seats[s].r + ctx.seats[s].c) % 2 === o);
    if (st.gender === 'F') return d.filter((s) => (ctx.seats[s].r + ctx.seats[s].c) % 2 !== o);
    return d;
  });
}

const LIMIT = Symbol('limit');

// 条件をすべて満たす配置を1つ探す（見つからなければ null）
function backtrack(ctx, domains, random, nodeLimit) {
  const { n, seats, pairs } = ctx;
  const pos = new Array(n).fill(-1);
  const used = new Array(seats.length).fill(false);
  const order = shuffle([...Array(n).keys()], random);
  let nodes = 0;

  const pairOk = (i, s) => {
    for (const { j, ok } of pairs[i]) {
      if (pos[j] >= 0 && !ok(dist(seats[s], seats[pos[j]]))) return false;
    }
    return true;
  };
  const candidates = (i) => domains[i].filter((s) => !used[s] && pairOk(i, s));

  const rec = (placed) => {
    if (placed === n) return true;
    if (++nodes > nodeLimit) throw LIMIT;
    // 座れる席が一番少ない児童から決める
    let best = -1, bestC = null;
    for (const i of order) {
      if (pos[i] >= 0) continue;
      const c = candidates(i);
      if (c.length === 0) return false;
      if (!bestC || c.length < bestC.length) { best = i; bestC = c; }
    }
    for (const s of shuffle(bestC, random)) {
      pos[best] = s; used[s] = true;
      if (rec(placed + 1)) return true;
      pos[best] = -1; used[s] = false;
    }
    return false;
  };

  try {
    return rec(0) ? pos : null;
  } catch (e) {
    if (e === LIMIT) return null;
    throw e;
  }
}

function penaltyOf(ctx, pos, o) {
  const { seats, students, cons } = ctx;
  let p = 0;
  if (cons.avoidSameSeat && ctx.prevSeat.size) {
    students.forEach((st, i) => { if (ctx.prevSeat.get(st.id) === seats[pos[i]].key) p += W_SAME_SEAT; });
  }
  if (cons.avoidSameNeighbor && ctx.prevNeighbors.size) {
    const at = new Map();
    pos.forEach((s, i) => at.set(seats[s].key, students[i].id));
    for (const [key, id] of at) {
      const { r, c } = parseKey(key);
      const right = at.get(keyOf(r, c + 1));
      if (right && ctx.prevNeighbors.has([id, right].sort().join('|'))) p += W_SAME_NEIGHBOR;
    }
  }
  if (ctx.checkerSoft && o !== null) {
    students.forEach((st, i) => {
      const col = (seats[pos[i]].r + seats[pos[i]].c) % 2;
      if ((st.gender === 'M' && col !== o) || (st.gender === 'F' && col === o)) p += W_CHECKER;
    });
  }
  return p;
}

// 条件を守ったまま入れ替えて、ペナルティ（前回と同じ席など）を減らす
function improve(ctx, domains, pos, o, random, iterations) {
  const { n, seats, pairs } = ctx;
  const domSets = domains.map((d) => new Set(d));
  const owner = new Array(seats.length).fill(-1);
  pos.forEach((s, i) => { owner[s] = i; });
  let cur = penaltyOf(ctx, pos, o);

  const okAt = (i, s) => {
    if (!domSets[i].has(s)) return false;
    for (const { j, ok } of pairs[i]) if (!ok(dist(seats[s], seats[pos[j]]))) return false;
    return true;
  };

  for (let it = 0; it < iterations && cur > 0; it++) {
    const i = Math.floor(random() * n);
    const dom = domains[i];
    const s = dom[Math.floor(random() * dom.length)];
    const from = pos[i];
    if (s === from) continue;
    const j = owner[s];
    pos[i] = s;
    if (j >= 0) pos[j] = from;
    if (okAt(i, s) && (j < 0 || okAt(j, from))) {
      const next = penaltyOf(ctx, pos, o);
      if (next <= cur) {
        cur = next;
        owner[s] = i; owner[from] = j;
        continue;
      }
    }
    pos[i] = from;
    if (j >= 0) pos[j] = s;
  }
  return cur;
}

function toAssignment(ctx, pos) {
  const out = {};
  pos.forEach((s, i) => { out[ctx.seats[s].key] = ctx.students[i].id; });
  return out;
}

function search(ctx, random, timeLimitMs) {
  const start = Date.now();
  let best = null;
  let attempts = 0;
  while (attempts < 3 || Date.now() - start < timeLimitMs) {
    attempts++;
    const o = ctx.checkerOptions[Math.floor(random() * ctx.checkerOptions.length)];
    const domains = domainsWithChecker(ctx, o);
    const pos = backtrack(ctx, domains, random, 4000);
    if (pos) {
      const penalty = improve(ctx, domains, pos, o, random, 4000);
      if (!best || penalty < best.penalty) best = { pos: [...pos], penalty };
      if (penalty === 0) break;
    }
    if (attempts > 2000) break;
  }
  return best;
}

// どの条件が原因で配置できないかを調べる
function diagnose(input, random) {
  const cons = { ...emptyConstraints(), ...(input.constraints || {}) };
  const reasons = [];
  const groups = [
    ['fixed', '「席を固定」'],
    ['front', '「前の方の席」'],
    ['apart', '「離す」'],
    ['near', '「近づける」'],
    ['checker', '「男女交互」'],
  ];
  const ctx0 = buildContext(input);
  ctx0.students.forEach((st, i) => {
    if (ctx0.domains[i].size === 0) reasons.push(`${st.name}さんが座れる席がありません（固定席・前の方の席の条件を確認してください）。`);
  });
  for (const [g, label] of groups) {
    const v = cons[g];
    if (!v || (Array.isArray(v) && v.length === 0)) continue;
    const relaxed = { ...cons, [g]: Array.isArray(v) ? [] : false };
    const ctx = buildContext({ ...input, constraints: relaxed });
    if (ctx.errors.length) continue;
    if (search(ctx, random, 150)) reasons.push(`${label}の条件をゆるめると席替えできます。`);
  }
  if (reasons.length === 0) reasons.push('条件が多すぎて席替えできません。条件をいくつか減らしてください。');
  return reasons;
}

/**
 * 席替えを実行する
 * @returns {{ok:true, assignment:Object, penalty:number, warnings:string[]} | {ok:false, reasons:string[]}}
 */
export function solve(input, { timeLimitMs = 400, random = Math.random } = {}) {
  const ctx = buildContext(input);
  if (ctx.errors.length) return { ok: false, reasons: ctx.errors };
  const best = search(ctx, random, timeLimitMs);
  if (!best) return { ok: false, reasons: diagnose(input, random) };
  const warnings = [...ctx.warnings];
  if (best.penalty > 0 && (ctx.cons.avoidSameSeat || ctx.cons.avoidSameNeighbor)) {
    warnings.push('条件の都合で、一部の児童が前回と同じ席・同じとなりになっています。');
  }
  return { ok: true, assignment: toAssignment(ctx, best.pos), penalty: best.penalty, warnings };
}

// 手で入れ替えたあとなどに、守れていない条件を一覧にする
export function checkAssignment({ layout, students, constraints, assignment }) {
  const cons = { ...emptyConstraints(), ...(constraints || {}) };
  const where = new Map();
  for (const [key, id] of Object.entries(assignment || {})) where.set(id, parseKey(key));
  const byId = new Map(students.map((s) => [s.id, s]));
  const name = (id) => byId.get(id)?.name || '（不明）';
  const out = [];
  for (const f of cons.fixed) {
    const p = where.get(f.studentId);
    if (p && (p.r !== f.r || p.c !== f.c)) out.push(`${name(f.studentId)}さんが固定席にいません。`);
  }
  for (const f of cons.front) {
    const p = where.get(f.studentId);
    if (p && p.r >= f.rows) out.push(`${name(f.studentId)}さんが前から${f.rows}列目より後ろです。`);
  }
  for (const pr of cons.apart) {
    const a = where.get(pr.a), b = where.get(pr.b);
    if (a && b && dist(a, b) < pr.n + 1) out.push(`${name(pr.a)}さんと${name(pr.b)}さんが近すぎます（${pr.n}席以上あける）。`);
  }
  for (const pr of cons.near) {
    const a = where.get(pr.a), b = where.get(pr.b);
    if (a && b && dist(a, b) > pr.n) out.push(`${name(pr.a)}さんと${name(pr.b)}さんが離れすぎています（${pr.n}席以内）。`);
  }
  for (const st of students) if (!where.has(st.id)) out.push(`${st.name}さんの席がありません。`);
  return out;
}
