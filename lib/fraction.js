'use strict';

// 使用原生 BigInt 进行精确分数运算，避免浮点误差影响选配结果。

function gcdBig(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a;
}

function reduce(n, d) {
  if (d === 0n) throw new Error('分母为零');
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcdBig(n, d);
  return { n: n / g, d: d / g };
}

// 解析单个非负十进制数字块，如 "1"、"1.5"、".25"、"3."
function parseDigits(token) {
  if (!/^\d*\.?\d*$/.test(token)) {
    throw new Error(`无法解析的数字: "${token}"`);
  }
  if (token === '' || token === '.') {
    throw new Error('空数字');
  }
  const dot = token.indexOf('.');
  let intPart;
  let fracPart;
  if (dot === -1) {
    intPart = token;
    fracPart = '';
  } else {
    intPart = token.slice(0, dot);
    fracPart = token.slice(dot + 1);
  }
  const digits = (intPart || '0') + fracPart;
  return {
    n: BigInt(digits),
    d: 10n ** BigInt(fracPart.length),
  };
}

// 解析正有理数: 支持 "1.5"、"3/2"、"3:2"；不允许科学计数法、负数、零。
function parsePositive(raw) {
  if (typeof raw !== 'string') throw new Error('目标值必须是字符串');
  let s = raw.trim();
  if (s === '') throw new Error('数值为空');
  if (/[eE]/.test(s)) throw new Error('不支持科学计数法，请直接输入小数或分数');

  if (s.startsWith('-') || s.startsWith('+')) {
    throw new Error('转速比必须为正数');
  }
  if (s.charCodeAt(0) === 0x2212 || s.includes('−')) {
    throw new Error('转速比必须为正数');
  }

  s = s.replace('：', ':');
  const slashCount = (s.match(/\//g) || []).length;
  const colonCount = (s.match(/:/g) || []).length;
  if (slashCount > 1 || colonCount > 1 || (slashCount && colonCount)) {
    throw new Error('分数格式应为 a/b 或 a:b');
  }
  const sep = slashCount ? '/' : colonCount ? ':' : null;
  if (!sep) {
    const v = parseDigits(s);
    if (v.n === 0n) throw new Error('转速比必须大于零');
    return reduce(v.n, v.d);
  }
  const [topRaw, bottomRaw] = s.split(sep);
  const top = parseDigits(topRaw.trim());
  const bottom = parseDigits(bottomRaw.trim());
  if (bottom.n === 0n) throw new Error('分数分母不能为零');
  if (top.n === 0n) throw new Error('转速比必须大于零');
  return reduce(top.n * bottom.d, top.d * bottom.n);
}

// 解析误差限：输入统一按百分数解释（"2" 与 "2%" 均为 2% = 1/50）
function parsePercent(raw) {
  if (typeof raw !== 'string') throw new Error('误差必须是字符串');
  let s = raw.trim();
  if (s === '') throw new Error('误差为空');
  if (/[eE]/.test(s)) throw new Error('不支持科学计数法，请直接输入小数');
  if (s.startsWith('-')) throw new Error('误差不能为负');

  const percent = s.endsWith('%');
  if (percent) s = s.slice(0, -1).trim();
  const v = parseDigits(s); // 输入数值本身 = v.n / v.d
  // 转成小数形式：除以 100（带不带 % 语义相同，输入框统一为百分数）
  return reduce(v.n, v.d * 100n);
}

function mul(a, b) {
  return reduce(a.n * b.n, a.d * b.d);
}

function div(a, b) {
  return reduce(a.n * b.d, a.d * b.n);
}

// |a/b - c/d| / (c/d) = |ad - bc| / (bc)，返回约分后的非负分数
function relError(actual, target) {
  const lhs = actual.n * target.d;
  const rhs = actual.d * target.n;
  const diff = lhs >= rhs ? lhs - rhs : rhs - lhs;
  return reduce(diff, actual.d * target.n);
}

// 比较两个正分数: -1 / 0 / 1
function cmp(a, b) {
  const lhs = a.n * b.d;
  const rhs = a.d * b.n;
  if (lhs < rhs) return -1;
  if (lhs > rhs) return 1;
  return 0;
}

// 分数转十进制字符串，保留 decimals 位小数，四舍五入（round half up），去掉多余的 0
function toDecimal(f, decimals) {
  const r = reduce(f.n, f.d);
  const scale = 10n ** BigInt(decimals);
  const scaled = r.n * scale;
  let q = scaled / r.d;
  const rem = scaled % r.d;
  if (rem * 2n >= r.d) q += 1n; // half-up
  let whole = q / scale;
  let frac = (q % scale).toString().padStart(decimals, '0');
  frac = frac.replace(/0+$/, '');
  return frac === '' ? `${whole}` : `${whole}.${frac}`;
}

module.exports = {
  reduce,
  parsePositive,
  parsePercent,
  mul,
  div,
  relError,
  cmp,
  toDecimal,
};
