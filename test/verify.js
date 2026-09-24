'use strict';

// 独立暴力穷举校验：用“有序排列 + 两两成级”的朴素方式枚举全部方案，
// 与 search.js 的锚点枚举结果交叉比对（物理方案集合、最优排序）。
// 仅用于开发验证，不参与运行时。

const assert = require('assert');
const { search, idCmp } = require('../lib/search');
const { parsePositive, parsePercent, mul, reduce, relError, cmp } = require('../lib/fraction');

function bruteForce(gears, target, tol) {
  // 物理方案的规范形：每一级为 {pair: [小id, 大id], reversed: bool}，
  // 集合按 pair 排序，消除级间顺序重复。
  const seen = new Map(); // canon -> {ratio, err, stagesCount, seq}

  const ids = gears.map((g) => g.id);
  const teethOf = new Map(gears.map((g) => [g.id, BigInt(g.teeth)]));

  function canon(stages) {
    return stages
      .map(([d, p]) => {
        const pair = idCmp(d, p) < 0 ? [d, p] : [p, d];
        return { pair, reversed: idCmp(d, p) > 0 };
      })
      .sort((a, b) => idCmp(a.pair[0], b.pair[0]) || idCmp(a.pair[1], b.pair[1]))
      .map((x) => `${x.pair[0]}${x.reversed ? '<' : '>'}${x.pair[1]}`)
      .join(',');
  }

  function evaluate(stages) {
    let ratio = { n: 1n, d: 1n };
    for (const [d, p] of stages) ratio = mul(ratio, reduce(teethOf.get(d), teethOf.get(p)));
    const err = relError(ratio, target);
    const key = canon(stages);
    const within = err.n * tol.d <= err.d * tol.n;
    const seq = stages.flat();
    const cur = seen.get(key);
    if (!cur) seen.set(key, { ratio, err, within, stagesCount: stages.length, seq });
  }

  function permutations(arr) {
    if (arr.length <= 1) return [arr.slice()];
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const rest = arr.slice(0, i).concat(arr.slice(i + 1));
      for (const p of permutations(rest)) out.push([arr[i], ...p]);
    }
    return out;
  }

  for (const perm of permutations(ids)) {
    for (let k = 1; k <= 3; k++) {
      if (2 * k > perm.length) break;
      // perm 前 2k 个按 (0,1),(2,3)... 成级；同时枚举每级两种方向
      const chosen = perm.slice(0, 2 * k);
      const dirs = 1 << k;
      for (let mask = 0; mask < dirs; mask++) {
        const stages = [];
        for (let s = 0; s < k; s++) {
          let a = chosen[2 * s];
          let b = chosen[2 * s + 1];
          if (mask & (1 << s)) [a, b] = [b, a];
          stages.push([a, b]);
        }
        evaluate(stages);
      }
    }
  }

  return [...seen.values()];
}

function seqCompare(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const c = idCmp(a[i], b[i]);
    if (c) return c;
  }
  return a.length - b.length;
}

// flatSeq（驱动,从动,驱动,从动...）-> {used 排序, pairing 级序规范化}
function keysOf(flatSeq) {
  const pairs = [];
  for (let i = 0; i < flatSeq.length; i += 2) pairs.push([flatSeq[i], flatSeq[i + 1]]);
  const used = flatSeq.slice().sort(idCmp);
  const pairing = pairs.map((p) => p.slice()).sort((a, b) => seqCompare(a, b)).flat();
  return { used, pairing };
}

