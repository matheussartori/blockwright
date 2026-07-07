// The in-world editor's control surface (world-mode sibling of editor/EditorPanel): tool picker
// (Paint / Erase / Select), the paint block field, selection actions, the pending-edit count,
// and the Save-to-World / Discard actions. Shown while world-edit mode is active; the mode is
// toggled from the World HUD's Edit button (gated on the Settings ▸ World master switch).
import { useMemo } from 'react';
import { AlertTriangle, Download, Eraser, Globe, PackageOpen, PackagePlus, Paintbrush, Redo2, RotateCcw, RotateCw, Save, SquareDashed, Trash2, Undo2, X } from 'lucide-react';
import { effectiveNbtLimit } from '@/shared/domain/split';
import { useDocuments, useT, useWorldEdit } from '../../hooks/useStores';
import { commitPlaceVia, WORLD_SELECTION_CAP, worldEditStore, type WorldPaintMode, type WorldTool } from '../../state/world-edit';
import { regionVolume } from '../../world/selection';
import { rotatedSize } from '../../world/place';
import { useViewer } from '../../viewer/ViewerProvider';
import { api } from '../../api';
import { store } from '../../state/store';
import { settingsStore } from '../../state/settings';
import { Segmented } from '../ui/Segmented';
import { Select } from '../ui/Select';
import { Tooltip } from '../ui/Tooltip';
import { AxisPad } from '../editor/AxisPad';
import { BlockField } from '../editor/BlockField';
import { useBlockIds } from '../editor/useBlockIds';
import { WorldSaveModal } from './WorldSaveModal';

