// The Build Planner — the unified, Details-first surface for STARTING a build. It renders
// in two modes from one shared view (PlannerView):
//   • INLINE (NewBuildPanel) — takes over the stage for a brand-new tab / Welcome ▸ Generate.
//     This is the DEFAULT for new files: pick a structure + options, optionally describe the
//     build, and hit Generate (text-only works — just type and go).
//   • OVERLAY (BuildPlanner) — a dialog over an OPEN `.nbt` (the chat's "Advanced" button),
//     so structured edits are available while the chat stays one click away.
// Both compose the SAME brief/selection and hand off to `runGeneration`; state lives in the
// planner store so the two modes share one source of truth. The roomy config column (the
// progressive DetailsSection + a prominent description field) sits left; a live 3D size
// preview (the build volume with a player figure for scale) sits right.
import { useCallback, useEffect, useState } from 'react';
import { Sparkles, RotateCcw, PencilLine } from 'lucide-react';
import { store } from '../../state/store';
import { plannerStore } from '../../state/planner';
import { documentsStore } from '../../state/documents';
import { windowsStore } from '../../state/windows';
import { runGeneration } from '../../state/generation';
import { usePlanner, useT, useLocale, useActiveDoc, useApp } from '../../hooks/useStores';
import { api } from '../../api';
import { Segmented } from '../ui/Segmented';
import {
  basementAreaOf,
  buildBrief,
  buildSelection,
  buildSummary,
  effectiveSize,
  maxRoomsForStructure,
  previewOverheads,
  surroundRing,
} from '../../generation/brief';
import {
  type BandKey,
  type DetailField,
  type SizeBox,
  addRoom,
  removeRoomAt,
  setBandHeight,
  setBasementArea,
  setBasementLevelHeight,
  setBasementLevels,
  setDetailField,
  setDetailParam,
  setDetailSize,
  setFloorHeight,
  setSurroundSize,
} from '../../generation/details';
import type { SurroundSizing } from '@/shared/domain/surroundings';
import { DetailsSection } from './DetailsSection';
import { ATTIC_COLOR, BASEMENT_COLOR, BuildScalePreview, PLAYER_H } from './BuildScalePreview';
import type { GenerationCatalog, ModBlockScope } from '@/shared/types';