let caseNo = 0;
function runCase(gears, targetRaw, tolRaw) {
  caseNo++;
  const target = parsePositive(targetRaw);
  const tol = parsePercent(tolRaw);
  const result = search(gears, target, tol);

  const all = bruteForce(gears, target, tol);
  const expected = all.filter((x) => x.within);
  expected.sort((a, b) => {
    if (a.stagesCount !== b.stagesCount) return a.stagesCount - b.stagesCount;
    const ec = cmp(a.err, b.err);
    if (ec) return ec;
    const ka = keysOf(a.seq);
    const kb = keysOf(b.seq);
    const c1 = seqCompare(ka.used, kb.used);
    if (c1) return c1;
    return seqCompare(ka.pairing, kb.pairing);
  });

  assert.strictEqual(result.totalFeasible, expected.length,
    `case ${caseNo}: feasible count ${result.totalFeasible} != ${expected.length}`);

  // 每个返回方案必须在预期集合内，且顺序一致（按 级数/误差/序列）
  assert.strictEqual(result.shownCount, result.solutions.length);
  for (let i = 0; i < result.solutions.length; i++) {
    const got = result.solutions[i];
    const want = expected[i];
    assert.strictEqual(got.stagesCount, want.stagesCount, 'stage count order');
    assert.strictEqual(got.actualText, `${want.ratio.n}/${want.ratio.d}`,
      `case ${caseNo} #${i}: actual ${got.actualText} != ${want.ratio.n}/${want.ratio.d}`);
    assert.strictEqual(got.errorText, `${want.err.n}/${want.err.d}`,
      `case ${caseNo} #${i}: error mismatch`);
  }

  // 全局：物理方案集合相等
  const gotSet = new Set(result.solutions.map((s) =>
    canonKey(s.stages.map((x) => [x.driver.id, x.driven.id]))));
  const wantSet = new Set(expected.map((x) =>
    canonKey(seqToStages(x.seq))));
  assert.strictEqual(gotSet.size, wantSet.size, `case ${caseNo}: set size`);
  for (const k of wantSet) assert.ok(gotSet.has(k), `case ${caseNo}: missing ${k}`);

  console.log(`case ${caseNo}: gears=${gears.length} target=${targetRaw} tol=${tolRaw}% ` +
    `feasible=${expected.length}/${all.length} evaluated=${result.evaluated} OK`);
}

function canonKey(stages) {
  return stages
    .map(([d, p]) => {
      const pair = idCmp(d, p) < 0 ? [d, p] : [p, d];
      return { pair, reversed: idCmp(d, p) > 0 };
    })
    .sort((a, b) => idCmp(a.pair[0], b.pair[0]) || idCmp(a.pair[1], b.pair[1]))
    .map((x) => `${x.pair[0]}${x.reversed ? '<' : '>'}${x.pair[1]}`)
    .join(',');
}

function seqToStages(seq) {
  const out = [];
  for (let i = 0; i < seq.length; i += 2) out.push([seq[i], seq[i + 1]]);
  return out;
}

// ---- 用例 ----
const G = (arr) => arr.map((t, i) => ({ id: `G${i + 1}`, teeth: t }));

runCase(G([10, 20]), '1/2', '0');            // 2 枚，精确
runCase(G([10, 20]), '2', '0');              // 增速，精确
runCase(G([10, 20]), '1/3', '10');           // 容差边界
runCase(G([8, 12, 16, 24, 32, 40]), '1/8', '1');
runCase(G([8, 12, 16, 24, 32, 40]), '0.2', '5');
runCase(G([7, 11, 13, 17, 19]), '1/3', '2');
runCase(G([1, 2, 3, 5, 7, 11, 13]), '2.5', '1');
runCase(G([10, 11, 13, 17, 19, 23, 29, 31]), '0.01', '50'); // 大量无解/稀疏
runCase(G([10, 11]), '1/1000', '1');         // 完全无解
runCase(G([6, 9, 12, 18, 27, 36]), '1/6', '0.0001'); // 近似精确
// 编号自然序与重复齿数
runCase([
  { id: '10', teeth: 10 }, { id: '2', teeth: 10 },
  { id: '1', teeth: 20 }, { id: '3', teeth: 20 },
], '1/4', '0');
// 字符串编号
runCase([
  { id: 'A10', teeth: 8 }, { id: 'A2', teeth: 16 },
  { id: 'B1', teeth: 24 }, { id: 'B9', teeth: 32 },
], '1/2', '0');
// 8 枚穷举交叉验证（朴素排列 8!，可承受）；12 枚性能由 API 实测覆盖
runCase(G([8, 9, 10, 11, 12, 13, 14, 15]), '1/8', '2');

console.log('\n全部交叉校验通过 ✔');
