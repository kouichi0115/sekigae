// 座席表の描画（席替え画面・レイアウト編集・履歴で共通）
import { keyOf } from './solver.js';

/**
 * @param {HTMLElement} container
 * @param {object} opt
 *   layout, assignment({key:id}), studentsById(Map), orientation('students'|'teacher'),
 *   mode('seats'|'edit'|'mini'), selected(key), onCell(key)
 */
export function renderBoard(container, opt) {
  const { layout, assignment = {}, studentsById = new Map(), orientation = 'students', mode = 'seats', selected = null, onCell } = opt;
  const disabled = new Set(layout.disabled || []);
  const teacher = orientation === 'teacher';

  const board = document.createElement('div');
  board.className = `board board-${mode} ${teacher ? 'from-teacher' : 'from-students'}`;

  const front = document.createElement('div');
  front.className = 'front-bar';
  front.textContent = teacher ? '教卓（先生）' : '黒板・教卓';

  const grid = document.createElement('div');
  grid.className = 'grid';
  grid.style.setProperty('--cols', layout.cols);
  grid.style.setProperty('--rows', layout.rows);

  // 先生から見た向きは上下・左右が反対になる
  const rows = [...Array(layout.rows).keys()];
  const cols = [...Array(layout.cols).keys()];
  if (teacher) { rows.reverse(); cols.reverse(); }

  for (const r of rows) {
    for (const c of cols) {
      const key = keyOf(r, c);
      const off = disabled.has(key);
      const cell = document.createElement(onCell ? 'button' : 'div');
      if (onCell) cell.type = 'button';
      cell.className = 'seat';
      cell.dataset.key = key;
      if (off) cell.classList.add('off');
      if (key === selected) cell.classList.add('selected');

      if (mode === 'edit') {
        cell.textContent = off ? '×' : '';
        cell.title = off ? 'つかわない席（タップで戻す）' : 'タップで「つかわない席」にする';
      } else if (!off) {
        const st = studentsById.get(assignment[key]);
        if (st) {
          cell.classList.add('filled');
          if (mode !== 'mini') {
            const no = document.createElement('span');
            no.className = 'no';
            no.textContent = st.no ?? '';
            cell.appendChild(no);
          }
          const name = document.createElement('span');
          name.className = 'name';
          name.textContent = st.name;
          cell.appendChild(name);
        } else {
          cell.classList.add('empty');
        }
      }
      if (onCell && !(off && mode !== 'edit')) cell.addEventListener('click', () => onCell(key));
      if (off && mode !== 'edit' && onCell) cell.disabled = true;
      grid.appendChild(cell);
    }
  }

  if (teacher) board.append(grid, front);
  else board.append(front, grid);
  container.replaceChildren(board);
  if (mode !== 'mini') requestAnimationFrame(() => fitNames(container));
  return board;
}

// 名前がマスに収まる一番大きな文字サイズにする
export function fitNames(container) {
  const cells = container.querySelectorAll('.seat');
  for (const cell of cells) {
    const name = cell.querySelector('.name');
    if (!name) continue;
    const availW = cell.clientWidth * 0.9;
    const availH = cell.clientHeight * 0.5;
    if (availW <= 0) continue;
    name.style.fontSize = '100px';
    const w = name.scrollWidth || 1;
    const size = Math.max(10, Math.min(availH, (100 * availW) / w));
    name.style.fontSize = `${Math.floor(size)}px`;
  }
}

export function setCellName(cell, text) {
  let name = cell.querySelector('.name');
  if (!name) {
    name = document.createElement('span');
    name.className = 'name';
    cell.appendChild(name);
  }
  name.textContent = text;
}
