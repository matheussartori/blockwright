// The AI "Generate" panel: a chat where the user describes a build, Claude (in
// main) generates the authoring JSON, the app compiles it to a versioned temp
// `.nbt`, and loads it into the viewer for a live preview. Follow-up messages
// edit the current build (the generate→preview→iterate loop from
// knowledge/nbt/07-workflow.md).
//
// This component is the ORCHESTRATOR over the ACTIVE document: the chat transcript,
// the AI session and the in-flight generation state all live on the document (so they
// follow tabs and keep running in the background — see state/documents.ts and
// state/generation.ts). It owns the composer's transient state (input + staged
// attachments + the Details/Floors picks) and composes the view from focused parts:
// ChatTranscript, Composer, DetailsSection, FloorsSection (in components/generate/).
import { useCallback, useEffect, useRef, useState } from 'react';
import { store } from '../state/store';
import { documentsStore } from '../state/documents';
import { runGeneration, cancelGeneration, persistDoc } from '../state/generation';
import { useApp, useActiveDoc, useT } from '../hooks/useStores';
import { api } from '../api';
import {
  type BuildDetails,
  EMPTY_DETAILS,
  buildBrief,
  buildSelection,
  buildSummary,
  hasDetails,
} from '../generation/brief';
import {
  type DetailField,
  type SizeBox,
  assignRoom,
  setDetailField,
  setDetailParam,
  setDetailSize,
} from '../generation/details';
import { type Attachment, readImages } from '../generation/attachments';
import { ChatTranscript } from './generate/ChatTranscript';
import { Composer } from './generate/Composer';
import { DetailsSection } from './generate/DetailsSection';
import { FloorsSection } from './generate/FloorsSection';
import type { FloorDef, GenerationCatalog } from '@/shared/types';

/** The generate chat body. Rendered inside the dock/floating chrome (which
 *  provides the title bar, detach/redock and minimize), so it only owns its own
 *  toolbar, the warning, the transcript and the composer. */
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

  // The Floors panel is for inspecting/correcting the AUTO-DETECTED storeys of an
  // EXISTING `.nbt`. It's hidden while generating a brand-new build (no file yet) —
  // there's nothing to detect until something is built and saved. Once a doc adopts a
  // file (an opened `.nbt` or a finished build), the panel becomes available.
  const isExisting = !!doc?.filePath;
  // Collapse + forget the Floors section when it doesn't apply (e.g. switching to a
  // fresh generate tab), so it can't linger open on a doc that shouldn't show it.
  useEffect(() => {
    if (!isExisting) setShowFloors(false);
  }, [isExisting]);

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
      // Floors are NUMBERED, not named: label each "Floor N" by its position so the
      // plan always reads Floor 1..x (matching the viewer bands) — no name field.
      const numbered = next.map((f, i) => ({ ...f, name: `Floor ${i + 1}` }));
      documentsStore.getState().setFloors(doc.id, numbered);
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
    const f: FloorDef = { id: crypto.randomUUID(), name: '', from, to: from + 4, role: 'upper' };
    setFloors([...floors, f]);
  }, [doc, floors, setFloors]);

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

  // The Details picks are pure reducers over BuildDetails (generation/details.ts).
  const onField = useCallback((key: DetailField, value: string) => setDetails((d) => setDetailField(d, key, value)), []);
  const onRoom = useCallback((floor: number, slot: number, value: string) => setDetails((d) => assignRoom(d, floor, slot, value)), []);
  const onParam = useCallback((name: string, value: string | number) => setDetails((d) => setDetailParam(d, name, value)), []);
  const onSize = useCallback((axis: keyof SizeBox, value: number, base: SizeBox) => setDetails((d) => setDetailSize(d, axis, value, base)), []);

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
    // The model gets the user's words + the plain-language brief; the chat shows only
    // the user's words plus a presentable build card (buildSummary), so the long brief
    // never prints as a wall of text. Send the selection separately so the system prompt
    // loads only the picked modules' guides. The brief steers a FRESH build, so clear it
    // after sending (follow-up edits shouldn't keep re-sending stale hints).
    const aiPrompt = prompt ? prompt + brief : brief ? `Generate a structure with these details:${brief}` : prompt;
    const selection = buildSelection(details, catalog);
    const summary = buildSummary(details, catalog);
    setInput('');
    setAttachments([]);
    setDetails(EMPTY_DETAILS);
    setShowDetails(false);
    setShowFloors(false);
    await runGeneration(docId, {
      aiPrompt,
      userText: prompt,
      build: summary,
      imageUrls: staged.map((a) => a.dataUrl),
      selection,
    });
  }, [input, attachments, details, catalog]);

  const cancel = useCallback(() => {
    if (doc) cancelGeneration(doc.id);
  }, [doc]);

  const toggleDetails = useCallback(
    () => setShowDetails((v) => {
      const next = !v;
      if (next) setShowFloors(false);
      return next;
    }),
    [],
  );

  const toggleFloors = useCallback(
    () => setShowFloors((v) => {
      const next = !v;
      if (next) setShowDetails(false);
      return next;
    }),
    [],
  );

  // A structure module is OPTIONAL — a build can come from a free-form prompt alone.
  const canSend =
    available !== false &&
    (!!input.trim() || attachments.length > 0 || !!details.structureType);

  return (
    <div className="gen-content" role="dialog" aria-label={t('gen.dialogLabel')}>
      {available === false && (
        <div className="gen-warn">
          {t('gen.noKeyPre')}
          <button className="link" onClick={() => store.getState().setSettingsOpen(true)}>
            {t('gen.noKeyLink')}
          </button>
          {t('gen.noKeyPost')}
        </div>
      )}

      <ChatTranscript
        chat={chat}
        busy={busy}
        progress={progress}
        elapsedMs={elapsedMs}
        t={t}
        scrollRef={scrollRef}
        onPickExample={setInput}
      />

      <Composer
        input={input}
        onInput={setInput}
        onSubmit={() => void send()}
        attachments={attachments}
        onAddFiles={addFiles}
        onRemoveAttachment={removeAttachment}
        detailsSlot={
          showDetails ? (
            <DetailsSection
              details={details}
              catalog={catalog}
              busy={busy}
              t={t}
              onField={onField}
              onParam={onParam}
              onSize={onSize}
              onRoom={onRoom}
            />
          ) : null
        }
        floorsSlot={
          showFloors ? (
            <FloorsSection
              floors={floors}
              busy={busy}
              t={t}
              onAdd={addFloor}
              onUpdate={updateFloor}
              onRemove={removeFloor}
            />
          ) : null
        }
        busy={busy}
        available={available}
        canSend={canSend}
        showDetails={showDetails}
        showFloors={showFloors}
        hasDetails={hasDetails(details)}
        isExisting={isExisting}
        floorCount={floors.length}
        onToggleDetails={toggleDetails}
        onToggleFloors={toggleFloors}
        onCancel={cancel}
        t={t}
      />
    </div>
  );
}
