import MiniSearch from 'minisearch';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cutForSearch } from '../shared/tokenize';
import { log } from '../../util/log';

type Rec = { id: string; url: string; type: 'book' | 'test' | 'doc'; data: any };
const META_PATH = process.env.METADATA_PATH || join(process.cwd(), 'data/metadata.json');

// 与 knowledge-index 对齐：metadata.json 缺失/损坏（如 rsync 同步到一半）时降级为空索引，
// 让服务带空索引启动并告警，而非在模块顶层抛错导致「整个 Mastra 进程 import 失败、全站起不来」。
let raw: Rec[] = [];
try {
  const parsed = JSON.parse(readFileSync(META_PATH, 'utf8'));
  // 顶层须是数组，且过滤掉 null/非对象/缺 id 的脏元素，避免 flatten/byId 在模块顶层抛错。
  if (Array.isArray(parsed)) raw = parsed.filter((r) => r && typeof r === 'object' && r.id);
  else log.error('文档索引 metadata.json 顶层不是数组，降级为空索引', { path: META_PATH });
} catch (e: any) {
  log.error('文档索引 metadata.json 读取/解析失败，降级为空索引(服务仍启动)', { path: META_PATH, err: e?.message || String(e) });
  raw = [];
}

function flatten(r: Rec) {
  const d = r.data || {};
  const courseName = d.course?.name || (Array.isArray(d.course) ? d.course.map((c: any) => c.name).join(' ') : '');
  return {
    id: r.id,
    type: r.type,
    title: d.title || courseName || '',
    course: courseName || '',
    college: Array.isArray(d.college) ? d.college.join(' ') : '',
    authors: Array.isArray(d.authors) ? d.authors.join(' ') : '',
    year: String(d.publish_year || d.time?.end || d.time?.start || ''),
    content: Array.isArray(d.content) ? d.content.join(' ') : '',
    filetype: d.filetype || 'pdf',
    stage: d.time?.stage || '',
  };
}
const docs = raw.map(flatten);
export const byId = new Map(raw.map((r) => [r.id, r]));
export const totalDocs = docs.length;

export const index = new MiniSearch({
  fields: ['title', 'course', 'college', 'authors', 'content', 'year'],
  storeFields: ['id', 'type', 'title', 'course', 'year', 'filetype', 'stage'],
  processTerm: (t) => t.toLowerCase(),
  tokenize: (s) => cutForSearch(s),
  searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 3, course: 2 } },
});
index.addAll(docs);
