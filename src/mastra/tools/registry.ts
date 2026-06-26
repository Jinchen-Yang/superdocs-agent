import { searchDocuments } from './documents/search-documents';
import { getDocument } from './documents/get-document';
import { getDownloadUrl } from './documents/get-download-url';
import { searchKnowledge } from './knowledge/search-knowledge';
import { getKnowledge } from './knowledge/get-knowledge';

export const docTools = {
  // 可下载资料(教材/试卷 PDF)
  search_documents: searchDocuments,
  get_document: getDocument,
  get_download_url: getDownloadUrl,
  // 答疑知识库(生存指南正文 / 真题题目)
  search_knowledge: searchKnowledge,
  get_knowledge: getKnowledge,
};
