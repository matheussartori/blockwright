// Per-document chat/session PERSISTENCE: writes a doc's conversation + session ids to the
// main-process chat-history store (keyed by file path, or the session id for an Untitled
// build), so reopening a file restores its chat and resumes the SDK session. Split out of the
// generation loop so the version-chain ops can persist without a circular import.
import { api } from '../api';
import { documentsStore, type Document } from './documents';

/** Persistent chat key: the file path for a saved `.nbt`, else the session id. */
export function chatKey(doc: Document): string {
  return doc.filePath ?? doc.sessionId;
}

/** Persist a document's current chat + session info so it survives restarts. */
export function persistDoc(docId: string): void {
  const doc = documentsStore.getState().documents.find((d) => d.id === docId);
  if (!doc) return;
  void api.chatHistorySave(chatKey(doc), {
    sessionId: doc.sessionId,
    sdkSessionId: doc.sdkSessionId,
    version: doc.version,
    messages: doc.chat,
    baselinePath: doc.baselinePath,
    floors: doc.floors,
    generated: doc.generated,
  });
}
