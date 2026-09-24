'use strict';

const { reduce, mul, relError, cmp, toDecimal } = require('./fraction');

const MAX_STAGES = 3;
const RESULT_LIMIT = 200;

// 编号自然序：数字段按数值比较，其余按码点比较。
// 因此 2 < 10，G2 < G10，数字与非数字混排时数字段在前。
function idCmp(a, b) {
  const sa = String(a);
  const sb = String(b);
  let i = 0;
  let j = 0;
  while (i < sa.length && j < sb.length) {
    const da = sa[i] >= '0' && sa[i] <= '9';
    const db = sb[j] >= '0' && sb[j] <= '9';
    if (da && db) {
      // 取连续数字段，按数值比较（先比位数去除前导零干扰）
      let ia = i;
      while (ia < sa.length && sa[ia] >= '0' && sa[ia] <= '9') ia++;
      let jb = j;
      while (jb < sb.length && sb[jb] >= '0' && sb[jb] <= '9') jb++;
      const na = sa.slice(i, ia).replace(/^0+(?=\d)/, '');
      const nb = sb.slice(j, jb).replace(/^0+(?=\d)/, '');
      if (na.length !== nb.length) return na.length < nb.length ? -1 : 1;
      if (na !== nb) return na < nb ? -1 : 1;
      // 数值相同（前导零不同）时继续比较后续段
      i = ia;
      j = jb;
    } else {
      if (da !== db) return da ? -1 : 1; // 数字段排在非数字段前
      if (sa[i] !== sb[j]) return sa[i] < sb[j] ? -1 : 1;
      i++;
      j++;
    }
  }
  if (i === sa.length && j === sb.length) return 0;
  return i === sa.length ? -1 : 1;
}

// 齿轮编号序列字典序比较
function seqCmp(x, y) {
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const c = idCmp(x[i], y[i]);
    if (c !== 0) return c;
  }
  return x.length - y.length;
}

/**
 * 在 1~3 级传动内枚举选配方案。
 *
 * 枚举去重：每级传动的实际顺序不影响总传动比，因此强制“当前未用齿轮中
 * 编号最小者”要么与某枚齿轮配对，要么永久跳过。这样每个物理方案只被
 * 枚举一次（消除级间排列、级内顺序造成的重复）。
 *
 * @param {Array<{id:string|number, teeth:number}>} gears
 * @param {{n:bigint,d:bigint}} target 目标输出转速比（约分分数）
 * @param {{n:bigint,d:bigint}} tol    允许相对误差（小数形式的分数）
 */
