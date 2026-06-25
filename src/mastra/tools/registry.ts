import { searchDocuments } from './documents/search-documents';
import { getDocument } from './documents/get-document';
import { getDownloadUrl } from './documents/get-download-url';

export const docTools = {
  search_documents: searchDocuments,
  get_document: getDocument,
  get_download_url: getDownloadUrl,
};
