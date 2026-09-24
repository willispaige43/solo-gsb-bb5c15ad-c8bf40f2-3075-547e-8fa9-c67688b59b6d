# 齿轮组选配 Web 应用（gear-train-picker）

供**手摇机械装置试制**使用的齿轮选配工具：输入目标输出转速比、允许相对误差和现有齿轮清单，
系统在 **1～3 级定轴齿轮传动**中穷举配对，全程使用 **BigInt 精确分数**计算实际转速比，
只返回误差达标方案，并按 **级数最少 → 误差最小 → 齿轮编号序列** 的顺序排列。

## 单条命令启动（Docker）

依赖安装已包含在镜像构建过程中，无需在宿主机安装 Node.js：

```bash
docker compose up --build
```

启动后浏览器访问：

- 地址：**http://localhost:3000**
- 端口：容器内固定 `3000`；宿主机默认映射 `3000`

如宿主机 3000 端口被占用，可改映射端口（如改为 8080）：

```bash
PORT=8080 docker compose up --build
# 访问 http://localhost:8080
```

后台运行与停止：

```bash
docker compose up --build -d   # 后台
docker compose down            # 停止
```

## 不用 Docker 时（本地 Node.js）

要求 Node.js ≥ 20（使用原生 BigInt，无需任何原生依赖）：

```bash
npm install && npm start
```

同样访问 http://localhost:3000 。

## 必要配置

| 配置项 | 环境变量 | 默认值 | 说明 |
| --- | --- | --- | --- |
| 服务端口（容器内） | `PORT`（容器环境） | `3000` | 一般无需修改 |
| 宿主机映射端口 | `PORT`（宿主机 shell） | `3000` | `PORT=8080 docker compose up --build` |

数据均由页面临时输入，**无数据库、无外部服务、无持久化**。

## 使用说明

1. 在页面填入**目标输出转速比**（输出转速 / 输入转速）：支持 `1/8`、`1:8`、`0.125` 三种写法，必须为正数；大于 1 表示增速。
2. 填入**允许相对误差**（百分数）：输入框统一按百分数解析，`1` 与 `1%` 均表示 1%（即 0.01），最大 100%。
3. 录入 **2～12 枚现有齿轮**：每枚有唯一编号（字符串或数字）和正整数齿数。
4. 点击「开始选配」。

### 结果规则

- 每级传动选择一枚**主动轮**和一枚**从动轮**，同一枚齿轮不会在方案中重复使用。
- 总传动比 = ∏（主动轮齿数 / 从动轮齿数），与目标值按精确分数比较。
- 相对误差 = |实际比 − 目标比| / 目标比，判定与排序均为整数交叉相乘，**无浮点误差**。
- 仅返回误差 ≤ 允许值的方案，排序优先级：**级数最少 → 相对误差最小 → 齿轮编号序列字典序**（编号采用数字感知自然序：`2 < 10`、`G2 < G10`）。
- 每个方案展示各级主动/从动轮编号与齿数、各级传动比、总传动比（分数与小数）及相对误差。
- 达标方案最多展示前 200 个（同时给出达标总数）；无达标方案时明确提示，并附一个误差最小的参考方案（标注为不满足要求，仅供调整设计时参考）。
- 物理上相同的配对组合不会因级间排列顺序不同而重复出现。

### API

`POST /api/search`

```json
{
  "target": "1/8",
  "tolerance": "1",
  "gears": [
    { "id": "G1", "teeth": 8 },
    { "id": "G2", "teeth": 40 }
  ]
}
```

成功返回：

```json
{
  "ok": true,
  "targetText": "1/8",
  "tolerancePercent": "1",
  "totalFeasible": 1,
  "shownCount": 1,
  "evaluated": 180,
  "elapsedMs": 0.5,
  "solutions": [
    {
      "stagesCount": 1,
      "stages": [
        {
          "driver": { "id": "G1", "teeth": 8 },
          "driven": { "id": "G2", "teeth": 40 },
          "stageRatioText": "8/40"
        }
      ],
      "actualText": "1/5",
      "actualDecimal": "0.2",
      "errorText": "3/5",
      "errorPercent": "60"
    }
  ],
  "closest": null
}
```

无达标方案时 `solutions` 为空数组、`totalFeasible` 为 0，并在 `closest` 中给出最接近但未达标的参考方案。

## 项目结构

```
.
├── Dockerfile              # 镜像内执行 npm install，依赖安装纳入一键启动
├── docker-compose.yml      # 单容器编排
├── package.json
├── server.js               # Express 服务与输入校验、API
├── lib/
│   ├── fraction.js         # BigInt 精确分数：解析、约分、比较、误差、小数格式化
│   └── search.js           # 1~3 级传动穷举、精确判定、排序
└── public/
    └── index.html          # 原生 HTML/CSS/JS 前端（无构建步骤）
```
