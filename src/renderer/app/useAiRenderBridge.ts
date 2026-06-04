// The AI generator (main) asks the renderer to render each version it emits and hand
// back screenshots for its self-review loop. We route by session id: the ACTIVE tab's
// build renders in the on-screen viewer (the user watches it evolve), while a
// BACKGROUND tab's build renders in the headless capture viewer so it doesn't disturb
// what the user is looking at — letting multiple tabs generate at once. Each render is
// chained so captures never interleave on the shared viewers.
import { useEffect, useRef, type MutableRefObject } from 'react';
import type { RenderRequest } from '@/shared/types';
import { api } from '../api';
import { documentsStore, docBySession } from '../state/documents';
import { recordVersion } from '../state/generation';
import type { Viewer } from '../viewer/viewer';
import { captureAll } from './capture';

/** Wire the AI render request → render → screenshot → reply bridge. Reads the live
 *  viewers from refs, so it subscribes once and stays valid as the viewers change. */
export function useAiRenderBridge(
  viewerRef: MutableRefObject<Viewer | null>,
  captureRef: MutableRefObject<Viewer | null>,
): void {
  // Serializes AI render captures so two background generations can't interleave on
  // the single shared capture viewer (each show() would clobber the other).
  const renderChain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const handleRender = async ({ requestId, sessionId, path, version }: RenderRequest) => {
      try {
        const doc = docBySession(sessionId);
        const isActive = !!doc && documentsStore.getState().activeId === doc.id;
        const data = await api.loadStructure(path);
        if (doc) {
          documentsStore.getState().patchDoc(doc.id, { structure: data, path });
          // Surface this just-rendered version in the Versions panel and follow it.
          recordVersion(doc.id, version, path);
        }
        let target: Viewer | null;
        if (isActive && viewerRef.current) {
          await viewerRef.current.show(data, version > 1);
          target = viewerRef.current;
        } else {
          await captureRef.current?.show(data);
          target = captureRef.current;
        }
        const images = target ? captureAll(target) : [];
        api.sendRenderResult({ requestId, images });
      } catch (err) {
        api.sendRenderResult({ requestId, error: String(err) });
      }
    };
    // Chain each render so captures never interleave on the shared viewers.
    api.onAiRenderRequest((req) => {
      renderChain.current = renderChain.current.then(() => handleRender(req));
    });
  }, [viewerRef, captureRef]);
}
