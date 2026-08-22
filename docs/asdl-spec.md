# ASDL 战术动画脚本规范（v1.0）

ASDL（Animation Script Description Language）是一个用于描述网球战术演示动画的纯 JSON 协议。一个 ASDL 脚本自包含动画所需的全部信息：球场、元素（球员/球）、以及按时间轴排列的动作序列。任何实现本规范的播放器（Canvas、SVG、原生 App 等）都可以渲染同一个脚本。

设计原则：

- **纯 JSON**：无代码执行，安全、可 diff、可由程序（包括 AI）生成；
- **声明式时间轴**：动画 = 元素 + 按时间排列的动作节点，而非命令式逐帧逻辑；
- **自包含**：一个文件描述一段完整战术，不依赖外部资源。

---

## 1. 顶层结构

```json
{
  "meta":     { },
  "court":    { },
  "elements": [ ],
  "timeline": [ ]
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `meta` | object | ✓ | 元信息（名称、时长、版本等） |
| `court` | object | ✓ | 球场尺寸与颜色 |
| `elements` | array | ✓ | 参与动画的元素（球员、球） |
| `timeline` | array | ✓ | 按时间排列的动作节点序列 |

## 2. meta

```json
{
  "id": "inside-out-forehand-v1",
  "name": "正手 Inside-Out 制胜分",
  "description": "相持中主动侧身用正手攻击对手反手位",
  "duration": 4200,
  "version": "1.0",
  "author": "yourname"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | 建议 | 全局唯一标识，kebab-case，带版本后缀 |
| `name` | string | 建议 | 战术名称（展示用） |
| `description` | string | 建议 | 一句话描述 |
| `duration` | number | ✓ | 动画总时长（毫秒）。必须大于最后一个动作的结束时间 200–500ms |
| `version` | string | 建议 | 脚本内容版本 |
| `author` | string | 建议 | 作者署名 |

## 3. court 与坐标系

```json
{
  "width": 720,
  "height": 1280,
  "surfaceColor": "#0084D4",
  "lineColor": "#FFFFFF",
  "courtRect": { "x": 80, "y": 40, "w": 560, "h": 1200 },
  "netPosition": 640
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `width` / `height` | number | 画布逻辑尺寸，标准值 720 × 1280 |
| `surfaceColor` | string | 场地底色（硬地蓝 `#0084D4` / 草地绿 `#1F5D3B` / 红土橙 `#C75B12`） |
| `lineColor` | string | 场线颜色 |
| `courtRect` | object | 球场边线围成的矩形 `{x, y, w, h}` |
| `netPosition` | number | 球网的 y 坐标，标准值 640（半场） |

**坐标系**（竖向俯视图）：

- `x` 轴：0–720，从左到右（边线方向）；
- `y` 轴：0–1280，**对手底线为 0，我方底线为 1280**，我方始终在画面下方；
- 球网位于 `y = 640`。

常用坐标参考：

| 位置 | 坐标 |
|---|---|
| 我方初始位置（底线中点附近） | `[360, 1230]` |
| 对手初始位置（底线中点附近） | `[360, 50]` |
| 我方反手位（右手持拍） | `x > 400` 区域 |
| 我方正手位（右手持拍） | `x < 300` 区域 |
| 打向对手的深球落点 | `y` 在 50–150 |
| 对手回的浅球落点 | `y` 在 800–1000 |

## 4. elements

标准脚本包含 3 个固定元素（id 可自定义，但约定使用 `attacker` / `defender` / `ball`）：

```json
[
  { "id": "attacker", "type": "player", "label": "我方", "color": "#1565C0", "radius": 18, "initPos": [360, 1230] },
  { "id": "defender", "type": "player", "label": "对手", "color": "#C62828", "radius": 18, "initPos": [360, 50] },
  { "id": "ball",     "type": "ball",   "label": "",     "color": "#CCFF00", "radius": 6,  "initPos": [360, 1230] }
]
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 元素唯一标识，timeline 动作通过它引用目标 |
| `type` | string | `player`（圆点 + 标签）或 `ball`（小球） |
| `label` | string | 显示在元素下方的文字（球员名/阵营） |
| `color` | string | 元素颜色 |
| `radius` | number | 半径（逻辑像素） |
| `initPos` | `[x, y]` | 初始位置 |

## 5. timeline

时间轴是动作节点的数组，每个节点表示"在 t 时刻同时发生的一组动作"：

```json
{ "t": 1000, "actions": [ { "type": "text", "..." : "..." } ] }
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `t` | number | ✓ | 节点触发时间（毫秒，相对动画开始） |
| `actions` | array | ✓ | 同时触发的动作列表 |

一次击球通常由三个动作组成，放在同一 `t`（或相近 `t`）的节点中：`text`（击球说明）+ `trajectory`（球的飞行）+ `move`（击球者随后的跑位）。

## 6. 动作类型

### 6.1 text — 文字标注

```json
{
  "type": "text",
  "content": "正手 Inside-Out 打向对手反手深处",
  "pos": [80, 1060],
  "dur": 1000,
  "style": { "fontSize": 16, "color": "#FFFFFF", "bg": "rgba(21,101,192,0.8)" }
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `content` | string | ✓ | 文字内容 |
| `pos` | `[x, y]` | ✓ | 文字左上角位置 |
| `dur` | number | ✓ | 显示时长（毫秒） |
| `style.fontSize` | number | | 字号，默认 16 |
| `style.color` | string | | 文字颜色，默认 `#FFFFFF` |
| `style.bg` | string | | 文字背景色，默认 `rgba(0,0,0,0.6)` |

### 6.2 move — 元素移动

```json
{
  "type": "move",
  "target": "attacker",
  "from": [360, 1230],
  "to": [240, 1210],
  "dur": 500,
  "easing": "easeInOutQuad"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `target` | string | ✓ | 目标元素 id |
| `from` / `to` | `[x, y]` | ✓ | 起点 / 终点 |
| `dur` | number | ✓ | 移动时长（毫秒） |
| `easing` | string | | 缓动函数名，默认 `linear` |

### 6.3 trajectory — 球的轨迹

```json
{
  "type": "trajectory",
  "target": "ball",
  "waypoints": [[240, 1210], [300, 640], [220, 150]],
  "curve": "catmullrom",
  "dur": 800,
  "easing": "linear",
  "showBounceMark": false
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `target` | string | ✓ | 通常为 `ball` |
| `waypoints` | `[[x,y], ...]` | ✓ | 轨迹途经点，**至少 3 个**：起点、过网点（`y ≈ 640`）、落点 |
| `curve` | string | | 插值曲线，`catmullrom`（Catmull-Rom 样条，曲线经过所有途经点） |
| `dur` | number | ✓ | 飞行时长（毫秒） |
| `easing` | string | | 默认 `linear`（球速均匀更符合直觉） |
| `showBounceMark` | boolean | | 是否在落点绘制落点标记，制胜分的最后一击设为 `true` |

## 7. 支持的缓动函数

`linear`、`easeInQuad`、`easeOutQuad`、`easeInOutQuad`、`easeInCubic`、`easeOutCubic`、`easeInOutCubic`、`easeInQuart`、`easeOutQuart`、`easeInOutQuart`、`easeOutBack`

球员跑位推荐 `easeInOutQuad`（起步加速、到位减速）；球的飞行推荐 `linear`。

## 8. 创作规则

1. 每个击球动作 = `text` 说明 + 球的 `trajectory` + 球员 `move`，放在同一 `t` 或相近 `t` 的节点；
2. `trajectory` 的 `waypoints` 至少 3 个点：起点、过网点（`y ≈ 640`）、落点；
3. 球员移动要与球的轨迹配合，可稍早于击球启动（提前移动到位）；
4. 最后一击加 `showBounceMark: true` 标记制胜分；
5. 结尾加一个得分说明的 `text` 动作；
6. `meta.duration` 比最后一个节点的 `t + dur` 大 200–500ms，给结尾留白；
7. 动画节奏参考真实比赛：一拍击球间隔约 0.8–1.2 秒。

## 9. 播放器校验规则

参考实现（`viewer/tactic-preview.js`）加载脚本时校验以下各项，任一失败即拒绝播放：

- 根对象必须是 JSON 对象；
- `meta.duration` 必须存在；
- `court` 必须存在；
- `elements` 必须是非空数组；
- `timeline` 必须是数组，且每个节点都有 `t`（number）与 `actions`（array）。

## 10. 完整示例

见 [`tactics/`](../tactics/) 目录：

- [`tactics/baseline/inside-out-forehand.json`](../tactics/baseline/inside-out-forehand.json) — 底线战术：正手 Inside-Out
- [`tactics/serving/serve-and-volley.json`](../tactics/serving/serve-and-volley.json) — 发球战术：发球上网

用仓库自带的网页播放器即可预览：`python3 -m http.server` 后打开 `viewer/index.html`。
