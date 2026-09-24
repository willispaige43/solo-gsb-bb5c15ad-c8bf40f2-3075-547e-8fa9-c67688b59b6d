'use strict';

const path = require('path');
const express = require('express');
const { parsePositive, parsePercent, cmp, mul, toDecimal } = require('./lib/fraction');
const { search } = require('./lib/search');

const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const MIN_GEARS = 2;
const MAX_GEARS = 12;
const MIN_TEETH = 1;
const MAX_TEETH = 100000;

function validate(body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, '请求体必须为 JSON 对象');

  if (typeof body.target !== 'string') throw new HttpError(400, '目标输出转速比必填，如 1/4 或 0.25');
  if (typeof body.tolerance !== 'string') throw new HttpError(400, '允许相对误差必填，如 1 或 1%');

  let target;
  let tolerance;
  try {
    target = parsePositive(body.target);
  } catch (e) {
    throw new HttpError(400, `目标转速比无效：${e.message}`);
  }
  try {
    tolerance = parsePercent(body.tolerance);
  } catch (e) {
    throw new HttpError(400, `允许相对误差无效：${e.message}`);
  }
  if (cmp(tolerance, { n: 1n, d: 1n }) > 0) {
    throw new HttpError(400, '允许相对误差不能超过 100%');
  }

  if (!Array.isArray(body.gears)) throw new HttpError(400, '齿轮列表必须为数组');
  if (body.gears.length < MIN_GEARS || body.gears.length > MAX_GEARS) {
    throw new HttpError(400, `齿轮数量必须为 ${MIN_GEARS}～${MAX_GEARS} 枚，当前为 ${body.gears.length} 枚`);
  }

  const gears = [];
  const idSet = new Set();
  for (let i = 0; i < body.gears.length; i++) {
    const g = body.gears[i];
    const label = `第 ${i + 1} 枚齿轮`;
    if (!g || typeof g !== 'object') throw new HttpError(400, `${label}：格式无效`);

    const id = g.id;
    if (typeof id !== 'string' && typeof id !== 'number') {
      throw new HttpError(400, `${label}：编号必填（字符串或数字）`);
    }
    const idKey = String(id);
    if (idKey.trim() === '') throw new HttpError(400, `${label}：编号不能为空`);
    if (idSet.has(idKey)) throw new HttpError(400, `齿轮编号重复：${idKey}`);
    idSet.add(idKey);

    const teeth = Number(g.teeth);
    if (!Number.isInteger(teeth)) {
      throw new HttpError(400, `${label}（编号 ${idKey}）：齿数必须为整数`);
    }
    if (teeth < MIN_TEETH || teeth > MAX_TEETH) {
      throw new HttpError(400, `${label}（编号 ${idKey}）：齿数必须在 ${MIN_TEETH}～${MAX_TEETH} 之间`);
    }
    gears.push({ id: idKey, teeth });
  }

  return { target, tolerance, gears };
}

app.post('/api/search', (req, res, next) => {
  try {
    const { target, tolerance, gears } = validate(req.body);
    const result = search(gears, target, tolerance);
    res.json({
      ok: true,
      ...result,
      target: { n: Number(target.n), d: Number(target.d) },
      targetText: `${target.n}/${target.d}`,
      tolerancePercent: `${toDecimal(mul(tolerance, { n: 100n, d: 1n }), 6)}`,
    });
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ ok: false, error: e.message });
    next(e);
  }
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: '服务器内部错误' });
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`齿轮选配服务已启动: http://0.0.0.0:${PORT}`);
});
