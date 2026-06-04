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
import { documentsStore } from '../state/documents';
import { runGeneration, cancelGeneration, resetDocChat, clearVersioning, persistDoc } from '../state/generation';
import { useApp, useActiveDoc } from '../hooks/useStores';
import { api } from '../api';
import type { GenerateProgress, FloorDef, GenerationCatalog } from '@/shared/types';

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

/** Optional, non-binding hints the user can set to steer a fresh build. They're
 *  folded into the prompt as a structured brief — every field is optional. */
interface BuildDetails {
  buildType: string;
  style: string;
  width: string;
  depth: string;
  height: string;
  floors: string;
  rooms: string;
  basement: string;
  materials: string;
  decay: string;
  furnished: string;
  lighting: string;
  /** A ready-made shell to start from (a structure-type id from the registry), and
   *  the decoration theme to build it with — both expanded by a `template` op. */
  presetType: string;
  theme: string;
}

const EMPTY_DETAILS: BuildDetails = {
  buildType: '', style: '', width: '', depth: '', height: '', floors: '',
  rooms: '', basement: '', materials: '', decay: '', furnished: '', lighting: '',
  presetType: '', theme: '',
};

const BUILD_TYPES = ['House', 'Tower', 'Cabin', 'Ruin', 'Bridge', 'Wall', 'Dungeon room', 'Shrine', 'Barn', 'Tree house', 'Other'];
const BASEMENTS = ['None', 'Small', 'Large', 'Multi-room complex'];
const DECAYS = ['None', 'Light', 'Moderate', 'Heavy'];
const FURNISHINGS = ['Empty', 'Basic', 'Detailed'];
const LIGHTINGS = ['Dim', 'Medium', 'Bright'];

/** Build the structured-hints block appended to the prompt, or '' if nothing set. */
function buildBrief(d: BuildDetails): string {
  const lines: string[] = [];
  if (d.presetType) {
    const theme = d.theme ? ` with the "${d.theme}" decoration theme` : '';
    const themeParam = d.theme ? `, params.theme "${d.theme}"` : '';
    lines.push(
      `- Start from the "${d.presetType}" preset shell${theme}: emit a \`template\` op ` +
      `(name "${d.presetType}"${themeParam}) as the base massing, then layer your own ops on top.`,
    );
  }
  if (d.buildType) lines.push(`- Type: ${d.buildType}`);
  if (d.style) lines.push(`- Style/theme: ${d.style}`);
  if (d.width || d.depth || d.height) {
    lines.push(`- Approx footprint W×D / height: ${d.width || '?'}×${d.depth || '?'} / ${d.height || '?'}`);
  }
  if (d.floors) lines.push(`- Floors: ${d.floors}`);
  if (d.rooms) lines.push(`- Rooms: ${d.rooms}`);
  if (d.basement) {
    lines.push(
      d.basement === 'Multi-room complex'
        ? '- Underground: a large MULTI-ROOM underground complex (dungeon/undercroft/catacomb) — many connected rooms off corridors, with at least one bigger/taller pillared hall, and stairs/landings linking it to the surface. Every room must be COMPLETELY DIFFERENT — its own function, layout, materials, furniture and light colour (e.g. library, prison, forge, bath, vault) — not the same room repeated or rooms that only differ in size. Make the underground footprint MUCH larger than the surface build and centre any surface build over it. Build it per 08-complex-structures.md §"Multi-room underground complex" (room grammar included).'
        : `- Basement: ${d.basement}`,
    );
  }
  if (d.materials) lines.push(`- Preferred materials: ${d.materials}`);
  if (d.decay) lines.push(`- Decay / ruin level: ${d.decay}`);
  if (d.furnished) lines.push(`- Interior: ${d.furnished}`);
  if (d.lighting) lines.push(`- Lighting: ${d.lighting}`);
  if (lines.length === 0) return '';
  return `\n\n[Build details — optional hints from the user; honor them unless they conflict with the request above or with sound building.]\n${lines.join('\n')}`;
}

