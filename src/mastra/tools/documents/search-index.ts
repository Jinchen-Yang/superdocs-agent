import MiniSearch from 'minisearch';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cutForSearch } from '../shared/tokenize';

type Rec = { id: string; url: string; type: 'book' | 'test' | 'doc'; data: any };
const META_PATH = process.env.METADATA_PATH || join(process.cwd(), 'data/metadata.json');
const raw: Rec[] = JSON.parse(readFileSync(META_PATH, 'utf8'));

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
