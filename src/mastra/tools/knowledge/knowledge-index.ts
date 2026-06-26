import MiniSearch from 'minisearch';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cutForSearch } from '../shared/tokenize';

// 知识库块：与文档镜像索引(metadata.json)解耦的"可直接答疑的正文"。
// 由 scripts/build-knowledge 从 生存指南/真题wiki 等源预编译，运行时只读本地 JSON。
export type KBChunk = {
  id: string;
  source: string; // 'survival-guide' | 'neowiki' | ...
  kind: string; // 'guide' | 'exam' | 'lecture'
  title: string;
  course?: string;
  url: string;
  text: string;
  meta?: Record<string, string>;
};

const KB_PATH = process.env.KNOWLEDGE_PATH || join(process.cwd(), 'data/knowledge.json');

let raw: KBChunk[] = [];
try {
  raw = JSON.parse(readFileSync(KB_PATH, 'utf8'));
} catch {
  // 知识库文件缺失时降级为空索引(不阻断启动)；工具会返回空结果。
  raw = [];
}

export const kbById = new Map(raw.map((r) => [r.id, r]));
export const totalKnowledge = raw.length;

export const kbIndex = new MiniSearch({
  fields: ['title', 'course', 'text'],
  storeFields: ['id', 'source', 'kind', 'title', 'course', 'url'],
  processTerm: (t) => t.toLowerCase(),
  tokenize: (s) => cutForSearch(s),
  searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 4, course: 3, text: 1 } },
});
kbIndex.addAll(
  raw.map((r) => ({
    id: r.id, source: r.source, kind: r.kind, title: r.title,
    course: r.course || '', url: r.url, text: r.text,
  })),
);
