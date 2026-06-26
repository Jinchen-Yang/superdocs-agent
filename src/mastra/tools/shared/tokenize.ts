import * as jieba from 'nodejs-jieba';

// jieba 中文分词(搜索模式)，带兜底。文档索引与知识库索引共用，避免重复维护兼容逻辑。
export const cutForSearch = (s: string): string[] => {
  try {
    const fn = (jieba as any).cutForSearch || (jieba as any).cut_for_search || (jieba as any).cut;
    const out = fn(s, true);
    return (Array.isArray(out) ? out : [out]).filter((w: string) => w && w.trim());
  } catch {
    return s.split(/\s+/).filter(Boolean);
  }
};
