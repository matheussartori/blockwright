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
import { useApp, useActiveDoc, useT } from '../hooks/useStores';
import { api } from '../api';
import type { MessageKey } from '@/shared/i18n';
import type { GenerateProgress, FloorDef, GenerationCatalog, GenerationModule, BuildSelection } from '@/shared/types';

const PHASE_LABEL: Record<GenerateProgress['phase'], MessageKey> = {
  thinking: 'gen.phase.thinking',
  building: 'gen.phase.building',
  compiling: 'gen.phase.compiling',
  rendering: 'gen.phase.rendering',
  reviewing: 'gen.phase.reviewing',
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

const EXAMPLES: MessageKey[] = ['gen.example1', 'gen.example2', 'gen.example3'];

/** The build modules the user picked for a fresh build: a structure type, a
 *  decoration, and the structure's tunable params (floors/basement/attic/…). They
 *  describe WHAT to build as plain-language guidance AND ride along as a structured
 *  selection so the system prompt loads only those modules' guides. They never emit a
 *  `template` op — the model designs the build itself (no stamped initial shell). */
interface BuildDetails {
  structureType: string;
  decoration: string;
  /** Selected roof module id (category 'roof'), or '' for none/auto. */
  roof: string;
  /** Selected basement module id (category 'basement'), or '' for none. */
  basement: string;
  /** Structure-type param values, keyed by param name. Missing keys fall back to
   *  the param's default when the brief is built. */
  params: Record<string, string | number>;
  /** Explicit build size [W, D, H]. `null` = use the size derived from the params
   *  (so picking floors/basement/attic auto-sizes the box); set when the user edits. */
  size: { w: number; d: number; h: number } | null;
}

const EMPTY_DETAILS: BuildDetails = { structureType: '', decoration: '', roof: '', basement: '', params: {}, size: null };

/** The full param set for the chosen structure: the user's picks merged over each
 *  param's default — so the brief always names every structural param explicitly,
 *  never leaving floors/basement/attic to the model to infer. */
function resolveDetailParams(d: BuildDetails, struct: GenerationModule | undefined): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const p of struct?.params ?? []) out[p.name] = d.params[p.name] ?? p.default;
  return out;
}

/** A sensible default build size for the chosen structure + params, so the box is
 *  never too small for the levels asked for (the old "suffocatingly small" failure).
 *  A storeyed structure (one with a `floors` param) sizes its height to fit the
 *  basement + floors + roof; others get a tall-ish default. The user can override. */
function derivedSize(struct: GenerationModule | undefined, params: Record<string, string | number>): { w: number; d: number; h: number } {
  const hasFloors = (struct?.params ?? []).some((p) => p.name === 'floors');
  const w = 11, d = 11;
  if (!hasFloors) return { w: 9, d: 9, h: 16 }; // e.g. a tower
  const floors = Number(params.floors ?? 1);
  const basement = params.basement && params.basement !== 'none' ? 1 : 0;
  const attic = params.attic && params.attic !== 'none' ? 1 : 0;
  const levels = floors + basement;
  const h = levels * 5 + Math.floor(Math.min(w, d) / 2) + 1 + (attic ? 2 : 0);
  return { w, d, h };
}

/** The effective size: the user's override, else the derived default. The selected
 *  basement module (now its own select, not a house param) is folded back in so a
 *  basement still auto-grows the box. */
function effectiveSize(d: BuildDetails, struct: GenerationModule | undefined): { w: number; d: number; h: number } {
  const params = { ...resolveDetailParams(d, struct), basement: d.basement || 'none' };
  return d.size ?? derivedSize(struct, params);
}

/** Build the structured-hints block appended to the prompt, or '' if no structure
 *  module was chosen. The structure picker is OPTIONAL guidance: it tells the model
 *  WHAT to build (type, decoration, size, per-type params) in plain language and asks
 *  it to design the build ITSELF from scratch with its own ops. It deliberately does
 *  NOT emit a `template` op — no stamped initial shell (that made every house look the
 *  same); the per-type params (floors/basement/attic/…) ride along only as intent. */
