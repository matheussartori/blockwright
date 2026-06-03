// The AI "Generate" panel: a chat where the user describes a build, Claude (in
// main) generates the authoring JSON, the app compiles it to a versioned temp
// `.nbt`, and loads it into the viewer for a live preview. Follow-up messages
// edit the current build (the generate→preview→iterate loop from
// knowledge/nbt/07-workflow.md).
//
// This component is a VIEW over the ACTIVE document: the chat transcript, the AI
// session and the in-flight generation state all live on the document (so they
// follow tabs and keep running in the background — see state/documents.ts and
// state/generation.ts). The panel only owns the composer's transient state
// (input text + staged attachments).
import { useCallback, useEffect, useRef, useState } from 'react';
import { store } from '../state/store';
import { windowsStore } from '../state/windows';
import { documentsStore } from '../state/documents';
import { runGeneration, cancelGeneration, resetDocChat, clearVersioning } from '../state/generation';
import { useApp, useActiveDoc } from '../hooks/useStores';
import { api } from '../api';
import type { GenerateProgress } from '@/shared/types';

const PHASE_LABEL: Record<GenerateProgress['phase'], string> = {
  thinking: 'Thinking…',
  building: 'Writing structure…',
  compiling: 'Compiling…',
  rendering: 'Rendering preview…',
  reviewing: 'Reviewing the result…',
};

/** Image MIME types Claude accepts as reference attachments. */
const ACCEPTED_IMAGE = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/** A reference image staged in the composer (and echoed into the sent message). */
interface Attachment {
  id: string;
  /** Full `data:<mime>;base64,…` URL — used for the <img> preview and, split, for IPC. */
  dataUrl: string;
}

/** "m:ss" from a millisecond duration. */
function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Read image files into base64 data URLs, skipping non-images. */
function readImages(files: Iterable<File>): Promise<Attachment[]> {
  const reads = Array.from(files)
    .filter((f) => ACCEPTED_IMAGE.includes(f.type))
    .map(
      (f) =>
        new Promise<Attachment>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve({ id: crypto.randomUUID(), dataUrl: String(r.result) });
          r.onerror = () => reject(r.error);
          r.readAsDataURL(f);
        }),
    );
  return Promise.all(reads);
}

const EXAMPLES = [
  'A small oak cottage with a furnished interior',
  'A stone watchtower, 5×5 footprint, 12 blocks tall',
  'A cozy cabin with a pitched spruce roof and a porch',
];

/** The generate chat body. Rendered inside the dock/floating chrome (which
 *  provides the title bar, detach/redock and minimize), so it only owns its own
 *  toolbar (New / Close), the warning, the transcript and the composer. */