function search(gears, target, tol) {
  const start = process.hrtime.bigint();

  // 按编号排序，保证锚点规则确定
  const sorted = [...gears].sort((a, b) => idCmp(a.id, b.id));
  const n = sorted.length;
  const teeth = sorted.map((g) => BigInt(g.teeth));

  // 预计算每对齿轮两个方向的约分传动比 ratio[i][j] = teeth[i]/teeth[j]
  const ratioIJ = Array.from({ length: n }, () => Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) ratioIJ[i][j] = reduce(teeth[i], teeth[j]);
    }
  }

  let evaluated = 0;
  const feasible = []; // 轻量方案：{k, pairs:[[d,p],...], actual, error}
  let best = null; // 误差最小但未达标方案（参考）

  const idOf = (i) => sorted[i].id;

  // 轻量方案比较：级数 → 误差 → 所用齿轮编号有序序列 → 规范配对序列
  const cmpSolution = (a, b) => {
    if (a.k !== b.k) return a.k - b.k;
    const ec = cmp(a.error, b.error);
    if (ec !== 0) return ec;
    const ka = keysOf(a.pairs);
    const kb = keysOf(b.pairs);
    const c1 = seqCmp(ka.used, kb.used);
    if (c1 !== 0) return c1;
    return seqCmp(ka.pairing, kb.pairing);
  };

  function keysOf(pairs) {
    const idPairs = pairs.map(([d, p]) => [idOf(d), idOf(p)]);
    const used = idPairs.flat().sort(idCmp);
    const pairing = idPairs.map((s) => s.slice()).sort((x, y) => seqCmp(x, y)).flat();
    return { used, pairing };
  }

  // 仅比较编号并列键（误差、级数已相等时使用）
  function cmpPairs(pa, pb) {
    const ka = keysOf(pa);
    const kb = keysOf(pb);
    const c1 = seqCmp(ka.used, kb.used);
    if (c1 !== 0) return c1;
    return seqCmp(ka.pairing, kb.pairing);
  }

  function snapshotPairs(pairs, k) {
    const snap = new Array(k);
    for (let i = 0; i < k; i++) snap[i] = [pairs[i][0], pairs[i][1]];
    return snap;
  }

  function consider(pairs, k, ratio, err) {
    evaluated += 1;
    // 相对误差 <= 容差（交叉相乘，全程精确）：err.n/err.d <= tol.n/tol.d
    const within = err.n * tol.d <= err.d * tol.n;
    if (within) {
      feasible.push({ k, pairs: snapshotPairs(pairs, k), actual: ratio, error: err });
      return;
    }
    if (!best || cmp(err, best.error) < 0 ||
      (cmp(err, best.error) === 0 &&
        (k < best.k || (k === best.k && cmpPairs(pairs.slice(0, k), best.pairs) < 0)))) {
      // 仅保留误差最小（并列时排序最前）的一个参考方案
      best = { k, pairs: snapshotPairs(pairs, k), actual: ratio, error: err };
    }
  }

  // unused: 剩余齿轮下标（按编号升序）；pairs: 已选 [driverIdx, drivenIdx]
  function dfs(unused, pairs, k, ratio) {
    if (k >= MAX_STAGES || unused.length < 2) return;

    // 选择一：锚点齿轮不参与本方案
    dfs(unused.subarray(1), pairs, k, ratio);

    // 选择二：锚点齿轮与另一枚齿轮配成一级（两种主/从方向）
    const anchor = unused[0];
    const rest = unused.subarray(1);
    const nextK = k + 1;
    for (let p = 0; p < rest.length; p++) {
      const partner = rest[p];
      // 从 rest 中删去 partner，构造下一层未用下标数组
      const remaining = new Int32Array(rest.length - 1);
      remaining.set(rest.subarray(0, p));
      remaining.set(rest.subarray(p + 1), p);

      pairs[k] = [anchor, partner];
      const r1 = mul(ratio, ratioIJ[anchor][partner]);
      consider(pairs, nextK, r1, relError(r1, target));
      dfs(remaining, pairs, nextK, r1);

      pairs[k] = [partner, anchor];
      const r2 = mul(ratio, ratioIJ[partner][anchor]);
      consider(pairs, nextK, r2, relError(r2, target));
      dfs(remaining, pairs, nextK, r2);
    }
  }

  dfs(Int32Array.from({ length: n }, (_, i) => i), new Array(MAX_STAGES), 0, { n: 1n, d: 1n });

  // 排序：级数最少 → 误差最小 → 所用齿轮编号序列 → 各级配对序列
  feasible.sort(cmpSolution);

  const totalFeasible = feasible.length;
  const shown = feasible.slice(0, RESULT_LIMIT).map((it) => serialize(it, sorted));

  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

  return {
    totalFeasible,
    shownCount: shown.length,
    resultLimit: RESULT_LIMIT,
    evaluated,
    elapsedMs: Math.round(elapsedMs * 100) / 100,
    solutions: shown,
    closest: totalFeasible === 0 && best ? serialize(best, sorted) : null,
  };
}

function serialize(item, sorted) {
  const stages = item.pairs.map(([di, pi]) => {
    const driver = sorted[di];
    const driven = sorted[pi];
    const stageRatio = reduce(BigInt(driver.teeth), BigInt(driven.teeth));
    return {
      driver: { id: driver.id, teeth: driver.teeth },
      driven: { id: driven.id, teeth: driven.teeth },
      stageRatio: { n: Number(stageRatio.n), d: Number(stageRatio.d) },
      stageRatioText: `${stageRatio.n}/${stageRatio.d}`,
    };
  });
  return {
    stagesCount: item.k,
    stages,
    actual: { n: Number(item.actual.n), d: Number(item.actual.d) },
    actualText: `${item.actual.n}/${item.actual.d}`,
    actualDecimal: toDecimal(item.actual, 10),
    error: { n: Number(item.error.n), d: Number(item.error.d) },
    errorText: `${item.error.n}/${item.error.d}`,
    errorPercent: toDecimal(mul(item.error, { n: 100n, d: 1n }), 6),
  };
}

module.exports = { search, idCmp };
