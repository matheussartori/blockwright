// The in-world editor's control surface (world-mode sibling of editor/EditorPanel): tool picker
// (Paint / Erase / Select), the paint block field, selection actions, the pending-edit count,
// and the Save-to-World / Discard actions. Shown while world-edit mode is active; the mode is
// toggled from the World HUD's Edit button (gated on the Settings ▸ World master switch).
import { useMemo } from 'react';
import { AlertTriangle, Eraser, Globe, Paintbrush, Redo2, Save, SquareDashed, Trash2, Undo2, X } from 'lucide-react';
import { useT, useWorldEdit } from '../../hooks/useStores';
import { worldEditStore, type WorldPaintMode, type WorldTool } from '../../state/world-edit';
import { Segmented } from '../ui/Segmented';
import { Tooltip } from '../ui/Tooltip';
import { BlockField } from '../editor/BlockField';
import { useBlockIds } from '../editor/useBlockIds';
import { WorldSaveModal } from './WorldSaveModal';

export function WorldEditPanel() {
  const t = useT();
  const active = useWorldEdit((s) => s.active);
  const tool = useWorldEdit((s) => s.tool);
  const paintMode = useWorldEdit((s) => s.paintMode);
  const paintBlock = useWorldEdit((s) => s.paintBlock);
  const pendingCount = useWorldEdit((s) => s.pendingCount);
  const selection = useWorldEdit((s) => s.selection);
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

  if (!active) return null;

  return (
    <div className="editor-panel no-drag">
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

      <Segmented<WorldTool>
        value={tool}
        onChange={(v) => we().setTool(v)}
        ariaLabel={t('worldEdit.tools')}
        options={[
          { value: 'paint', label: (<><Paintbrush size={13} aria-hidden /> {t('worldEdit.tool.paint')}</>) },
          { value: 'erase', label: (<><Eraser size={13} aria-hidden /> {t('worldEdit.tool.erase')}</>) },
          { value: 'select', label: (<><SquareDashed size={13} aria-hidden /> {t('worldEdit.tool.select')}</>) },
        ]}
      />

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
        {tool === 'select' &&
          (selSize ? (
            <>
              <BlockField
                label={t('worldEdit.fillBlock')}
                value={paintBlock}
                onChange={(v) => we().setPaintBlock(v)}
                options={blockIds}
                listId="world-fill-blocks"
              />
              <div className="editor-btngrid">
                <button className="btn sm" onClick={() => void we().fillSelection()}>
                  {t('worldEdit.fillSelection')}
                </button>
                <button className="btn sm" onClick={() => we().deleteSelection()}>
                  {t('worldEdit.deleteSelection')}
                </button>
              </div>
            </>
          ) : (
            <div className="editor-hint">{t('worldEdit.selectHint')}</div>
          ))}
      </div>

      <div className="editor-selinfo">
        {tool === 'select' && selSize ? (
          <div>
            <span style={{ fontFamily: 'var(--mono)' }}>{selSize}</span> — {t('worldEdit.selection')}
          </div>
        ) : null}
        <div>{t('worldEdit.pendingCount', { n: pendingCount.toLocaleString() })}</div>
        {!lockExclusive && (
          <div className="editor-selname" title={t('worldEdit.lockCautionDesc')}>
            <AlertTriangle size={12} strokeWidth={2} aria-hidden /> {t('worldEdit.lockCaution')}
          </div>
        )}
        {error && (
          <div className="editor-selname" onClick={() => we().clearError()} title={error}>
            {error}
          </div>
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