const hasDetails = (d: BuildDetails): boolean => Object.values(d).some((v) => v.trim() !== '');

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

  const structure = doc?.structure ?? null;
  const floors = doc?.floors ?? [];

  const [available, setAvailable] = useState<boolean | null>(null);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [showFloors, setShowFloors] = useState(false);
  const [details, setDetails] = useState<BuildDetails>(EMPTY_DETAILS);
  const [catalog, setCatalog] = useState<GenerationCatalog | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevDocId = useRef<string | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);
  const elapsedMs = busy && startedAt ? nowTick - startedAt : 0;

  // Probe whether a credential is configured when the panel mounts, and re-probe
  // whenever the Settings panel closes (the key may have just been added there).
  useEffect(() => {
    if (settingsOpen) return;
    void api.aiAvailable().then(setAvailable);
  }, [settingsOpen]);

  // Load the composable generation registry once (structure types + themes) for
  // the preset picker. It's static for the session, so fetch it a single time.
  useEffect(() => {
    void api.generationCatalog().then(setCatalog);
  }, []);

  // Keep the newest message in view. Jump instantly when switching tabs (so the
  // transcript just appears at the bottom — no scroll-down animation on open),
  // and scroll smoothly for new messages within the same conversation.
  useEffect(() => {
    const behavior: ScrollBehavior = prevDocId.current === doc?.id ? 'smooth' : 'auto';
    prevDocId.current = doc?.id;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior });
  }, [chat.length, busy, doc?.id]);

  // Tick a live elapsed-time counter while a generation is in flight.
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setNowTick(Date.now()), 250);
    return () => clearInterval(id);
  }, [busy]);

  // Tell the viewer (via the app store) when the Floors section is open, so it
  // can scope the floor-plan highlight if "only while editing" is enabled. The
  // highlight itself is driven from App against the active doc's floor plan.
  useEffect(() => {
    store.getState().setFloorsEditing(showFloors);
    return () => store.getState().setFloorsEditing(false);
  }, [showFloors]);

  // Pre-fill the Details size from the open structure (an existing .nbt, or a
  // generated build) so editing starts from its real dimensions — but only while
  // the user hasn't typed their own size yet. size is [W, H, D].
  useEffect(() => {
    const sz = structure?.size;
    if (!sz) return;
    setDetails((d) =>
      d.width || d.depth || d.height
        ? d
        : { ...d, width: String(sz[0]), height: String(sz[1]), depth: String(sz[2]) },
    );
  }, [structure?.size]);

  // Floor edits persist immediately (with the chat history) so a defined plan
  // survives a restart even before the next prompt is sent.
  const setFloors = useCallback(
    (next: FloorDef[]) => {
      if (!doc) return;
      documentsStore.getState().setFloors(doc.id, next);
      persistDoc(doc.id);
    },
    [doc],
  );

  const addFloor = useCallback(() => {
    if (!doc) return;
    // Stack the new level a storey (~5 blocks) above the current top, so a stack
    // of floors lands at sensible, non-overlapping ranges out of the box.
    const top = floors.reduce((m, f) => Math.max(m, f.to), -1);
    const from = floors.length ? top + 1 : 0;
    const f: FloorDef = { id: crypto.randomUUID(), name: '', from, to: from + 4 };
    documentsStore.getState().setFloors(doc.id, [...floors, f]);
    persistDoc(doc.id);
  }, [doc, floors]);

  const updateFloor = useCallback(
    (id: string, patch: Partial<FloorDef>) =>
      setFloors(floors.map((f) => (f.id === id ? { ...f, ...patch } : f))),
    [floors, setFloors],
  );

  const removeFloor = useCallback(
    (id: string) => setFloors(floors.filter((f) => f.id !== id)),
    [floors, setFloors],
  );

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
    const brief = buildBrief(details);
    if (!prompt && staged.length === 0 && !brief) return;
    // Generate into the active tab; if the panel was opened with no tab open,
    // create one so the build has somewhere to live.
    const ds = documentsStore.getState();
    const docId = ds.activeId ?? ds.newDoc();
    if (ds.documents.find((d) => d.id === docId)?.busy) return;
    // Fold the optional details into the prompt as a structured brief. They steer
    // a fresh build, so clear them after sending (follow-up edits shouldn't keep
    // re-sending stale hints).
    const composed = prompt ? prompt + brief : brief ? `Generate a structure with these details:${brief}` : prompt;
    setInput('');
    setAttachments([]);
    setDetails(EMPTY_DETAILS);
    setShowDetails(false);
    setShowFloors(false);
    await runGeneration(
      docId,
      composed,
      staged.map((a) => a.dataUrl),
    );
  }, [input, attachments, details]);

  const cancel = useCallback(() => {
    if (doc) cancelGeneration(doc.id);
  }, [doc]);

  const reset = useCallback(() => {
    if (doc) resetDocChat(doc.id);
    setInput('');
    setAttachments([]);
    setDetails(EMPTY_DETAILS);
    setShowDetails(false);
    setShowFloors(false);
  }, [doc]);

  const setField = useCallback(
    (key: keyof BuildDetails, value: string) => setDetails((d) => ({ ...d, [key]: value })),
    [],
  );

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
        <button
          className="btn sm"
          title="Browse the content pack's blocks and copy their ids"
          onClick={() => store.getState().setCatalogOpen(true)}
        >
          Blocks
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
                {m.meta.version != null && (
                  <span className="gen-stat gen-stat-version">v{m.meta.version}</span>
                )}
                {m.meta.size && (
                  <span className="gen-stat" title="Dimensions (W×H×D)">
                    <span className="gen-stat-label">Size</span>
                    <span className="gen-stat-value">{m.meta.size.join('×')}</span>
                  </span>
                )}
                {m.meta.blockCount != null && (
                  <span className="gen-stat" title="Block count">
                    <span className="gen-stat-label">Blocks</span>
                    <span className="gen-stat-value">{m.meta.blockCount.toLocaleString()}</span>
                  </span>
                )}
                {m.meta.tookMs != null && (
                  <span className="gen-stat" title="Generation time">
                    <span className="gen-stat-label">Time</span>
                    <span className="gen-stat-value">{formatElapsed(m.meta.tookMs)}</span>
                  </span>
                )}
                {m.meta.tokensIn != null && (
                  <span className="gen-stat" title="Prompt tokens sent (incl. cached context)">
                    <span className="gen-stat-label">↑ In</span>
                    <span className="gen-stat-value">{m.meta.tokensIn.toLocaleString()}</span>
                  </span>
                )}
                {m.meta.tokensOut != null && (
                  <span className="gen-stat" title="Tokens generated">
                    <span className="gen-stat-label">↓ Out</span>
                    <span className="gen-stat-value">{m.meta.tokensOut.toLocaleString()}</span>
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
                {progress?.designPhase && (
                  <span className="gen-design-phase">
                    {' · '}{progress.designPhase}
                    {progress.designStep ? ` (${progress.designStep}/${progress.designSteps})` : ''}
                  </span>
                )}
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
        {showDetails && (
          <div className="gen-details">
            <div className="gen-details-grid">
              <label className="gen-field">
                <span>Preset shell</span>
                <select value={details.presetType} onChange={(e) => setField('presetType', e.target.value)} disabled={busy}>
                  <option value="">None</option>
                  {(catalog?.structureTypes ?? []).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </label>
              <label className="gen-field">
                <span>Theme</span>
                <select value={details.theme} onChange={(e) => setField('theme', e.target.value)} disabled={busy || !details.presetType}>
                  <option value="">Default</option>
                  {(catalog?.themes ?? []).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </label>
              <label className="gen-field">
                <span>Type</span>
                <select value={details.buildType} onChange={(e) => setField('buildType', e.target.value)} disabled={busy}>
                  <option value="">Any</option>
                  {BUILD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="gen-field gen-field-wide">
                <span>Style / theme</span>
                <input type="text" value={details.style} placeholder="cozy, abandoned, medieval…" onChange={(e) => setField('style', e.target.value)} disabled={busy} />
              </label>
              <label className="gen-field gen-field-size">
                <span>Size (W×D×H)</span>
                <span className="gen-size-inputs">
                  <input type="number" min={1} value={details.width} placeholder="W" onChange={(e) => setField('width', e.target.value)} disabled={busy} />
                  <input type="number" min={1} value={details.depth} placeholder="D" onChange={(e) => setField('depth', e.target.value)} disabled={busy} />
                  <input type="number" min={1} value={details.height} placeholder="H" onChange={(e) => setField('height', e.target.value)} disabled={busy} />
                </span>
              </label>
              <label className="gen-field gen-field-sm">
                <span>Floors</span>
                <input type="number" min={1} value={details.floors} placeholder="—" onChange={(e) => setField('floors', e.target.value)} disabled={busy} />
              </label>
              <label className="gen-field gen-field-sm">
                <span>Rooms</span>
                <input type="number" min={1} value={details.rooms} placeholder="—" onChange={(e) => setField('rooms', e.target.value)} disabled={busy} />
              </label>
              <label className="gen-field">
                <span>Basement</span>
                <select value={details.basement} onChange={(e) => setField('basement', e.target.value)} disabled={busy}>
                  <option value="">—</option>
                  {BASEMENTS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </label>
              <label className="gen-field gen-field-wide">
                <span>Materials</span>
                <input type="text" value={details.materials} placeholder="spruce, cobblestone, dark oak…" onChange={(e) => setField('materials', e.target.value)} disabled={busy} />
              </label>
              <label className="gen-field">
                <span>Decay</span>
                <select value={details.decay} onChange={(e) => setField('decay', e.target.value)} disabled={busy}>
                  <option value="">—</option>
                  {DECAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              <label className="gen-field">
                <span>Interior</span>
                <select value={details.furnished} onChange={(e) => setField('furnished', e.target.value)} disabled={busy}>
                  <option value="">—</option>
                  {FURNISHINGS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
              <label className="gen-field">
                <span>Lighting</span>
                <select value={details.lighting} onChange={(e) => setField('lighting', e.target.value)} disabled={busy}>
                  <option value="">—</option>
                  {LIGHTINGS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
            </div>
          </div>
        )}
        {showFloors && (
          <div className="gen-floors">
            <div className="gen-floors-head">
              <span>Floor plan</span>
              <span className="gen-floors-hint">
                Give each level a name and the Y where it starts and ends (y=0 is the ground). The
                ranges are highlighted in the viewer and sent as context, so you can later say
                “redo the basement”.
              </span>
            </div>
            {floors.length === 0 && (
              <p className="gen-floors-empty">
                No floors yet. Add one to give the AI a vertical layout — e.g. Basement y 0–4,
                Ground floor y 5–9, Upper floor y 10–14.
              </p>
            )}
            {floors.map((f) => (
              <div key={f.id} className="gen-floor-row">
                <input
                  className="gen-floor-name"
                  type="text"
                  placeholder="Floor name (e.g. Basement)"
                  value={f.name}
                  disabled={busy}
                  onChange={(e) => updateFloor(f.id, { name: e.target.value })}
                />
                <label className="gen-floor-y">
                  <span>From</span>
                  <input
                    type="number"
                    value={f.from}
                    disabled={busy}
                    onChange={(e) => updateFloor(f.id, { from: Math.trunc(Number(e.target.value)) || 0 })}
                  />
                </label>
                <label className="gen-floor-y">
                  <span>To</span>
                  <input
                    type="number"
                    value={f.to}
                    disabled={busy}
                    onChange={(e) => updateFloor(f.id, { to: Math.trunc(Number(e.target.value)) || 0 })}
                  />
                </label>
                <button
                  className="gen-floor-remove"
                  title="Remove floor"
                  aria-label="Remove floor"
                  disabled={busy}
                  onClick={() => removeFloor(f.id)}
                >
                  ✕
                </button>
              </div>
            ))}
            <button className="btn sm gen-floor-add" onClick={addFloor} disabled={busy}>
              + Add floor
            </button>
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
          <button
            className={`btn sm gen-details-toggle${hasDetails(details) ? ' has-details' : ''}`}
            title="Optional build details (type, size, materials…)"
            aria-pressed={showDetails}
            disabled={busy || available === false}
            onClick={() =>
              setShowDetails((v) => {
                const next = !v;
                if (next) setShowFloors(false);
                return next;
              })
            }
          >
            ⚙ Details{hasDetails(details) ? ' •' : ''}
          </button>
          <button
            className={`btn sm gen-details-toggle${floors.length > 0 ? ' has-details' : ''}`}
            title="Define the build's vertical levels (floors) as context for the AI"
            aria-pressed={showFloors}
            disabled={busy}
            onClick={() =>
              setShowFloors((v) => {
                const next = !v;
                if (next) setShowDetails(false);
                return next;
              })
            }
          >
            ▦ Floors{floors.length > 0 ? ` (${floors.length})` : ''}
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
