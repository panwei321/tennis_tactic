# tennis_tactic - 网球战术动画脚本库

一套用 **ASDL（Animation Script Description Language）** 描述的网球战术演示动画脚本集合：每个战术是一个自包含的 JSON 文件，包含动画脚本（球场/球员/球/时间轴）和配套的战术介绍（简介、目的、适用场景、注意事项）。

适合网球爱好者、教练、网球类 App 开发者直接取用或二次开发——你可以用自己的播放器渲染这些脚本，也可以在现有脚本基础上改编出新战术。

> 本仓库只包含**战术脚本数据、协议文档和网页播放器**，不包含任何 App / 后端业务代码。

## 快速开始

```bash
git clone <本仓库地址>
cd tennis_tactic

# 启动本地静态服务器（viewer 需要通过 http 访问，直接双击 html 会加载数据失败）
python3 -m http.server 8080

# 浏览器打开
http://localhost:8080/viewer/
```

打开后左侧选择战术，右侧即可播放动画、拖进度、调倍速，并查看战术介绍。

## 仓库结构

```
tennis_tactic/
├── tactics/                # 战术脚本（每个文件 = 一个战术）
│   ├── baseline/           #   底线战术
│   │   └── inside-out-forehand.json
│   └── serving/            #   发球战术
│       └── serve-and-volley.json
├── docs/
│   └── asdl-spec.md        # ASDL 协议规范（二次开发必读）
├── viewer/                 # 网页播放器（零依赖，可直接嵌入你的页面）
│   ├── index.html          #   战术库预览页
│   ├── tactic-preview.js   #   ASDL 播放引擎（Canvas 2D 参考实现）
│   ├── viewer.js / viewer.css
│   └── tactics.json        #   索引文件（tools/build-index.js 生成，勿手改）
└── tools/
    ├── export_tactics.sql  # 从 MySQL 业务库导出战术（维护者用）
    ├── import_export.js    # 把导出结果拆分为 tactics/ 下的单文件
    └── build-index.js      # 校验全部脚本并重建 viewer/tactics.json
```

## 战术文件格式

`tactics/` 下每个 JSON 文件是一个"包装后的战术"：外层是元信息与介绍文案，`script` 字段是符合 [ASDL 规范](docs/asdl-spec.md) 的动画脚本体。

```json
{
  "id": "inside-out-forehand",
  "name": "正手 Inside-Out 制胜分",
  "category": "底线战术",
  "introduction": "一句话简介……",
  "purpose": "战术目的……",
  "scenarios": "适用场景……",
  "tips": "注意事项……",
  "protocolVersion": "1.0",
  "script": {
    "meta":     { "id": "…", "name": "…", "duration": 4300, "version": "1.0", "author": "…" },
    "court":    { "width": 720, "height": 1280, "courtRect": { "x": 80, "y": 40, "w": 560, "h": 1200 }, "netPosition": 640 },
    "elements": [ { "id": "attacker", "type": "player", "label": "我方", "initPos": [360, 1230] }, "…" ],
    "timeline": [ { "t": 0, "actions": [ "…" ] } ]
  }
}
```

动画坐标系、动作类型（`text` / `move` / `trajectory`）、缓动函数等细节见 **[docs/asdl-spec.md](docs/asdl-spec.md)**。

## 二次开发指南

**只想用数据**：直接读 `viewer/tactics.json`（或 `tactics/` 目录的文件），按 ASDL 规范自己实现渲染即可——协议是纯 JSON，与平台无关，Canvas / SVG / 原生动画都可以。

**想在网页里直接播放**：引入两个文件即可，零依赖：

```html
<canvas id="court" style="width: 360px"></canvas>
<script src="viewer/tactic-preview.js"></script>
<script>
  const player = new TacticPreview(document.getElementById('court'), {
    onTimeUpdate: (cur, dur) => {},   // 可选：进度回调
    onStateChange: (s) => {},         // 可选：playing / paused / completed
    onError: (msg) => {}              // 可选：脚本错误
  });
  fetch('viewer/tactics.json')
    .then(r => r.json())
    .then(list => player.loadScript(list[0].script));  // 传对象或 JSON 字符串均可
  player.play();
</script>
```

**想贡献或改编战术**：复制一份最接近的现有脚本，改 `timeline` 与介绍文案，然后跑 `node tools/build-index.js` 校验——校验通过、viewer 里播放正常即可提交（详见 [CONTRIBUTING.md](CONTRIBUTING.md)）。

## 数据导出（维护者）

本库脚本源自业务系统数据库时，用以下流程导出（`tools/export.json` 已被 gitignore，不会误提交）：

```bash
# 1. 导出（占位符换成自己的连接信息）
mysql -h <host> -P <port> -u <user> -p --default-character-set=utf8mb4 -N <dbname> < tools/export_tactics.sql > tools/export.json

# 2. 拆分为 tactics/ 下的单文件
node tools/import_export.js

# 3. 校验 + 重建索引
node tools/build-index.js
```

导入后建议逐个检查介绍文案是否需要润色，删除 `source` 字段前确认不介意暴露原始 dbId。

## 贡献

欢迎贡献新战术、修正动画细节或补充介绍文案，流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[MIT](LICENSE)。战术内容仅供学习交流，请结合自身水平与教练指导安全使用。