function buildBrief(d: BuildDetails, catalog: GenerationCatalog | null): string {
  if (!d.structureType) return '';
  const s = catalog?.structure.find((m) => m.id === d.structureType);
  const deco = d.decoration ? catalog?.decoration.find((m) => m.id === d.decoration) : undefined;
  const roof = d.roof ? catalog?.roof.find((m) => m.id === d.roof) : undefined;
  const basement = d.basement ? catalog?.basement.find((m) => m.id === d.basement) : undefined;
  const sz = effectiveSize(d, s);
  const label = s?.label ?? d.structureType;
  const decoClause = deco ? ` with the "${deco.label}" decoration (its materials and mood)` : '';
  // Plain-language characteristics from the per-type params (floors/attic/…),
  // skipping internal-only knobs the user never sets as design intent.
  const traits = Object.entries(resolveDetailParams(d, s))
    .filter(([k]) => k !== 'seed' && k !== 'decay')
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  return (
    `\n\n[Build details — guidance the user picked, NOT a fixed mold. Design and build this structure YOURSELF, from scratch, with your own ops. Do NOT use a \`template\` op or any stamped preset shell.]\n` +
    `- Build a ${label}${decoClause}, roughly ${sz.w}×${sz.h}×${sz.d} (W×H×D).\n` +
    (traits ? `- Desired characteristics: ${traits}.\n` : '') +
    (roof ? `- Roof: a ${roof.label} roof (see its module guide).\n` : '') +
    (basement ? `- Basement: a ${basement.label} (see its module guide).\n` : '') +
    `- Make it distinctive: design the footprint, massing, roofline and openings to fit the user's description above — every build should read as its own structure, never a generic stamped shell.`
  );
}

/** The structured selection sent alongside the prompt (drives knowledge loading: one
 *  guide per selected module, so an unused roof/basement guide is never sent). */
function buildSelection(d: BuildDetails): BuildSelection {
  return {
    structureType: d.structureType || undefined,
    decoration: d.decoration || undefined,
    roof: d.roof || undefined,
    basement: d.basement || undefined,
  };
}

const hasDetails = (d: BuildDetails): boolean =>
  d.structureType !== '' || d.decoration !== '' || d.roof !== '' || d.basement !== '';

/** Does a roof/basement module apply to the chosen structure? True when it declares no
 *  `appliesTo` (fits any structure) or its `appliesTo` includes the chosen structure id.
 *  Mirrors `moduleAppliesTo` in the domain — the renderer can't import main code, so the
 *  trivial check is duplicated here. Drives the Details select filtering. */
function moduleFits(m: GenerationModule, structureType: string): boolean {
  if (!m.appliesTo || m.appliesTo.length === 0) return true;
  return structureType !== '' && m.appliesTo.includes(structureType);
}

/** The generate chat body. Rendered inside the dock/floating chrome (which
 *  provides the title bar, detach/redock and minimize), so it only owns its own
 *  toolbar (New / Close), the warning, the transcript and the composer. */
