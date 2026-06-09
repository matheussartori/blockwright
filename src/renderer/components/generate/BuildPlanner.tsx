// The full-stage Build Planner. Opening ⚙ Details promotes the build configuration out of
// the cramped chat dock into a dedicated workspace that takes over the stage: a roomy
// config column on the left (the progressive DetailsSection + free-text notes) and a live
// 3D size preview on the right (the build volume with a player figure for scale). On Build
// it composes the same brief/selection the dock did and hands off to `runGeneration`, then
// closes back to the viewer so the user watches it build live. State lives in the planner
// store so the dock and this view share one source of truth.
import { useCallback, useEffect, useState } from 'react';
import { store } from '../../state/store';
import { plannerStore } from '../../state/planner';
import { documentsStore } from '../../state/documents';
import { windowsStore } from '../../state/windows';
import { runGeneration } from '../../state/generation';
import { usePlanner, useT, useLocale } from '../../hooks/useStores';
import { api } from '../../api';
import {
  buildBrief,
  buildSelection,
  buildSummary,
  effectiveSize,
  maxRoomsForStructure,
} from '../../generation/brief';
import {
  type DetailField,
  type SizeBox,
  addRoom,
  removeRoomAt,
  setDetailField,
  setDetailParam,
  setDetailSize,
} from '../../generation/details';
import { DetailsSection } from './DetailsSection';
import { BuildScalePreview, PLAYER_H } from './BuildScalePreview';
import type { GenerationCatalog } from '@/shared/types';

export function BuildPlanner() {
  const t = useT();
  const locale = useLocale();
  const open = usePlanner((s) => s.open);
  const details = usePlanner((s) => s.details);
  const notes = usePlanner((s) => s.notes);
  const [catalog, setCatalog] = useState<GenerationCatalog | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    void api.generationCatalog().then(setCatalog);
  }, [locale]);

  // Re-probe the AI credential each time the planner opens (it may have just been added).
  useEffect(() => {
    if (open) void api.aiAvailable().then(setAvailable);
  }, [open]);

  // Esc closes the planner (it's a full-stage overlay).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') plannerStore.getState().closePlanner();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const selStruct = catalog?.structure.find((m) => m.id === details.structureType);

  const onField = useCallback(
    (key: DetailField, value: string) => plannerStore.getState().setDetails((d) => setDetailField(d, key, value)),
    [],
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
    // presentable build card. Mirror the dock composer's send() so the two paths agree.
    const aiPrompt = note ? note + brief : brief ? `Generate a structure with these details:${brief}` : note;
    const selection = buildSelection(d, catalog);
    const summary = buildSummary(d, catalog);
    ps.closePlanner();
    ps.reset();
    // Reveal the Generate chat so the build's transcript + progress are visible.
    windowsStore.getState().openPanel('generate');
    await runGeneration(docId, {
      aiPrompt,
      userText: note,
      build: summary,
      imageUrls: [],
      selection,
    });
  }, [catalog]);

  if (!open) return null;

  const sz = details.structureType ? effectiveSize(details, selStruct) : null;

  return (
    <div className="planner" role="dialog" aria-label={t('planner.title')}>
      <div className="planner-head">
        <span className="planner-title">
          <span className="planner-title-icon">◳</span>
          {t('planner.title')}
        </span>
        <button
          className="planner-close"
          title={t('planner.close')}
          aria-label={t('planner.close')}
          onClick={() => plannerStore.getState().closePlanner()}
        >
          ✕
        </button>
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
            onAddRoom={onAddRoom}
            onRemoveRoom={onRemoveRoom}
          />
          <div className="planner-notes">
            <span className="gen-chip-label">{t('planner.notesLabel')}</span>
            <textarea
              className="planner-notes-input"
              placeholder={t('gen.notesPlaceholder')}
              value={notes}
              rows={3}
              onChange={(e) => plannerStore.getState().setNotes(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
          <div className="planner-actions">
            <button
              className="btn sm"
              disabled={!details.structureType && !notes}
              onClick={() => plannerStore.getState().reset()}
            >
              {t('planner.reset')}
            </button>
            <button className="btn primary planner-build" disabled={!canBuild} onClick={() => void build()}>
              {t('planner.build')}
            </button>
          </div>
        </div>

        <div className="planner-preview">
          {sz ? (
            <>
              <BuildScalePreview size={sz} />
              <div className="planner-preview-caption">
                <span className="planner-dims">
                  {sz.w} × {sz.d} × {sz.h}
                  <span className="planner-dims-key"> {t('planner.dimsKey')}</span>
                </span>
                <span className="planner-scale-note">{t('planner.scaleNote').replace('{h}', String(PLAYER_H))}</span>
              </div>
            </>
          ) : (
            <div className="planner-preview-empty">{t('planner.previewEmpty')}</div>
          )}
        </div>
      </div>
    </div>
  );
}
