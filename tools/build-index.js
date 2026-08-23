#!/usr/bin/env node
/**
 * build-index.js - 扫描 tactics/ 下所有战术文件，校验后生成 viewer/tactics.json
 *
 * 用法：node tools/build-index.js
 * 校验规则与 viewer/tactic-preview.js 的加载校验一致，另含创作规范检查（warning 级）。
 * 任一 error 级错误都会导致索引不生成（exit 1）。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TACTICS_DIR = path.join(ROOT, 'tactics');
const INDEX_FILE = path.join(ROOT, 'viewer', 'tactics.json');

// JSON Schema 校验（docs/asdl-schema.json）；未安装 ajv 时跳过并提示
let schemaValidate = null;
try {
  const Ajv = require('ajv');
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'asdl-schema.json'), 'utf8'));
  schemaValidate = new Ajv({ allErrors: true }).compile(schema);
} catch (e) {
  if (e.code === 'MODULE_NOT_FOUND') {
    console.warn('[提示] 未安装 ajv，跳过 JSON Schema 校验（npm install 后启用）');
  } else {
    throw e;
  }
}

// 分类目录 → 展示顺序（未列出的目录排在最后）
const DIR_ORDER = ['singles', 'doubles', 'serving', 'returning', 'volley', 'baseline'];

function listJsonFiles(dir, base) {
  const out = [];
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    if (name.name.startsWith('.')) continue;
    const full = path.join(dir, name.name);
    if (name.isDirectory()) out.push(...listJsonFiles(full, base));
    else if (name.name.endsWith('.json')) out.push(full);
  }
  return out;
}

/** 校验单个 wrapped 战术文件，返回 { errors, warnings } */
function validate(entry, file) {
  const errors = [];
  const warnings = [];
  const where = path.relative(ROOT, file);

  if (!entry || typeof entry !== 'object') {
    return { errors: [`${where}: 不是 JSON 对象`], warnings };
  }
  if (!entry.id) errors.push(`${where}: 缺少 id`);
  if (!entry.name) warnings.push(`${where}: 缺少 name`);
  if (!entry.category) warnings.push(`${where}: 缺少 category`);

  // —— JSON Schema 校验（结构/类型/必填字段的最权威来源）——
  if (schemaValidate && !schemaValidate(entry)) {
    for (const err of schemaValidate.errors) {
      errors.push(`${where}: schema ${err.instancePath || '/'} ${err.message}`);
    }
  }

  const s = entry.script;
  if (!s || typeof s !== 'object') {
    errors.push(`${where}: 缺少 script（ASDL 脚本体）`);
    return { errors, warnings };
  }

  // —— 与播放器一致的硬校验 ——
  if (!s.meta || !s.meta.duration) errors.push(`${where}: script.meta.duration 缺失`);
  if (!s.court) errors.push(`${where}: script.court 缺失`);
  if (!Array.isArray(s.elements) || s.elements.length === 0) errors.push(`${where}: script.elements 缺失或为空`);
  if (!Array.isArray(s.timeline) || s.timeline.length === 0) errors.push(`${where}: script.timeline 缺失或为空`);

  let maxEnd = 0;
  if (Array.isArray(s.timeline)) {
    s.timeline.forEach((node, i) => {
      if (node.t == null) errors.push(`${where}: timeline[${i}] 缺少 t`);
      if (!Array.isArray(node.actions)) errors.push(`${where}: timeline[${i}] 缺少 actions`);
      (node.actions || []).forEach(a => {
        maxEnd = Math.max(maxEnd, (node.t || 0) + (a.dur || 0));
        if (a.type === 'trajectory' && Array.isArray(a.waypoints) && a.waypoints.length < 3) {
          warnings.push(`${where}: timeline[${i}] 的 trajectory waypoints 少于 3 个点（起点/过网点/落点）`);
        }
      });
    });
  }

  // —— 创作规范检查 ——
  if (s.meta && s.meta.duration) {
    if (s.meta.duration <= maxEnd) {
      errors.push(`${where}: meta.duration(${s.meta.duration}) 应大于最后一个动作结束时间(${maxEnd})`);
    } else if (s.meta.duration - maxEnd > 1000) {
      warnings.push(`${where}: meta.duration 比最后动作结束多 ${s.meta.duration - maxEnd}ms，建议 200-500ms`);
    }
  }

  return { errors, warnings };
}

function main() {
  if (!fs.existsSync(TACTICS_DIR)) {
    console.error('未找到 tactics/ 目录');
    process.exit(1);
  }

  const files = listJsonFiles(TACTICS_DIR).sort();
  const allErrors = [];
  const allWarnings = [];
  const entries = [];
  const seenIds = new Set();

  files.forEach(file => {
    let entry;
    try {
      entry = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      allErrors.push(`${path.relative(ROOT, file)}: JSON 解析失败 - ${e.message}`);
      return;
    }
    const { errors, warnings } = validate(entry, file);
    allErrors.push(...errors);
    allWarnings.push(...warnings);
    if (errors.length === 0) {
      if (seenIds.has(entry.id)) allErrors.push(`${path.relative(ROOT, file)}: id "${entry.id}" 重复`);
      seenIds.add(entry.id);
      entries.push({
        id: entry.id,
        name: entry.name,
        category: entry.category || '未分类',
        categoryDir: path.basename(path.dirname(file)),
        introduction: entry.introduction || '',
        purpose: entry.purpose || '',
        scenarios: entry.scenarios || '',
        tips: entry.tips || '',
        protocolVersion: entry.protocolVersion || '1.0',
        script: entry.script
      });
    }
  });

  // 排序：按分类目录约定顺序，同分类内按文件名
  entries.sort((a, b) => {
    const oa = DIR_ORDER.indexOf(a.categoryDir), ob = DIR_ORDER.indexOf(b.categoryDir);
    return (oa === -1 ? 99 : oa) - (ob === -1 ? 99 : ob) || a.id.localeCompare(b.id);
  });

  allWarnings.forEach(w => console.warn('[警告] ' + w));

  if (allErrors.length > 0) {
    allErrors.forEach(e => console.error('[错误] ' + e));
    console.error(`\n校验失败：${allErrors.length} 个错误，索引未生成。请修复后重试。`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(INDEX_FILE), { recursive: true });
  fs.writeFileSync(INDEX_FILE, JSON.stringify(entries, null, 2) + '\n', 'utf8');
  console.log(`校验通过：${entries.length} 个战术，索引已写入 ${path.relative(ROOT, INDEX_FILE)}` +
    (allWarnings.length ? `（${allWarnings.length} 个警告）` : ''));
}

main();
