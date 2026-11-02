// データはこの端末のブラウザ（localStorage）にだけ保存する
const KEY = 'sekigae-v1';

export function defaultState() {
  return {
    students: [],
    layout: { rows: 6, cols: 6, disabled: [] },
    constraints: {
      checker: false,
      avoidSameSeat: true,
      avoidSameNeighbor: true,
      front: [],
      fixed: [],
      apart: [],
      near: [],
    },
    history: [],
    current: null,
    view: { orientation: 'students', animation: true, className: '' },
  };
}

// 足りない項目を初期値で補う（古いデータや読み込んだファイル用）
export function normalize(data) {
  const base = defaultState();
  if (!data || typeof data !== 'object') return base;
  return {
    students: Array.isArray(data.students) ? data.students : base.students,
    layout: { ...base.layout, ...(data.layout || {}) },
    constraints: { ...base.constraints, ...(data.constraints || {}) },
    history: Array.isArray(data.history) ? data.history : base.history,
    current: data.current && typeof data.current === 'object' ? data.current : null,
    view: { ...base.view, ...(data.view || {}) },
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : defaultState();
  } catch {
    return defaultState();
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function downloadJSON(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  a.href = URL.createObjectURL(blob);
  a.download = `sekigae-backup-${ymd}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function readJSONFile(file) {
  const text = await file.text();
  return normalize(JSON.parse(text));
}