export function GenerateContent() {
  const settingsOpen = useApp((s) => s.settingsOpen);
  const doc = useActiveDoc();
  const chat = doc?.chat ?? [];
  const busy = doc?.busy ?? false;
  const progress = doc?.progress ?? null;
  const startedAt = doc?.startedAt ?? null;

  const [available, setAvailable] = useState<boolean | null>(null);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [nowTick, setNowTick] = useState(Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const elapsedMs = busy && startedAt ? nowTick - startedAt : 0;

  // Probe whether a credential is configured when the panel mounts, and re-probe
  // whenever the Settings panel closes (the key may have just been added there).
  useEffect(() => {
    if (settingsOpen) return;
    void api.aiAvailable().then(setAvailable);
  }, [settingsOpen]);

  // Keep the newest message in view (also when switching to a tab with history).
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat.length, busy, doc?.id]);

  // Tick a live elapsed-time counter while a generation is in flight.
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setNowTick(Date.now()), 250);
    return () => clearInterval(id);
  }, [busy]);

  const close = () => windowsStore.getState().setVisible('generate', false);

  const addFiles = useCallback(async (files: Iterable<File>) => {
    const added = await readImages(files);
    if (added.length) setAttachments((a) => [...a, ...added]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((a) => a.filter((x) => x.id !== id));
  }, []);

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData.files);
      if (files.some((f) => ACCEPTED_IMAGE.includes(f.type))) {
        e.preventDefault();
        void addFiles(files);
      }
    },
    [addFiles],
  );

  const send = useCallback(async () => {
    const prompt = input.trim();
    const staged = attachments;
    if (!prompt && staged.length === 0) return;
    // Generate into the active tab; if the panel was opened with no tab open,
    // create one so the build has somewhere to live.
    const ds = documentsStore.getState();
    const docId = ds.activeId ?? ds.newDoc();
    if (ds.documents.find((d) => d.id === docId)?.busy) return;
    setInput('');
    setAttachments([]);
    await runGeneration(
      docId,
      prompt,
      staged.map((a) => a.dataUrl),
    );
  }, [input, attachments]);

  const cancel = useCallback(() => {
    if (doc) cancelGeneration(doc.id);
  }, [doc]);

  const reset = useCallback(() => {
    if (doc) resetDocChat(doc.id);
    setInput('');
    setAttachments([]);
  }, [doc]);

  // Number of generated builds (v0/source excluded) — there's only something to
  // flatten once at least one version exists.
  const generatedCount = doc?.versions.filter((v) => v.version >= 1).length ?? 0;

  const clearVersions = useCallback(() => {
    if (doc) clearVersioning(doc.id);
  }, [doc]);

  return (
    <div className="gen-content" role="dialog" aria-label="Generate structure">
      <div className="gen-bar">
        <button className="btn sm" onClick={reset} disabled={busy || chat.length === 0}>
          New
        </button>
        <button
          className="btn sm"
          title="Clear the chat and version history, keeping the current build as a fresh original"
          onClick={clearVersions}
          disabled={busy || generatedCount === 0}
        >
          Clear versions
        </button>
        <button className="settings-close" title="Close" aria-label="Close" onClick={close}>
          ✕
        </button>
      </div>

      {available === false && (
        <div className="gen-warn">
          No Anthropic API key yet.{' '}
          <button className="link" onClick={() => store.getState().setSettingsOpen(true)}>
            Add one in Settings
          </button>{' '}
          to start generating.
        </div>
      )}

      <div className="gen-messages" ref={scrollRef}>
        {chat.length === 0 && (
          <div className="gen-empty">
            <p>
              Describe a structure for Claude to build. It reads the Blockwright NBT guides, generates
              a <code>.nbt</code>, and renders it here.
            </p>
            <p className="gen-hint">
              Then keep chatting to refine it — “make the roof red”, “add a second floor”, “furnish
              the interior”. You can also paste or attach reference images.
            </p>
            <ul className="gen-examples">
              {EXAMPLES.map((ex) => (
                <li key={ex}>
                  <button className="gen-example" onClick={() => setInput(ex)} disabled={busy}>
                    {ex}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {chat.map((m, i) => (
          <div key={i} className={`gen-msg ${m.role}${m.error ? ' error' : ''}`}>
            {m.meta && (
              <div className="gen-stats gen-result-stats">
                <span className="gen-stat gen-stat-version">v{m.meta.version}</span>
                <span className="gen-stat" title="Dimensions (W×H×D)">
                  <span className="gen-stat-label">Size</span>
                  <span className="gen-stat-value">{m.meta.size.join('×')}</span>
                </span>
                <span className="gen-stat" title="Block count">
                  <span className="gen-stat-label">Blocks</span>
                  <span className="gen-stat-value">{m.meta.blockCount.toLocaleString()}</span>
                </span>
                {m.meta.tookMs != null && (
                  <span className="gen-stat" title="Generation time">
                    <span className="gen-stat-label">Time</span>
                    <span className="gen-stat-value">{formatElapsed(m.meta.tookMs)}</span>
                  </span>
                )}
              </div>
            )}
            {m.images && m.images.length > 0 && (
              <div className="gen-msg-images">
                {m.images.map((src, j) => (
                  <img
                    key={j}
                    className="gen-msg-thumb"
                    src={src}
                    alt="reference"
                    title="Click to preview"
                    onClick={() => store.getState().setImagePreview(src)}
                  />
                ))}
              </div>
            )}
            {m.text && <div className="gen-msg-text">{m.text}</div>}
          </div>
        ))}
        {busy && (
          <div className="gen-msg assistant gen-live">
            <div className="gen-progress-head">
              <span className="gen-spinner" aria-hidden />
              <span className="gen-phase">
                {progress ? PHASE_LABEL[progress.phase] : 'Generating…'}
              </span>
            </div>
            <div className="gen-stats">
              <span className="gen-stat" title="Elapsed time">
                <span className="gen-stat-label">Time</span>
                <span className="gen-stat-value">{formatElapsed(elapsedMs)}</span>
              </span>
              {progress && progress.outputTokens > 0 && (
                <>
                  <span className="gen-stat" title="Prompt tokens sent">
                    <span className="gen-stat-label">↑ In</span>
                    <span className="gen-stat-value">{progress.inputTokens.toLocaleString()}</span>
                  </span>
                  <span className="gen-stat" title="Tokens generated">
                    <span className="gen-stat-label">↓ Out</span>
                    <span className="gen-stat-value">{progress.outputTokens.toLocaleString()}</span>
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div
        className="gen-composer"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          if (Array.from(e.dataTransfer.files).some((f) => ACCEPTED_IMAGE.includes(f.type))) {
            e.preventDefault();
            e.stopPropagation(); // don't let the window-level .nbt drop handler see it
            void addFiles(e.dataTransfer.files);
          }
        }}
      >
        {attachments.length > 0 && (
          <div className="gen-attachments">
            {attachments.map((a) => (
              <div key={a.id} className="gen-attachment">
                <img src={a.dataUrl} alt="reference" />
                <button
                  className="gen-attachment-remove"
                  title="Remove"
                  aria-label="Remove image"
                  onClick={() => removeAttachment(a.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          className="gen-input"
          placeholder="Describe a structure…"
          value={input}
          rows={3}
          disabled={busy || available === false}
          onChange={(e) => setInput(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            e.stopPropagation(); // keep typing out of the viewer's WASD / F shortcuts
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="gen-composer-actions">
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED_IMAGE.join(',')}
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = ''; // allow re-selecting the same file
            }}
          />
          <button
            className="btn sm gen-attach"
            title="Attach reference image"
            disabled={busy || available === false}
            onClick={() => fileInput.current?.click()}
          >
            🖼 Image
          </button>
          {busy ? (
            <button className="btn gen-send gen-cancel" onClick={cancel}>
              Cancel
            </button>
          ) : (
            <button
              className="btn primary gen-send"
              onClick={() => void send()}
              disabled={(!input.trim() && attachments.length === 0) || available === false}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
