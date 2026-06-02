// The AI "New Structure" panel: a left-docked chat where the user describes a
// build, Claude (in main) generates the authoring JSON, the app compiles it to a
// versioned temp `.nbt`, and we load that into the viewer for a live preview.
// Follow-up messages edit the current structure (the generate→preview→iterate
// loop from knowledge/nbt/07-workflow.md). Chat state is local; the conversation
// the model sees lives in main, keyed by this panel's session id.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { store } from '../state/store';
import { useApp } from '../hooks/useStores';
import type { GenerateProgress, GenerateImage } from '@/shared/types';

const PHASE_LABEL: Record<GenerateProgress['phase'], string> = {
  thinking: 'Thinking…',
  building: 'Writing structure…',
  compiling: 'Compiling…',
};

/** Image MIME types Claude accepts as reference attachments. */
const ACCEPTED_IMAGE = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/** A reference image staged in the composer (and echoed into the sent message). */
interface Attachment {
  id: string;
  /** Full `data:<mime>;base64,…` URL — used both for the <img> preview and, split, for IPC. */
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

/** Mirror of App's `load` (extra args optional). Temp versions load with
 *  `recent: false` so they never enter the recent-files list. */
type LoadFn = (path: string, preserveCamera?: boolean, recent?: boolean) => Promise<void>;

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  error?: boolean;
  /** Reference image data URLs shown as thumbnails (user messages only). */
  images?: string[];
  meta?: { version: number; size: [number, number, number]; blockCount: number; tookMs?: number };
}

const EXAMPLES = [
  'A small oak cottage with a furnished interior',
  'A stone watchtower, 5×5 footprint, 12 blocks tall',
  'A cozy cabin with a pitched spruce roof and a porch',
];

export function NewStructurePanel({ load }: { load: LoadFn }) {
  const open = useApp((s) => s.genOpen);
  const settingsOpen = useApp((s) => s.settingsOpen);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<GenerateProgress | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const sessionId = useRef<string>(crypto.randomUUID());
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Live token/phase progress pushed from main during generation. Registered
  // once; we filter to this panel's current session.
  useEffect(() => {
    api.onAiProgress((p) => {
      if (p.sessionId === sessionId.current) setProgress(p);
    });
  }, []);

  // Probe whether an API key is configured when the panel opens, and re-probe
  // whenever the Settings panel closes (the key may have just been added there).
  useEffect(() => {
    if (!open || settingsOpen) return;
    void api.aiAvailable().then(setAvailable);
  }, [open, settingsOpen]);

  // Keep the newest message in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  // Tick a live elapsed-time counter while a generation is in flight.
  useEffect(() => {
    if (!busy) return;
    const start = Date.now();
    setElapsedMs(0);
    const id = setInterval(() => setElapsedMs(Date.now() - start), 250);
    return () => clearInterval(id);
  }, [busy]);

  const close = () => store.getState().setGenOpen(false);

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
    if ((!prompt && staged.length === 0) || busy) return;
    // Reference images can't ride a string prompt; split off the data-URL prefix
    // so main forwards just the base64 payload + media type to the model.
    const images: GenerateImage[] = staged.map((a) => {
      const [head, data] = a.dataUrl.split(',');
      return { mediaType: head.slice(5, head.indexOf(';')), data };
    });
    const promptText = prompt || 'Build a Minecraft structure based on the reference image(s).';
    setInput('');
    setAttachments([]);
    setMessages((m) => [
      ...m,
      { role: 'user', text: prompt, images: staged.map((a) => a.dataUrl) },
    ]);
    setProgress(null);
    setBusy(true);
    const startedAt = Date.now();
    try {
      const result = await api.aiGenerate(sessionId.current, promptText, images);
      if (result.ok) {
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            text: result.summary || 'Structure generated.',
            meta: {
              version: result.version,
              size: result.size,
              blockCount: result.blockCount,
              tookMs: Date.now() - startedAt,
            },
          },
        ]);
        // First version frames the build; later versions keep the camera so the
        // user sees exactly what changed.
        await load(result.path, result.version > 1, false);
      } else if (result.canceled) {
        setMessages((m) => [...m, { role: 'assistant', text: 'Canceled.' }]);
      } else {
        setMessages((m) => [...m, { role: 'assistant', text: result.error, error: true }]);
      }
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', text: String(err), error: true }]);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [input, attachments, busy, load]);

  const cancel = useCallback(() => {
    void api.aiCancel(sessionId.current);
  }, []);

  const reset = useCallback(() => {
    void api.aiResetSession(sessionId.current);
    sessionId.current = crypto.randomUUID();
    setMessages([]);
    setInput('');
    setAttachments([]);
  }, []);

  if (!open) return null;

  return (
    <aside className="gen-panel" role="dialog" aria-label="Generate structure">
      <header className="gen-head">
        <span className="gen-title">Generate structure ✨</span>
        <div className="gen-head-actions">
          <button className="btn sm" onClick={reset} disabled={busy || messages.length === 0}>
            New
          </button>
          <button className="settings-close" title="Close" aria-label="Close" onClick={close}>
            ✕
          </button>
        </div>
      </header>

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
        {messages.length === 0 && (
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
        {messages.map((m, i) => (
          <div key={i} className={`gen-msg ${m.role}${m.error ? ' error' : ''}`}>
            {m.meta && (
              <div className="gen-version">
                v{m.meta.version} · {m.meta.size.join('×')} · {m.meta.blockCount} blocks
                {m.meta.tookMs != null && ` · ${formatElapsed(m.meta.tookMs)}`}
              </div>
            )}
            {m.images && m.images.length > 0 && (
              <div className="gen-msg-images">
                {m.images.map((src, j) => (
                  <img key={j} className="gen-msg-thumb" src={src} alt="reference" />
                ))}
              </div>
            )}
            {m.text && <div className="gen-msg-text">{m.text}</div>}
          </div>
        ))}
        {busy && (
          <div className="gen-msg assistant">
            <div className="gen-progress">
              <span className="gen-msg-text gen-thinking">
                {progress ? PHASE_LABEL[progress.phase] : 'Generating…'}
              </span>
              <span className="gen-tokens gen-elapsed" title="Elapsed time">
                {formatElapsed(elapsedMs)}
              </span>
              {progress && progress.outputTokens > 0 && (
                <span className="gen-tokens" title="Prompt ↑ / generated ↓ tokens so far">
                  ↑{progress.inputTokens.toLocaleString()} ↓{progress.outputTokens.toLocaleString()} tok
                </span>
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
    </aside>
  );
}
