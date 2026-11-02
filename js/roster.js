// 名簿の読み込み・編集まわり

export function newId() {
  return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function parseGender(text) {
  const t = String(text || '').trim().toLowerCase();
  if (['男', '男子', 'm', 'male', 'boy', '♂'].includes(t)) return 'M';
  if (['女', '女子', 'f', 'female', 'girl', '♀'].includes(t)) return 'F';
  return '';
}

export const genderLabel = (g) => (g === 'M' ? '男' : g === 'F' ? '女' : '-');

/**
 * 1行に「番号,名前,性別」（カンマ・タブ区切り）。番号と性別は省略できる。
 * 例: 「1,山田 太郎,男」「山田 花子	女」「佐藤 一郎」
 */
export function parseRosterText(text, startNo = 1) {
  const out = [];
  let no = startNo;
  for (const line of String(text).split(/\r?\n/)) {
    const cols = line.split(/[,\t，、]/).map((s) => s.trim().replace(/^"|"$/g, '')).filter((s) => s !== '');
    if (cols.length === 0) continue;
    if (cols.some((c) => /名前|氏名/.test(c))) continue; // 見出し行
    let num = null;
    if (/^\d+$/.test(cols[0])) num = Number(cols.shift());
    if (cols.length === 0) continue;
    let gender = '';
    if (cols.length >= 2 && parseGender(cols[cols.length - 1])) gender = parseGender(cols.pop());
    const name = cols.join(' ');
    out.push({ id: newId(), no: num ?? no, name, gender });
    no = (num ?? no) + 1;
  }
  return out;
}

export function sortStudents(students) {
  return [...students].sort((a, b) => (a.no || 0) - (b.no || 0));
}

export function sampleStudents() {
  const boys = ['青木 大翔', '石井 蓮', '上田 陽翔', '遠藤 湊', '岡田 悠真', '加藤 樹', '木村 颯', '小林 律', '斎藤 蒼', '佐藤 大和', '鈴木 朝陽', '高橋 新', '田中 陸', '中村 結翔', '山本 優斗'];
  const girls = ['阿部 陽葵', '井上 凛', '内田 結菜', '江口 芽依', '大野 紬', '金子 葵', '菊地 澪', '工藤 結衣', '近藤 咲良', '清水 心春', '杉山 莉子', '谷口 美桜', '中島 杏', '橋本 さくら', '松本 ひなた'];
  const all = [...boys.map((n) => [n, 'M']), ...girls.map((n) => [n, 'F'])];
  all.sort((a, b) => a[0].localeCompare(b[0], 'ja'));
  return all.map(([name, gender], i) => ({ id: newId(), no: i + 1, name, gender }));
}