/** The shared planner UI, rendered inline (new build) or as an overlay (advanced edit). */
function PlannerView({ inline, onClose }: { inline: boolean; onClose?: () => void }) {
  const t = useT();
  const locale = useLocale();
  const details = usePlanner((s) => s.details);
  const notes = usePlanner((s) => s.notes);
  const activeDoc = useActiveDoc();
  const isEdit = !!activeDoc?.filePath; // an open .nbt → this build EDITS it
  const [catalog, setCatalog] = useState<GenerationCatalog | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  // Mod-block generation scope, shown only when a mod workspace is open. WORKSPACE-level
  // (persisted in the mod's dictionary.json), surfaced HERE so it's set where you generate
  // — `prefer` makes the seeded shell + the build come out in the mod's own blocks.
  const workspace = useApp((s) => s.workspace);
  const modNamespace = workspace && workspace.namespace !== 'minecraft' ? workspace.namespace : null;
  const [modScope, setModScope] = useState<ModBlockScope | null>(null);

  useEffect(() => {
    void api.generationCatalog().then(setCatalog);
  }, [locale]);

  useEffect(() => {
    if (!modNamespace) {
      setModScope(null);
      return;
    }
    let alive = true;
    void api.getDictionary().then((d) => {
      if (alive) setModScope(d?.scope ?? 'mix');
    });
    return () => {
      alive = false;
    };
  }, [modNamespace, workspace?.root]);

  const changeModScope = useCallback((scope: ModBlockScope) => {
    setModScope(scope); // optimistic
    void api.setDictionaryScope(scope).then((d) => {
      if (d) setModScope(d.scope); // reconcile with the persisted value
    });
  }, []);

  useEffect(() => {
    void api.aiAvailable().then(setAvailable);
  }, []);

  const selStruct = catalog?.structure.find((m) => m.id === details.structureType);

  const onField = useCallback(
    (key: DetailField, value: string) =>
      plannerStore.getState().setDetails((d) =>
        // The chosen structure module rides along so its declared pairedDecoration applies.
        setDetailField(d, key, value, catalog?.structure.find((m) => m.id === value)),
      ),
    [catalog],
  );
  const onParam = useCallback(
    (name: string, value: string | number) => plannerStore.getState().setDetails((d) => setDetailParam(d, name, value)),
    [],
  );
  const onSize = useCallback(
    (axis: keyof SizeBox, value: number, base: SizeBox) =>
      plannerStore.getState().setDetails((d) => setDetailSize(d, axis, value, base)),
    [],
  );
  const onSurroundSize = useCallback(
    (sizing: SurroundSizing | null) => plannerStore.getState().setDetails((d) => setSurroundSize(d, sizing)),
    [],
  );
  const onFloorHeight = useCallback(
    (index: number, value: number, linked: boolean) =>
      plannerStore.getState().setDetails((d) => setFloorHeight(d, index, value, linked)),
    [],
  );
  const onBandHeight = useCallback(
    (band: BandKey, value: number) => plannerStore.getState().setDetails((d) => setBandHeight(d, band, value)),
    [],
  );
  const onBasementLevels = useCallback(
    (n: number) => plannerStore.getState().setDetails((d) => setBasementLevels(d, n)),
    [],
  );
  const onBasementLevelHeight = useCallback(
    (index: number, value: number, linked: boolean) =>
      plannerStore.getState().setDetails((d) => setBasementLevelHeight(d, index, value, linked)),
    [],
  );
  const onBasementArea = useCallback(
    (axis: 'w' | 'd', value: number, base: { w: number; d: number }) =>
      plannerStore.getState().setDetails((d) => setBasementArea(d, axis, value, base)),
    [],
  );
  const onAddRoom = useCallback(
    (floor: number, id: string) => {
      const ps = plannerStore.getState();
      const struct = catalog?.structure.find((m) => m.id === ps.details.structureType);
      ps.setDetails((d) => addRoom(d, floor, id, maxRoomsForStructure(struct)));
    },
    [catalog],
  );
  const onRemoveRoom = useCallback(
    (floor: number, index: number) => plannerStore.getState().setDetails((d) => removeRoomAt(d, floor, index)),
    [],
  );

  const canBuild = available !== false && (!!details.structureType || !!notes.trim());

  const build = useCallback(async () => {
    const ps = plannerStore.getState();
    const d = ps.details;
    const note = ps.notes.trim();
    const brief = buildBrief(d, catalog);
    if (!note && !brief) return;
    const ds = documentsStore.getState();
    const docId = ds.activeId ?? ds.newDoc();
    if (ds.documents.find((x) => x.id === docId)?.busy) return;
    // Model gets the notes + the plain-language brief; the chat shows the notes plus the
    // presentable build card. One path for both modes so generate + edit stay in lock-step.
    const aiPrompt = note ? note + brief : brief ? `Generate a structure with these details:${brief}` : note;
    const selection = buildSelection(d, catalog);
    const summary = buildSummary(d, catalog);
    // Surface the mod-block preference on the build card when a mod workspace is active — the
    // scope (vanilla-only / mix / prefer) is an INFORMED input to the build, so the card shows
    // it alongside the other picks. Read the workspace + persisted scope FRESH (this callback
    // only re-memoizes on `catalog`), and stash the id so the card re-localizes it.
    if (summary) {
      const ws = store.getState().workspace;
      const modNs = ws && ws.namespace !== 'minecraft' ? ws.namespace : null;
      if (modNs) summary.modBlocks = (await api.getDictionary())?.scope ?? 'mix';
    }
    ps.closePlanner();
    ps.reset();
    // Reveal the Generate chat so the build's transcript + live progress are visible.
    windowsStore.getState().openPanel('generate');
    await runGeneration(docId, {
      aiPrompt,
      userText: note,
      build: summary,
      imageUrls: [],
      selection,
    });
  }, [catalog]);

  const sz = details.structureType ? effectiveSize(details, selStruct) : null;
  const overheads = details.structureType ? previewOverheads(details, selStruct) : null;
  const surround = details.structureType ? surroundRing(details, selStruct) : null;
  // The basement footprint, drawn at scale in the preview only when enlarged past the house.
  const basementArea = details.structureType ? basementAreaOf(details, selStruct) : null;
  const basementSize =
    basementArea && sz && (basementArea.w > sz.w || basementArea.d > sz.d) ? basementArea : null;
  const perFloor = !!details.floorHeights?.length;
  const title = inline ? (isEdit ? t('planner.advancedTitle') : t('planner.newTitle')) : t('planner.advancedTitle');
  const cta = isEdit ? t('planner.generateEdit') : t('planner.generate');

  return (
    <div className={`planner${inline ? ' planner-inline' : ''}`} role="dialog" aria-label={title}>
      <div className="planner-head">
        <span className="planner-title">
          <Sparkles size={16} strokeWidth={1.8} className="planner-title-icon" aria-hidden />
          {title}
        </span>
        {onClose && (
          <button
            className="planner-close"
            title={t('planner.close')}
            aria-label={t('planner.close')}
            onClick={onClose}
          >
            ✕
          </button>
        )}
      </div>

      {available === false && (
        <div className="planner-warn">
          {t('gen.noKeyPre')}
          <button className="link" onClick={() => store.getState().setSettingsOpen(true)}>
            {t('gen.noKeyLink')}
          </button>
          {t('gen.noKeyPost')}
        </div>
      )}

      <div className="planner-body">
        <div className="planner-config">
          <DetailsSection
            details={details}
            catalog={catalog}
            busy={false}
            t={t}
            onField={onField}
            onParam={onParam}
            onSize={onSize}
            onFloorHeight={onFloorHeight}
            onBandHeight={onBandHeight}
            onSurroundSize={onSurroundSize}
            onBasementLevels={onBasementLevels}
            onBasementLevelHeight={onBasementLevelHeight}
            onBasementArea={onBasementArea}
            onAddRoom={onAddRoom}
            onRemoveRoom={onRemoveRoom}
          />
          {modNamespace && modScope && (
            <div className="planner-modblocks">
              <span className="gen-chip-label">
                {t('catalog.scopeTitle')} · <code>{modNamespace}</code>
              </span>
              <Segmented<ModBlockScope>
                ariaLabel={t('catalog.scopeTitle')}
                value={modScope}
                onChange={changeModScope}
                options={[
                  { value: 'off', label: t('catalog.scopeOff') },
                  { value: 'mix', label: t('catalog.scopeMix') },
                  { value: 'prefer', label: t('catalog.scopePrefer') },
                ]}
              />
              <span className="planner-modblocks-hint">
                {modScope === 'off'
                  ? t('catalog.scopeHintOff')
                  : modScope === 'mix'
                    ? t('catalog.scopeHintMix')
                    : t('catalog.scopeHintPrefer')}
              </span>
            </div>
          )}
          <div className="planner-notes">
            <span className="gen-chip-label">
              <PencilLine size={13} strokeWidth={1.8} aria-hidden />
              {isEdit ? t('planner.editLabel') : t('planner.describeLabel')}
            </span>
            <textarea
              className="planner-notes-input"
              placeholder={isEdit ? t('planner.editPlaceholder') : t('gen.notesPlaceholder')}
              value={notes}
              rows={3}
              onChange={(e) => plannerStore.getState().setNotes(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
          <div className="planner-actions">
            <button
              className="btn sm planner-reset"
              disabled={!details.structureType && !notes}
              onClick={() => plannerStore.getState().reset()}
            >
              <RotateCcw size={13} strokeWidth={1.8} aria-hidden />
              {t('planner.reset')}
            </button>
            <button className="btn primary planner-build" disabled={!canBuild} onClick={() => void build()}>
              <Sparkles size={14} strokeWidth={2} aria-hidden />
              {cta}
            </button>
          </div>
        </div>

        <div className="planner-preview">
          {sz ? (
            <>
              <BuildScalePreview
                size={sz}
                floors={details.floorHeights}
                overheads={overheads}
                surround={surround}
                basementSize={basementSize}
                onBandHeight={(band, v) => {
                  if (typeof band === 'number') return perFloor ? onFloorHeight(band, v, false) : undefined;
                  if (band === 'attic') return onBandHeight('attic', v);
                  onBasementLevelHeight(Number(band.slice('basement:'.length)), v, false);
                }}
              />
              <div className="planner-preview-caption">
                <span className="planner-dims">
                  {sz.w} × {sz.d} × {sz.h}
                  <span className="planner-dims-key"> {t('planner.dimsKey')}</span>
                </span>
                {(!!overheads?.basement || !!overheads?.attic) && (
                  <span className="planner-legend">
                    {!!overheads.basement && (
                      <span className="planner-legend-item">
                        <span className="planner-legend-dot" style={{ background: BASEMENT_COLOR }} />
                        {t('gen.fieldBasement')}
                      </span>
                    )}
                    {!!overheads.attic && (
                      <span className="planner-legend-item">
                        <span className="planner-legend-dot" style={{ background: ATTIC_COLOR }} />
                        {t('gen.fieldAttic')}
                      </span>
                    )}
                  </span>
                )}
                <span className="planner-scale-note">
                  {perFloor ? t('planner.dragFloorHint') : t('planner.scaleNote').replace('{h}', String(PLAYER_H))}
                </span>
              </div>
            </>
          ) : (
            <div className="planner-preview-empty">
              <GhostBuild />
              <span>{t('planner.previewEmpty')}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** A faint isometric block-cube wireframe for the preview empty state — hints at WHAT
 *  will appear (the build's massing) before a structure is picked, instead of bare text. */
function GhostBuild() {
  return (
    <svg className="planner-ghost" width="116" height="116" viewBox="0 0 120 120" fill="none" aria-hidden>
      {/* top face (rhombus) */}
      <path d="M60 20 L99 43 L60 66 L21 43 Z" />
      {/* vertical edges */}
      <path d="M21 43 V83 M60 66 V106 M99 43 V83" />
      {/* lower visible edges */}
      <path d="M21 83 L60 106 L99 83" />
    </svg>
  );
}

/** The OVERLAY planner (the chat's "Advanced" button) — a dialog over an open build. */
export function BuildPlanner() {
  const open = usePlanner((s) => s.open);
  if (!open) return null;
  return <PlannerView inline={false} onClose={() => plannerStore.getState().closePlanner()} />;
}

/** The INLINE planner — the Details-first stage for a brand-new build tab. */
export function NewBuildPanel() {
  return <PlannerView inline />;
}
