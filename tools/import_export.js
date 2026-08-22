#!/usr/bin/env node
/**
 * import_export.js - 把 mysql 导出的 tools/export.json 拆分为 tactics/ 下的单个脚本文件
 *
 * 步骤：
 *   1. 按 README「数据导出」一节执行 export_tactics.sql，得到 tools/export.json
 *   2. node tools/import_export.js
 *   3. node tools/build-index.js   （重新生成 viewer/tactics.json 并校验）
 *
 * 文件落点：tactics/<分类目录>/<meta.id 或 tactic-<dbId>>.json
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXPORT_FILE = path.join(__dirname, 'export.json');
const TACTICS_DIR = path.join(ROOT, 'tactics');

// 数据库分类名 → 目录名（未知分类归入 misc，可自行扩充）
const CATEGORY_DIRS = {
  '单打战术': 'singles',
  '双打战术': 'doubles',
  '发球战术': 'serving',
  '接发战术': 'returning',
  '截击战术': 'volley',
  '底线战术': 'baseline',
  '未分类': 'misc'
};

function main() {
  if (!fs.existsSync(EXPORT_FILE)) {
    console.error('未找到 tools/export.json，请先按 README 的「数据导出」步骤生成。');
    process.exit(1);
  }

  const raw = fs.readFileSync(EXPORT_FILE, 'utf8').trim();
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows)) {
    console.error('export.json 应为 JSON 数组，实际是：' + typeof rows);
    process.exit(1);
  }

  let ok = 0, skip = 0;
  rows.forEach(row => {
    let script;
    try {
      script = typeof row.script === 'string' ? JSON.parse(row.script) : row.script;
    } catch (e) {
      console.warn(`[跳过] dbId=${row.dbId} ${row.name}: scriptJson 解析失败 - ${e.message}`);
      skip++;
      return;
    }

    const category = row.category || '未分类';
    const dir = CATEGORY_DIRS[category] || 'misc';
    const id = (script && script.meta && script.meta.id)
      ? script.meta.id.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
      : `tactic-${row.dbId}`;

    const file = {
      id: id || `tactic-${row.dbId}`,
      name: row.name,
      category: category,
      introduction: row.introduction || '',
      purpose: row.purpose || '',
      scenarios: row.scenarios || '',
      tips: row.tips || '',
      protocolVersion: row.protocolVersion || (script && script.meta && script.meta.version) || '1.0',
      source: { dbId: row.dbId },
      script: script
    };

    const targetDir = path.join(TACTICS_DIR, dir);
    fs.mkdirSync(targetDir, { recursive: true });
    const target = path.join(targetDir, file.id + '.json');
    fs.writeFileSync(target, JSON.stringify(file, null, 2) + '\n', 'utf8');
    console.log(`[导入] ${path.relative(ROOT, target)}  (${row.name})`);
    ok++;
  });

  console.log(`\n完成：导入 ${ok} 条，跳过 ${skip} 条。接下来运行 node tools/build-index.js 生成索引。`);
}

main();
