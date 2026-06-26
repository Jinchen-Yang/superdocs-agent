#!/usr/bin/env node
// 从 byrdocs-archive 的 per-md5 YAML 编译最新文档元信息 data/metadata.json。
// 在能访问 GitHub 的机器上跑；产物随部署同步。注意：不动 data/mirror-md5.json
// (那是"用户镜像拥有哪些文件"的快照集，由本地快照一次性生成，用于下载链接分流)。
//   用法: node scripts/refresh-metadata.mjs   (可用 ARCHIVE_DIR 指定已克隆目录)
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const WORK = process.env.ARCHIVE_DIR || join(ROOT, '.kb-src', 'byrdocs-archive');
if (!existsSync(WORK)) {
  mkdirSync(join(WORK, '..'), { recursive: true });
  console.log('clone byrdocs/byrdocs-archive ...');
  execSync(`git clone --depth 1 https://github.com/byrdocs/byrdocs-archive.git "${WORK}"`, { stdio: 'inherit' });
}
const META = join(WORK, 'metadata');
const out = [];
let bad = 0;
for (const f of readdirSync(META).filter((f) => f.endsWith('.yml'))) {
  try {
    const d = yaml.load(readFileSync(join(META, f), 'utf8'));
    if (d && d.id && d.type && d.data) out.push(d); else bad++;
  } catch { bad++; }
}
mkdirSync(join(ROOT, 'data'), { recursive: true });
writeFileSync(join(ROOT, 'data/metadata.json'), JSON.stringify(out));
const types = {};
for (const r of out) types[r.type] = (types[r.type] || 0) + 1;
console.log('文档元信息编译完成:', out.length, '条', JSON.stringify(types), '| 解析失败', bad);
