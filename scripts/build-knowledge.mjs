#!/usr/bin/env node
// 预编译"新生答疑知识库" data/knowledge.json：从 生存指南 + 真题wiki 抓取→清洗→切块。
// 在能稳定访问 GitHub 的机器(dev/带代理)上跑；产物随部署同步，运行时只读、不联网。
//   用法: node scripts/build-knowledge.mjs   (可用 KB_SRC_DIR 指定已克隆的源目录)
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const WORK = process.env.KB_SRC_DIR || join(ROOT, '.kb-src');
const SOURCES = [
  { repo: 'byrdocs/bupt-survival-guide', dir: 'bupt-survival-guide', license: 'CC-BY-SA-4.0' },
  { repo: 'byrdocs/byrdocs-neowiki', dir: 'byrdocs-neowiki', license: 'CC-BY-NC-SA-4.0' },
];

mkdirSync(WORK, { recursive: true });
for (const s of SOURCES) {
  const p = join(WORK, s.dir);
  if (!existsSync(p)) {
    console.log(`clone ${s.repo} ...`);
    execSync(`git clone --depth 1 https://github.com/${s.repo}.git "${p}"`, { stdio: 'inherit' });
  }
}
const sha = (dir) => { try { return execSync(`git -C "${join(WORK, dir)}" rev-parse HEAD`).toString().trim(); } catch { return 'HEAD'; } };

function readFm(text) {
  const m = text.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: text };
  let fm = {};
  try { fm = yaml.load(m[1]) || {}; } catch {}
  return { fm, body: m[2] };
}
const cleanMd = (s) => s
  .replace(/:::(note|tip|caution|danger|info)\b\[?[^\]\n]*\]?/g, '提示：').replace(/:::/g, '')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, '[图]').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/<[^>]+>/g, ' ').replace(/`{1,3}/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const cleanMdx = (s) => s
  .replace(/<Blank\s*\/>/g, '【填空】').replace(/<Blank>([\s\S]*?)<\/Blank>/g, '【$1】')
  .replace(/<Solution>([\s\S]*?)<\/Solution>/g, '\n【解析】$1').replace(/<Answer>([\s\S]*?)<\/Answer>/g, '\n【答案】$1')
  .replace(/<Choices[^>]*>([\s\S]*?)<\/Choices>/g, (_, c) => c).replace(/<Slot[^>]*\/>/g, '【】')
  .replace(/<Figure[^>]*\/?>/g, '[图]').replace(/<[^>]+>/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = join(d, e.name);
  return e.isDirectory() ? walk(p) : (/\.mdx?$/.test(e.name) ? [p] : []);
});

const chunks = [];

// ---- 生存指南：按 ## 切块 ----
const GROOT = join(WORK, 'bupt-survival-guide/src/content/docs');
for (const file of walk(GROOT)) {
  const rel = relative(GROOT, file);
  const { fm, body } = readFm(readFileSync(file, 'utf8'));
  const docTitle = fm.title || rel.replace(/\.mdx?$/, '');
  // 指向线上生存指南 guide.byrdocs.org(Starlight 用结尾斜杠),而非 GitHub 源码。
  const guideParts = rel.replace(/\.mdx?$/, '').split(sep);
  if (guideParts[guideParts.length - 1] === 'index') guideParts.pop();
  const url = `https://guide.byrdocs.org/${guideParts.map(encodeURIComponent).join('/')}/`;
  let i = 0;
  for (const part of body.split(/\r?\n(?=##\s)/)) {
    const hm = part.match(/^##\s+(.+)/);
    const clean = cleanMd(part.replace(/^##\s+.+\r?\n?/, ''));
    if (clean.length < 30) continue;
    chunks.push({ id: `survival-guide:${rel}#${i++}`, source: 'survival-guide', kind: 'guide',
      title: hm ? `${docTitle} — ${hm[1].trim()}` : docTitle, url, text: clean.slice(0, 4000), meta: { doc: docTitle } });
  }
}

// ---- 真题wiki：一卷一块 ----
const EX = join(WORK, 'byrdocs-neowiki/exams');
for (const dir of readdirSync(EX)) {
  const mdx = join(EX, dir, 'index.mdx');
  if (!existsSync(mdx)) continue;
  const { fm, body } = readFm(readFileSync(mdx, 'utf8'));
  const course = fm['科目'] || '', year = fm['时间'] || '', stage = fm['阶段'] || '', type = fm['类型'] || '';
  const college = Array.isArray(fm['学院']) ? fm['学院'].join(' ') : (fm['学院'] || '');
  const clean = cleanMdx(body);
  if (clean.length < 20) continue;
  chunks.push({ id: `neowiki:${dir}`, source: 'neowiki', kind: 'exam',
    title: `${course} ${year} ${stage}`.replace(/\s+/g, ' ').trim(), course,
    url: `https://wiki.byrdocs.org/exam/${encodeURIComponent(dir)}/`,
    text: clean.slice(0, 8000), meta: { year: String(year), stage: String(stage), type: String(type), college } });
}

mkdirSync(join(ROOT, 'data'), { recursive: true });
writeFileSync(join(ROOT, 'data/knowledge.json'), JSON.stringify(chunks));
writeFileSync(join(ROOT, 'data/knowledge-sources.json'), JSON.stringify(
  { builtFrom: SOURCES.map((s) => ({ source: s.dir === 'bupt-survival-guide' ? 'survival-guide' : 'neowiki', repo: s.repo, commit: sha(s.dir), license: s.license })) }, null, 2));
const bySrc = {};
for (const c of chunks) bySrc[c.source] = (bySrc[c.source] || 0) + 1;
console.log('知识库构建完成:', chunks.length, '块', JSON.stringify(bySrc));