export function GenerateContent() {
  const t = useT();
  const settingsOpen = useApp((s) => s.settingsOpen);
  const doc = useActiveDoc();
  const chat = doc?.chat ?? [];
  const busy = doc?.busy ?? false;
  const progress = doc?.progress ?? null;
  const startedAt = doc?.startedAt ?? null;

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

  // Details (structure/decoration) is an optional convenience, not a required first
  // step — start every conversation with it collapsed so a build can come from a
  // free-form prompt alone.
  useEffect(() => {
    setShowDetails(false);
    setShowFloors(false);
  }, [doc?.id]);

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
    const brief = buildBrief(details, catalog);
    if (!prompt && staged.length === 0 && !brief) return;
    // Generate into the active tab; if the panel was opened with no tab open,
    // create one so the build has somewhere to live.
    const ds = documentsStore.getState();
    const docId = ds.activeId ?? ds.newDoc();
    if (ds.documents.find((d) => d.id === docId)?.busy) return;
    // Fold the chosen modules into the prompt as a structured brief, and send the
    // selection separately so the system prompt loads only those modules' guides.
    // They steer a fresh build, so clear them after sending (follow-up edits
    // shouldn't keep re-sending stale hints).
    const composed = prompt ? prompt + brief : brief ? `Generate a structure with these details:${brief}` : prompt;
    const selection = buildSelection(details);
    setInput('');
    setAttachments([]);
    setDetails(EMPTY_DETAILS);
    setShowDetails(false);
    setShowFloors(false);
    await runGeneration(
      docId,
      composed,
      staged.map((a) => a.dataUrl),
      selection,
    );
  }, [input, attachments, details, catalog]);

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
    (key: 'structureType' | 'decoration' | 'roof' | 'basement', value: string) =>
      // Switching structure drops the old type's params + size (they don't carry over)
      // AND clears the roof/basement (the compatible set is structure-specific). A
      // basement choice re-derives the size (clears any manual override) so picking a
      // cellar auto-grows the box, mirroring the old basement param.
      setDetails((d) =>
        key === 'structureType'
          ? { ...d, structureType: value, params: {}, size: null, roof: '', basement: '' }
          : key === 'basement'
            ? { ...d, basement: value, size: null }
            : { ...d, [key]: value },
      ),
    [],
  );

  // Changing a structural param re-derives the size (clears any manual override), so
  // picking "2 floors + basement" auto-grows the box instead of staying too small.
  const setParam = useCallback(
    (name: string, value: string | number) => setDetails((d) => ({ ...d, params: { ...d.params, [name]: value }, size: null })),
    [],
  );

  const setSize = useCallback(
    (axis: 'w' | 'd' | 'h', value: number, base: { w: number; d: number; h: number }) =>
      setDetails((d) => ({ ...d, size: { ...(d.size ?? base), [axis]: Math.max(3, Math.min(64, value)) } })),
    [],
  );

  // Number of generated builds (v0/source excluded) — there's only something to
  // flatten once at least one version exists.
  const generatedCount = doc?.versions.filter((v) => v.version >= 1).length ?? 0;

  const clearVersions = useCallback(() => {
    if (doc) clearVersioning(doc.id);
  }, [doc]);

  // A structure module is OPTIONAL — a build can come from a free-form prompt alone.
  // The selected structure (if any) drives the param controls + an adaptable scaffold.
  const selStruct = catalog?.structure.find((m) => m.id === details.structureType);
  const canSend =
    available !== false &&
    (!!input.trim() || attachments.length > 0 || !!details.structureType);

  return (
    <div className="gen-content" role="dialog" aria-label={t('gen.dialogLabel')}>
      <div className="gen-bar">
        <button className="btn sm" onClick={reset} disabled={busy || chat.length === 0}>
          {t('gen.new')}
        </button>
        <button
          className="btn sm"
          title={t('gen.clearVersionsTitle')}
          onClick={clearVersions}
          disabled={busy || generatedCount === 0}
        >
          {t('gen.clearVersions')}
        </button>
        <button
          className="btn sm"
          title={t('gen.blocksTitle')}
          onClick={() => store.getState().setCatalogOpen(true)}
        >
          {t('gen.blocks')}
        </button>
        <button
          className="btn sm"
          title={t('gen.modulesTitle')}
          onClick={() => store.getState().setModulesOpen(true)}
        >
          {t('gen.modules')}
        </button>
      </div>

      {available === false && (
        <div className="gen-warn">
          {t('gen.noKeyPre')}
          <button className="link" onClick={() => store.getState().setSettingsOpen(true)}>
            {t('gen.noKeyLink')}
          </button>
          {t('gen.noKeyPost')}
        </div>
      )}

      <div className="gen-messages" ref={scrollRef}>
        {chat.length === 0 && (
          <div className="gen-empty">
            <p>
              {t('gen.emptyDescPre')}<code>.nbt</code>{t('gen.emptyDescPost')}
            </p>
            <p className="gen-hint">{t('gen.emptyHint')}</p>
            <ul className="gen-examples">
              {EXAMPLES.map((ex) => (
                <li key={ex}>
                  <button className="gen-example" onClick={() => setInput(t(ex))} disabled={busy}>
                    {t(ex)}
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
                  <span className="gen-stat" title={t('gen.statSizeTitle')}>
                    <span className="gen-stat-label">{t('gen.statSize')}</span>
                    <span className="gen-stat-value">{m.meta.size.join('×')}</span>
                  </span>
                )}
                {m.meta.blockCount != null && (
                  <span className="gen-stat" title={t('gen.statBlocksTitle')}>
                    <span className="gen-stat-label">{t('gen.statBlocks')}</span>
                    <span className="gen-stat-value">{m.meta.blockCount.toLocaleString()}</span>
                  </span>
                )}
                {m.meta.tookMs != null && (
                  <span className="gen-stat" title={t('gen.statTimeTitle')}>
                    <span className="gen-stat-label">{t('gen.statTime')}</span>
                    <span className="gen-stat-value">{formatElapsed(m.meta.tookMs)}</span>
                  </span>
                )}
                {m.meta.tokensIn != null && (
                  <span className="gen-stat" title={t('gen.statInTitle')}>
                    <span className="gen-stat-label">{t('gen.statIn')}</span>
                    <span className="gen-stat-value">{m.meta.tokensIn.toLocaleString()}</span>
                  </span>
                )}
                {m.meta.tokensOut != null && (
                  <span className="gen-stat" title={t('gen.statOutTitle')}>
                    <span className="gen-stat-label">{t('gen.statOut')}</span>
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
                    title={t('gen.imgPreviewTitle')}
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
                {progress ? t(PHASE_LABEL[progress.phase]) : t('gen.phase.generating')}
                {progress?.designPhase && (
                  <span className="gen-design-phase">
                    {' · '}{progress.designPhase}
                    {progress.designStep ? ` (${progress.designStep}/${progress.designSteps})` : ''}
                  </span>
                )}
              </span>
            </div>
            <div className="gen-stats">
              <span className="gen-stat" title={t('gen.elapsedTitle')}>
                <span className="gen-stat-label">{t('gen.statTime')}</span>
                <span className="gen-stat-value">{formatElapsed(elapsedMs)}</span>
              </span>
              {progress && progress.outputTokens > 0 && (
                <>
                  <span className="gen-stat" title={t('gen.statInTitleLive')}>
                    <span className="gen-stat-label">{t('gen.statIn')}</span>
                    <span className="gen-stat-value">{progress.inputTokens.toLocaleString()}</span>
                  </span>
                  <span className="gen-stat" title={t('gen.statOutTitle')}>
                    <span className="gen-stat-label">{t('gen.statOut')}</span>
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
                  title={t('gen.remove')}
                  aria-label={t('gen.removeImage')}
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
            <p className="gen-details-hint">
              {t('gen.detailsHintPre')}
              <button className="link" onClick={() => store.getState().setModulesOpen(true)} disabled={busy}>
                {t('gen.detailsHintLink')}
              </button>
              {t('gen.detailsHintPost')}
            </p>
            <div className="gen-details-grid">
              <label className="gen-field">
                <span>{t('gen.fieldStructure')}</span>
                <select value={details.structureType} onChange={(e) => setField('structureType', e.target.value)} disabled={busy}>
                  <option value="">{t('gen.optNone')}</option>
                  {(catalog?.structure ?? []).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </label>
              <label className="gen-field">
                <span>{t('gen.fieldDecoration')}</span>
                <select value={details.decoration} onChange={(e) => setField('decoration', e.target.value)} disabled={busy || !details.structureType}>
                  <option value="">{t('gen.optDefault')}</option>
                  {(catalog?.decoration ?? []).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </label>
              <label className="gen-field">
                <span>{t('gen.fieldRoof')}</span>
                <select value={details.roof} onChange={(e) => setField('roof', e.target.value)} disabled={busy || !details.structureType}>
                  <option value="">{t('gen.optAuto')}</option>
                  {(catalog?.roof ?? []).filter((m) => moduleFits(m, details.structureType)).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </label>
              <label className="gen-field">
                <span>{t('gen.fieldBasement')}</span>
                <select value={details.basement} onChange={(e) => setField('basement', e.target.value)} disabled={busy || !details.structureType}>
                  <option value="">{t('gen.optNone')}</option>
                  {(catalog?.basement ?? []).filter((m) => moduleFits(m, details.structureType)).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </label>
            </div>
            {selStruct?.params && selStruct.params.length > 0 && (
              <div className="gen-details-grid">
                {selStruct.params.map((p) => (
                  <label key={p.name} className="gen-field">
                    <span>{p.label}</span>
                    {p.kind === 'int' ? (
                      <input
                        type="number"
                        min={p.min}
                        max={p.max}
                        value={Number(details.params[p.name] ?? p.default)}
                        disabled={busy}
                        onChange={(e) => {
                          const n = Math.trunc(Number(e.target.value));
                          setParam(p.name, Math.max(p.min, Math.min(p.max, Number.isFinite(n) ? n : p.default)));
                        }}
                      />
                    ) : (
                      <select
                        value={String(details.params[p.name] ?? p.default)}
                        disabled={busy}
                        onChange={(e) => setParam(p.name, e.target.value)}
                      >
                        {p.options.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    )}
                  </label>
                ))}
              </div>
            )}
            {selStruct && (
              <div className="gen-details-grid">
                {(['w', 'd', 'h'] as const).map((axis) => {
                  const sz = effectiveSize(details, selStruct);
                  const label = axis === 'w' ? t('gen.width') : axis === 'd' ? t('gen.depth') : t('gen.height');
                  return (
                    <label key={axis} className="gen-field">
                      <span>{label}{details.size ? '' : t('gen.autoSuffix')}</span>
                      <input
                        type="number"
                        min={3}
                        max={64}
                        value={sz[axis]}
                        disabled={busy}
                        onChange={(e) => setSize(axis, Math.trunc(Number(e.target.value)) || sz[axis], sz)}
                      />
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {showFloors && (
          <div className="gen-floors">
            <div className="gen-floors-head">
              <span>{t('gen.floorPlan')}</span>
              <span className="gen-floors-hint">{t('gen.floorPlanHint')}</span>
            </div>
            {floors.length === 0 && (
              <p className="gen-floors-empty">{t('gen.floorsEmpty')}</p>
            )}
            {floors.map((f) => (
              <div key={f.id} className="gen-floor-row">
                <input
                  className="gen-floor-name"
                  type="text"
                  placeholder={t('gen.floorNamePlaceholder')}
                  value={f.name}
                  disabled={busy}
                  onChange={(e) => updateFloor(f.id, { name: e.target.value })}
                />
                <label className="gen-floor-y">
                  <span>{t('gen.floorFrom')}</span>
                  <input
                    type="number"
                    value={f.from}
                    disabled={busy}
                    onChange={(e) => updateFloor(f.id, { from: Math.trunc(Number(e.target.value)) || 0 })}
                  />
                </label>
                <label className="gen-floor-y">
                  <span>{t('gen.floorTo')}</span>
                  <input
                    type="number"
                    value={f.to}
                    disabled={busy}
                    onChange={(e) => updateFloor(f.id, { to: Math.trunc(Number(e.target.value)) || 0 })}
                  />
                </label>
                <button
                  className="gen-floor-remove"
                  title={t('gen.removeFloor')}
                  aria-label={t('gen.removeFloor')}
                  disabled={busy}
                  onClick={() => removeFloor(f.id)}
                >
                  ✕
                </button>
              </div>
            ))}
            <button className="btn sm gen-floor-add" onClick={addFloor} disabled={busy}>
              {t('gen.addFloor')}
            </button>
          </div>
        )}
        <textarea
          className="gen-input"
          placeholder={t('gen.inputPlaceholder')}
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
            title={t('gen.attachTitle')}
            disabled={busy || available === false}
            onClick={() => fileInput.current?.click()}
          >
            {t('gen.imageBtn')}
          </button>
          <button
            className={`btn sm gen-details-toggle${hasDetails(details) ? ' has-details' : ''}`}
            title={t('gen.detailsBtnTitle')}
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
            {t('gen.detailsBtn')}{hasDetails(details) ? ' •' : ''}
          </button>
          <button
            className={`btn sm gen-details-toggle${floors.length > 0 ? ' has-details' : ''}`}
            title={t('gen.floorsBtnTitle')}
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
            {t('gen.floorsBtn')}{floors.length > 0 ? ` (${floors.length})` : ''}
          </button>
          {busy ? (
            <button className="btn gen-send gen-cancel" onClick={cancel}>
              {t('gen.cancel')}
            </button>
          ) : (
            <button
              className="btn primary gen-send"
              onClick={() => void send()}
              disabled={!canSend}
            >
              {t('gen.send')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
