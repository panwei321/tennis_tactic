#!/usr/bin/env node
/**
 * render-gif.js - 无头渲染 ASDL 战术脚本为 GIF 动画
 *
 * 不需要浏览器和 ffmpeg：直接驱动 viewer/tactic-preview.js 的渲染逻辑，
 * 按固定时间步 seekTo 逐帧绘制，再用 gifenc 编码成 GIF（帧时序精确、可重复生成）。
 *
 * 用法：
 *   node tools/render-gif.js <tactic.json> [输出.gif] [--width=480] [--fps=10]
 *
 * 示例：
 *   node tools/render-gif.js tactics/serving/serve-and-volley.json docs/images/demo.gif
 *   node tools/render-gif.js tactics/baseline/inside-out-forehand.json --width=360
 *
 * 依赖（devDependencies）：@napi-rs/canvas（无编译原生 Canvas）、gifenc（纯 JS GIF 编码）
 */
'use strict';

const fs = require('fs');
const path = require('path');

try {
  require('@napi-rs/canvas');
  require('gifenc');
} catch (e) {
  console.error('缺少渲染依赖，请先在仓库根目录执行：npm install');
  process.exit(1);
}
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');

const ROOT = path.resolve(__dirname, '..');

// ============ 注册中文字体（修复 GIF 乱码） ============
// tactic-preview.js 用 "Xpx sans-serif" 画文字；无头 canvas 解析不到 macOS 的 .ttc 中文字体，
// 中文/带圈数字会渲染成方框。这里把含 CJK 字形的系统 ttf 注册为 sans-serif 家族。
// 只影响无头渲染；浏览器播放器中 sans-serif 是泛型关键字，不受同名注册影响。
const CJK_FONTS = [
  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',      // macOS 全字库
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',    // Linux Noto CJK
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc'
];
const cjkFont = CJK_FONTS.find(p => fs.existsSync(p));
if (cjkFont) {
  GlobalFonts.registerFromPath(cjkFont, 'sans-serif');
} else {
  console.warn('[提示] 未找到含中文字形的系统字体，GIF 中中文将显示为方框');
}

// ============ 参数解析 ============
const args = process.argv.slice(2);
const opts = { width: 480, fps: 10 };
const positional = [];
for (let i = 0; i < args.length; i++) {
  const m = /^(--\w+)=(.+)$/.exec(args[i]);
  if (m && opts[m[1].slice(2)] !== undefined) opts[m[1].slice(2)] = Number(m[2]);
  else positional.push(args[i]);
}
const inputFile = positional[0];
if (!inputFile) {
  console.error('用法：node tools/render-gif.js <tactic.json> [输出.gif] [--width=480] [--fps=10]');
  process.exit(1);
}

const tactic = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), inputFile), 'utf8'));
const script = tactic.script || tactic; // 兼容 wrapped 格式与裸 ASDL 脚本
const outFile = positional[1] || path.join(ROOT, 'docs', 'images', (tactic.id || 'demo') + '.gif');

// ============ 浏览器环境 shim，原样复用 tactic-preview.js ============
function makeCanvas(width, height) {
  const c = createCanvas(width, height);
  // TacticPreview._setupCanvas 通过 getBoundingClientRect 获取 CSS 尺寸
  c.getBoundingClientRect = () => ({ width, height, left: 0, top: 0, right: width, bottom: height });
  return c;
}

// 以 2 倍超采样渲染再交给调色板量化，画面更干净（最终 GIF 像素宽 = opts.width）
const cssW = Math.round(opts.width / 2);
const cssH = Math.round((cssW * 16) / 9);

const fakeWindow = { devicePixelRatio: 2, requestAnimationFrame: () => {}, cancelAnimationFrame: () => {} };
const fakeDocument = { createElement: () => makeCanvas(cssW, cssH) };

const playerSource = fs.readFileSync(path.join(ROOT, 'viewer', 'tactic-preview.js'), 'utf8');
const TacticPreview = new Function('window', 'document', 'performance', playerSource + '\nreturn window.TacticPreview;')(
  fakeWindow,
  fakeDocument,
  { now: () => 0 }
);

// ============ 渲染帧 ============
const canvas = makeCanvas(cssW, cssH);
const player = new TacticPreview(canvas, {});

if (!player.loadScript(script)) {
  console.error('脚本校验失败，无法渲染：' + (tactic.id || inputFile));
  process.exit(1);
}
const duration = script.meta.duration || 0;
const step = Math.round(1000 / opts.fps);

const gif = GIFEncoder();
let frames = 0;
for (let t = 0; t < duration; t += step) {
  player.seekTo(t);
  emitFrame(gif, canvas, step);
  frames++;
}
player.seekTo(duration); // 末帧（含落点标记的最终画面）
emitFrame(gif, canvas, step);
frames++;

// 注意用 canvas.width/height（_setupCanvas 已按 devicePixelRatio 放大后的实际像素）
function emitFrame(gif, cv, delay) {
  const w = cv.width, h = cv.height;
  const rgba = cv.data(); // RGBA
  const palette = quantize(rgba, 256, { format: 'rgb565' });
  const index = applyPalette(rgba, palette, 'rgb565');
  gif.writeFrame(index, w, h, { palette, delay });
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
gif.finish();
fs.writeFileSync(outFile, gif.bytes());

const size = (fs.statSync(outFile).size / 1024).toFixed(0);
console.log(`已生成 ${path.relative(process.cwd(), outFile) || outFile}` +
  `（${tactic.name || tactic.id || 'demo'}，${canvas.width}×${canvas.height}，${frames} 帧 @ ${opts.fps}fps，${size}KB）`);