/** @param onOpenFile Open an extracted `.nbt` as a new tab (App wires the document-flow's openFile). */
export function WorldEditPanel({ onOpenFile }: { onOpenFile: (path: string) => void | Promise<void> }) {
  const t = useT();
  const viewer = useViewer();
  const active = useWorldEdit((s) => s.active);
  const extracting = useWorldEdit((s) => s.extracting);
  const place = useWorldEdit((s) => s.place);
  const documents = useDocuments((s) => s.documents);
  /** Open structure tabs with a loaded build — the Place tool's candidates. */
  const placeDocs = useMemo(
    () => documents.filter((d) => d.kind === 'structure' && d.structure && d.structure.blockCount > 0),
    [documents],
  );
  const tool = useWorldEdit((s) => s.tool);
  const paintMode = useWorldEdit((s) => s.paintMode);
  const paintBlock = useWorldEdit((s) => s.paintBlock);
  const pendingCount = useWorldEdit((s) => s.pendingCount);
  const selection = useWorldEdit((s) => s.selection);
  const selAnchor = useWorldEdit((s) => s.anchor);
  const canUndo = useWorldEdit((s) => s.past.length > 0);
  const canRedo = useWorldEdit((s) => s.future.length > 0);
  const lockExclusive = useWorldEdit((s) => s.lockExclusive);
  const error = useWorldEdit((s) => s.error);
  const blockIds = useBlockIds();
  const we = worldEditStore.getState;

  const selSize = useMemo(() => {
    if (!selection) return null;
    const [a, b] = [selection.min, selection.max];
    return `${b[0] - a[0] + 1}×${b[1] - a[1] + 1}×${b[2] - a[2] + 1}`;
  }, [selection]);
  const selVolume = selection ? regionVolume(selection) : 0;
  const overCap = selVolume > WORLD_SELECTION_CAP;

  /** Panel steppers for the box's top/bottom face, build-range clamped like the 3D handles. */
  const nudgeY = (face: 'top' | 'bottom', dir: 1 | -1) => {
    const sel = we().selection;
    if (!sel) return;
    const bounds = viewer?.worldYRange(Math.floor(sel.min[0] / 16), Math.floor(sel.min[2] / 16)) ?? undefined;
    we().adjustSelectionY(face, (face === 'top' ? sel.max[1] : sel.min[1]) + dir, bounds);
  };

  /** Extract the selection into a temp `.nbt`; returns the result and reports what was captured. */
  const extract = async () => {
    const nbtLimit = effectiveNbtLimit(settingsStore.getState().nbtSizeLimit, store.getState().workspace?.minecraftVersion ?? null);
    const result = await we().extractSelection(nbtLimit);
    if (result?.ok) {
      const refused = result.refusedChunks > 0 ? ` — ${t('worldEdit.extractRefused', { n: String(result.refusedChunks) })}` : '';
      store.getState().setNotice({ text: `${t('worldEdit.extractDone', { blocks: result.blocks.toLocaleString(), name: result.name })}${refused}`, warn: false });
    }
    return { result, nbtLimit };
  };

  const extractOpen = async () => {
    const { result } = await extract();
    if (result?.ok) await onOpenFile(result.path);
  };

  const extractSave = async () => {
    const { result, nbtLimit } = await extract();
    if (result?.ok) await api.exportStructure(result.path, `${result.name}.nbt`, nbtLimit, result.oversized ? 'jigsaw' : 'nbt');
  };

  if (!active) return null;

  return (
    <div className="editor-panel world-edit-panel no-drag">
      <header className="editor-head">
        <span className="editor-title">
          <Globe size={15} strokeWidth={1.9} aria-hidden />
          {t('worldEdit.title')}
        </span>
        <span className="editor-head-actions">
          <Tooltip placement="right" label={t('worldEdit.exit')} description={t('worldEdit.exitDesc')}>
            <button
              className="editor-icon"
              onClick={() => {
                // Exiting with pending edits must be an explicit decision: route through the
                // save dialog, which offers Save / Discard.
                if (we().pendingCount > 0) we().setSaveOpen(true);
                else void we().exit();
              }}
            >
              <X size={15} strokeWidth={2} aria-hidden />
            </button>
          </Tooltip>
        </span>
      </header>

      <div className="world-tool-rail">
        <Segmented<WorldTool>
          value={tool}
          onChange={(v) => we().setTool(v)}
          ariaLabel={t('worldEdit.tools')}
          options={[
            { value: 'paint', label: (<><Paintbrush size={13} aria-hidden /> {t('worldEdit.tool.paint')}</>) },
            { value: 'erase', label: (<><Eraser size={13} aria-hidden /> {t('worldEdit.tool.erase')}</>) },
            { value: 'select', label: (<><SquareDashed size={13} aria-hidden /> {t('worldEdit.tool.select')}</>) },
            { value: 'place', label: (<><PackagePlus size={13} aria-hidden /> {t('worldEdit.tool.place')}</>) },
          ]}
        />
      </div>

      <div className="editor-context">
        {tool === 'paint' && (
          <>
            <Segmented<WorldPaintMode>
              value={paintMode}
              onChange={(v) => we().setPaintMode(v)}
              ariaLabel={t('worldEdit.paintMode')}
              options={[
                { value: 'brush', label: t('editor.paint.brush') },
                { value: 'recolor', label: t('editor.paint.recolor') },
              ]}
            />
            <BlockField
              label={t('worldEdit.paintBlock')}
              value={paintBlock}
              onChange={(v) => we().setPaintBlock(v)}
              options={blockIds}
              listId="world-paint-blocks"
            />
          </>
        )}
        {tool === 'erase' && <div className="editor-hint">{t('worldEdit.eraseHint')}</div>}
        {tool === 'place' &&
          (place ? (
            <>
              <div className="editor-selname" title={place.label}>
                {place.label} — <span style={{ fontFamily: 'var(--mono)' }}>{rotatedSize(place.data.size, place.turns).join('×')}</span>
              </div>
              <div className="editor-hint">{t('worldEdit.placeHint')}</div>
              <div className="editor-btngrid">
                <button className="btn sm" onClick={() => we().rotatePlace(-1)}>
                  <RotateCcw size={13} aria-hidden /> {t('worldEdit.placeRotateL')}
                </button>
                <button className="btn sm" onClick={() => we().rotatePlace(1)}>
                  <RotateCw size={13} aria-hidden /> {t('worldEdit.placeRotateR')}
                </button>
              </div>
              <AxisPad t={t} onAxis={(axis, dir) => we().nudgePlace(axis, dir)} />
              <div className="editor-btngrid">
                <button
                  className="btn primary sm"
                  disabled={!place.anchor}
                  onClick={() => void (viewer && commitPlaceVia(viewer))}
                >
                  {t('worldEdit.placeCommit')}
                </button>
                <button className="btn sm" onClick={() => we().cancelPlace()}>
                  {t('worldEdit.placeCancel')}
                </button>
              </div>
            </>
          ) : placeDocs.length ? (
            <Select
              value=""
              placeholder={t('worldEdit.placePick')}
              ariaLabel={t('worldEdit.placePickLabel')}
              options={placeDocs.map((d) => ({
                value: d.id,
                label: d.title,
                description: d.structure ? d.structure.size.join('×') : undefined,
              }))}
              onChange={(id) => {
                const doc = placeDocs.find((d) => d.id === id);
                if (doc?.structure) we().beginPlace(doc.id, doc.title, doc.structure);
              }}
            />
          ) : (
            <div className="editor-hint">{t('worldEdit.placeNoDocs')}</div>
          ))}
        {tool === 'select' &&
          (selection ? (
            <>
              <div className="world-sel-readout">
                <div className="world-sel-dims">
                  <span className="world-sel-size">{selSize}</span>
                  <span className={`world-sel-volume${overCap ? ' over' : ''}`}>
                    {t('worldEdit.selVolume', { n: selVolume.toLocaleString() })}
                  </span>
                </div>
                <div className="world-sel-coords">
                  {selection.min.join(' ')} → {selection.max.join(' ')}
                </div>
              </div>
              {selAnchor ? (
                <div className="editor-hint">{t('worldEdit.selectHintAnchor')}</div>
              ) : (
                <>
                  <div className="editor-axispad">
                    {(['top', 'bottom'] as const).map((face) => {
                      const label = t(face === 'top' ? 'worldEdit.selTop' : 'worldEdit.selBottom');
                      return (
                        <div key={face} className="editor-axisrow">
                          <span className="world-sel-facelabel">{label}</span>
                          <button className="editor-axisbtn no-drag" onClick={() => nudgeY(face, -1)} aria-label={`−${label}`}>
                            −
                          </button>
                          <span className="world-sel-facey">{face === 'top' ? selection.max[1] : selection.min[1]}</span>
                          <button className="editor-axisbtn no-drag" onClick={() => nudgeY(face, 1)} aria-label={`+${label}`}>
                            +
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="editor-hint">{t('worldEdit.selHeightHint')}</div>
                  <BlockField
                    label={t('worldEdit.fillBlock')}
                    value={paintBlock}
                    onChange={(v) => we().setPaintBlock(v)}
                    options={blockIds}
                    listId="world-fill-blocks"
                  />
                  {overCap && (
                    <div className="world-sel-cap">
                      <AlertTriangle size={13} strokeWidth={2} aria-hidden />
                      {t('worldEdit.selTooLarge', { cap: WORLD_SELECTION_CAP.toLocaleString() })}
                    </div>
                  )}
                  <div className="editor-btngrid">
                    <button className="btn sm" disabled={overCap} onClick={() => void we().fillSelection()}>
                      {t('worldEdit.fillSelection')}
                    </button>
                    <button className="btn sm" disabled={overCap} onClick={() => we().deleteSelection()}>
                      {t('worldEdit.deleteSelection')}
                    </button>
                  </div>
                  <div className="editor-btngrid">
                    <Tooltip placement="right" label={t('worldEdit.extractOpen')} description={t('worldEdit.extractOpenDesc')}>
                      <button className="btn sm" disabled={extracting} onClick={() => void extractOpen()}>
                        <PackageOpen size={13} aria-hidden /> {t('worldEdit.extractOpen')}
                      </button>
                    </Tooltip>
                    <Tooltip placement="right" label={t('worldEdit.extractSave')} description={t('worldEdit.extractSaveDesc')}>
                      <button className="btn sm" disabled={extracting} onClick={() => void extractSave()}>
                        <Download size={13} aria-hidden /> {t('worldEdit.extractSave')}
                      </button>
                    </Tooltip>
                  </div>
                  <div className="editor-hint">{t('worldEdit.extractHint')}</div>
                  <button className="btn sm world-sel-clear" onClick={() => we().clearSelection()}>
                    <X size={13} aria-hidden /> {t('worldEdit.selClear')}
                  </button>
                </>
              )}
            </>
          ) : (
            <div className="editor-hint">{t('worldEdit.selectHint')}</div>
          ))}
      </div>

      <div className="editor-selinfo world-edit-status">
        <div className="world-edit-pending">{t('worldEdit.pendingCount', { n: pendingCount.toLocaleString() })}</div>
        {!lockExclusive && (
          <div className="world-edit-caution" title={t('worldEdit.lockCautionDesc')}>
            <AlertTriangle size={13} strokeWidth={2} aria-hidden /> {t('worldEdit.lockCaution')}
          </div>
        )}
        {error && (
          <button type="button" className="world-edit-error" onClick={() => we().clearError()} title={error}>
            {error}
          </button>
        )}
      </div>

      <footer className="editor-foot">
        <Tooltip placement="right" label={t('editor.undo')} description={t('editor.undoDesc')}>
          <button className="editor-icon" onClick={() => we().undo()} disabled={!canUndo}>
            <Undo2 size={15} strokeWidth={1.9} aria-hidden />
          </button>
        </Tooltip>
        <Tooltip placement="right" label={t('editor.redo')} description={t('editor.redoDesc')}>
          <button className="editor-icon" onClick={() => we().redo()} disabled={!canRedo}>
            <Redo2 size={15} strokeWidth={1.9} aria-hidden />
          </button>
        </Tooltip>
        <Tooltip placement="right" label={t('worldEdit.discard')} description={t('worldEdit.discardDesc')}>
          <button className="editor-icon" onClick={() => we().discard()} disabled={!pendingCount}>
            <Trash2 size={15} strokeWidth={1.9} aria-hidden />
          </button>
        </Tooltip>
        <button className="btn primary sm editor-save" disabled={!pendingCount} onClick={() => we().setSaveOpen(true)}>
          <Save size={14} strokeWidth={1.9} aria-hidden />
          {t('worldEdit.save')}
        </button>
      </footer>

      <WorldSaveModal />
    </div>
  );
}
