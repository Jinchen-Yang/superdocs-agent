import { searchDocuments } from './documents/search-documents';
import { getDocument } from './documents/get-document';
import { getDownloadUrl } from './documents/get-download-url';
import { answerKnowledge } from './knowledge/answer-knowledge';
import { webSearch } from './web/web-search';
import { fetchUrl } from './web/fetch-url';

export const docTools = {
  // 可下载资料(教材/试卷 PDF):搜 → 取详情 → 给下载链(天然多步,保留)
  search_documents: searchDocuments,
  get_document: getDocument,
  get_download_url: getDownloadUrl,
  // 答疑知识库(生存指南正文 / 真题题目):一步检索+取正文(替代旧 search_knowledge+get_knowledge,省 token)
  answer_knowledge: answerKnowledge,
  // 联网兜底:本地答不了(最新通知/官网内容)才用。web_search 找到 → fetch_url 读正文 → 答完标来源 url
  web_search: webSearch,
  fetch_url: fetchUrl,
};
