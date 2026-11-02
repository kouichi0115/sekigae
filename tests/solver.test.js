import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve, checkAssignment, dist, parseKey, getSeats } from '../js/solver.js';

function makeStudents(n, genders) {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`, no: i + 1, name: `児童${i + 1}`,
    gender: genders ? genders[i] : (i % 2 ? 'F' : 'M'),
  }));
}
const layout6 = { rows: 6, cols: 6, disabled: [] };
const posOf = (assignment, id) => parseKey(Object.keys(assignment).find((k) => assignment[k] === id));

test('全員が別々の有効な席に座る', () => {
  const students = makeStudents(34);
  const layout = { rows: 6, cols: 6, disabled: ['5,0', '5,5'] };
  const res = solve({ layout, students, constraints: {} });
  assert.ok(res.ok);
  const keys = Object.keys(res.assignment);
  assert.equal(keys.length, 34);
  assert.equal(new Set(Object.values(res.assignment)).size, 34);
  assert.ok(!keys.includes('5,0') && !keys.includes('5,5'));
});

test('座席が足りないとエラー', () => {
  const res = solve({ layout: { rows: 2, cols: 2, disabled: [] }, students: makeStudents(5), constraints: {} });
  assert.equal(res.ok, false);
  assert.match(res.reasons[0], /座席が足りません/);
});

test('固定席と前の方の席', () => {
  const students = makeStudents(36);
  const constraints = {
    fixed: [{ studentId: 's3', r: 2, c: 4 }],
    front: [{ studentId: 's0', rows: 1 }, { studentId: 's1', rows: 2 }],
  };
  for (let k = 0; k < 20; k++) {
    const res = solve({ layout: layout6, students, constraints });
    assert.ok(res.ok);
    assert.deepEqual(posOf(res.assignment, 's3'), { r: 2, c: 4 });
    assert.equal(posOf(res.assignment, 's0').r, 0);
    assert.ok(posOf(res.assignment, 's1').r < 2);
  }
});

test('離す（◯席以上あける）と近づける（◯席以内）', () => {
  const students = makeStudents(36);
  const constraints = {
    apart: [{ a: 's0', b: 's1', n: 3 }, { a: 's2', b: 's3', n: 1 }],
    near: [{ a: 's4', b: 's5', n: 1 }, { a: 's6', b: 's7', n: 2 }],
  };
  for (let k = 0; k < 20; k++) {
    const res = solve({ layout: layout6, students, constraints });
    assert.ok(res.ok);
    const d = (a, b) => dist(posOf(res.assignment, a), posOf(res.assignment, b));
    assert.ok(d('s0', 's1') >= 4);
    assert.ok(d('s2', 's3') >= 2);
    assert.ok(d('s4', 's5') <= 1);
    assert.ok(d('s6', 's7') <= 2);
    assert.deepEqual(checkAssignment({ layout: layout6, students, constraints, assignment: res.assignment }), []);
  }
});

test('男女交互（市松模様）', () => {
  const students = makeStudents(36);
  const res = solve({ layout: layout6, students, constraints: { checker: true } });
  assert.ok(res.ok);
  assert.deepEqual(res.warnings, []);
  const gender = new Map(students.map((s) => [s.id, s.gender]));
  for (const [key, id] of Object.entries(res.assignment)) {
    const { r, c } = parseKey(key);
    const right = res.assignment[`${r},${c + 1}`];
    if (right) assert.notEqual(gender.get(id), gender.get(right));
  }
});

test('男女の人数が合わないときは警告して配置する', () => {
  const genders = Array.from({ length: 30 }, (_, i) => (i < 20 ? 'M' : 'F'));
  const res = solve({ layout: layout6, students: makeStudents(30, genders), constraints: { checker: true } });
  assert.ok(res.ok);
  assert.equal(res.warnings.length, 1);
});

test('前回と同じ席・同じとなりを避ける', () => {
  const students = makeStudents(36);
  const prev = solve({ layout: layout6, students, constraints: {} }).assignment;
  const res = solve({ layout: layout6, students, constraints: { avoidSameSeat: true, avoidSameNeighbor: true }, prev });
  assert.ok(res.ok);
  assert.equal(res.penalty, 0);
  for (const [key, id] of Object.entries(res.assignment)) assert.notEqual(prev[key], id);
});

test('できない条件は原因を教える', () => {
  const students = makeStudents(4);
  const layout = { rows: 2, cols: 2, disabled: [] };
  const res = solve({ layout, students, constraints: { apart: [{ a: 's0', b: 's1', n: 1 }] } });
  assert.equal(res.ok, false);
  assert.ok(res.reasons.some((r) => r.includes('離す')));

  const res2 = solve({ layout: layout6, students: makeStudents(10), constraints: {
    fixed: [{ studentId: 's0', r: 0, c: 0 }, { studentId: 's1', r: 0, c: 0 }],
  } });
  assert.equal(res2.ok, false);
  assert.match(res2.reasons[0], /同じ席に固定/);
});

test('getSeats は空席を除く', () => {
  assert.equal(getSeats({ rows: 3, cols: 3, disabled: ['1,1'] }).length, 8);
});
