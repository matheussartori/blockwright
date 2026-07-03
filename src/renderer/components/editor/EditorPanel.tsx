// The block editor's control surface: a floating panel on the stage. Off, it's a single
// "Edit" button; on, it's the tool rail + the active tool's controls + the selection
// readout + Save/Undo/Redo. The orchestrator — it owns the layout + the selection readout;
// the tools live in ToolRail/ToolControls, the ops in the store (state/editor.ts).
import { useEffect, useMemo } from 'react';
import { Boxes, Eye, EyeOff, Pencil, Redo2, Save, Undo2, X } from 'lucide-react';
import { useActiveDoc, useEditor, useT } from '../../hooks/useStores';
import { editorStore, type Symmetry } from '../../state/editor';
import { cellKey, parseCell, type CellContent } from '../../editor/ops';
import { Segmented } from '../ui/Segmented';
import { Tooltip } from '../ui/Tooltip';
import { ToolRail } from './ToolRail';
import { ToolControls } from './ToolControls';
import { DataMetaEditor } from './DataMetaEditor';

export function EditorPanel() {
  const t = useT();
  const active = useEditor((s) => s.active);
  const tool = useEditor((s) => s.tool);
  const selection = useEditor((s) => s.selection);
  const dirty = useEditor((s) => s.dirty);
  const saving = useEditor((s) => s.saving);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const symmetry = useEditor((s) => s.symmetry);
  const showVoids = useEditor((s) => s.showVoids);
  const hoverInfo = useEditor((s) => s.hoverInfo);
  const activeDoc = useActiveDoc();
  const structure = activeDoc?.structure ?? null;
  // Block-editing is locked while the AI is generating/editing this build (both mutate
  // the doc's structure — concurrent edits would corrupt it). Force-exit if a run starts.
  const busy = activeDoc?.busy ?? false;
  useEffect(() => {
    if (busy && active) editorStore.getState().setActive(false);
  }, [busy, active]);

  // What the cursor is over (the readout), localized — a real block keeps its id.
  const cellLabel = (c: CellContent): string => {
    if (c.kind === 'block') return c.name.replace(/^minecraft:/, '');
    if (c.kind === 'air') return t('editor.cell.air');
    if (c.kind === 'void') return t('editor.cell.void');
    return t('editor.cell.empty');
  };
  const ed = editorStore.getState;

  // The footprint of the selection (W×H×D) for the readout.
  const bounds = useMemo(() => {
    if (!selection.length) return null;
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const c of selection.map(parseCell))
      for (let i = 0; i < 3; i++) {
        lo[i] = Math.min(lo[i], c[i]);
        hi[i] = Math.max(hi[i], c[i]);
      }
    return `${hi[0] - lo[0] + 1}×${hi[1] - lo[1] + 1}×${hi[2] - lo[2] + 1}`;
  }, [selection]);

  // The distinct block names among the selected cells — so you can see what you picked
  // (and what Replace will swap out). Namespace stripped for the common `minecraft:` case.
  const selectedNames = useMemo(() => {
    if (!structure || !selection.length) return [];
    const stateByPos = new Map(structure.blocks.map((b) => [cellKey(b.pos), b.state]));
    const names = new Set<string>();
    for (const k of selection) {
      const st = stateByPos.get(k);
      const entry = st != null ? structure.palette[st] : undefined;
      if (entry && !entry.air) names.add(entry.name.replace(/^minecraft:/, ''));
    }
    return [...names];
  }, [structure, selection]);

  if (!active) {
    return (
      <button
        className="editor-fab no-drag"
        onClick={() => ed().setActive(true)}
        disabled={busy}
        title={busy ? t('editor.aiBusyHint') : t('editor.enterHint')}
      >
        <Pencil size={15} strokeWidth={1.9} aria-hidden />
        {t('editor.enter')}
      </button>
    );
  }

  const hasSel = selection.length > 0;

  return (
    <div className="editor-panel no-drag">
      <header className="editor-head">
        <span className="editor-title">
          <Boxes size={15} strokeWidth={1.9} aria-hidden />
          {t('editor.title')}
        </span>
        <span className="editor-head-actions">
          {/* The Void tool forces the overlay on, so the eye is locked (disabled) while it's
              active — it always shows there. */}
          <Tooltip placement="right" label={t('editor.showVoids')} description={t('editor.showVoidsDesc')}>
            <button
              className={`editor-icon${showVoids ? ' active' : ''}`}
              onClick={() => ed().setShowVoids(!showVoids)}
              disabled={tool === 'void'}
              aria-pressed={showVoids}
            >
              {showVoids ? <Eye size={15} strokeWidth={1.9} aria-hidden /> : <EyeOff size={15} strokeWidth={1.9} aria-hidden />}
            </button>
          </Tooltip>
          <Tooltip placement="right" label={t('editor.exit')} description={t('editor.exitDesc')}>
            <button className="editor-icon" onClick={() => ed().setActive(false)}>
              <X size={15} strokeWidth={2} aria-hidden />
            </button>
          </Tooltip>
        </span>
      </header>

      <ToolRail tool={tool} onTool={(id) => ed().setTool(id)} t={t} />

      {/* Symmetry mirrors Paint + Delete across the build's centre, so it only shows for
          those tools — no phantom control under tools it doesn't affect. */}
      {(tool === 'paint' || tool === 'delete') && (
        <div className="editor-sym">
          <span className="editor-sym-label">{t('editor.symmetry')}</span>
          <Segmented
            value={symmetry}
            ariaLabel={t('editor.symmetry')}
            onChange={(v) => ed().setSymmetry(v as Symmetry)}
            options={[
              { value: 'none', label: t('editor.symOff') },
              { value: 'x', label: 'X' },
              { value: 'z', label: 'Z' },
            ]}
          />
        </div>
      )}

      <div className="editor-context">
        <ToolControls tool={tool} t={t} />
      </div>

      {(tool === 'paint' || tool === 'void') && hoverInfo && (
        <div className="editor-hoverinfo">
          <span className="editor-hoverpos">{hoverInfo.key}</span>
          <span className="editor-hoverwhat">{cellLabel(hoverInfo.content)}</span>
        </div>
      )}

      <div className="editor-selinfo">
        {hasSel ? (
          <>
            <div>{t('editor.selCount', { n: selection.length, size: bounds ?? '' })}</div>
            {selectedNames.length > 0 && (
              <div className="editor-selname" title={selectedNames.join(', ')}>
                {selectedNames.length === 1 ? selectedNames[0] : t('editor.selTypes', { n: selectedNames.length })}
              </div>
            )}
          </>
        ) : (
          t('editor.selNone')
        )}
      </div>

      {/* Selection-driven: when the selection holds data-mode structure blocks, edit the
          metadata string a mod reads — pairs with Move (nudge a marker, retype its string). */}
      {structure && hasSel && <DataMetaEditor structure={structure} selection={selection} t={t} />}

      <footer className="editor-foot">
        <Tooltip placement="right" label={t('editor.undo')} description={t('editor.undoDesc')}>
          <button className="editor-icon" onClick={() => ed().undo()} disabled={!canUndo}>
            <Undo2 size={15} strokeWidth={1.9} aria-hidden />
          </button>
        </Tooltip>
        <Tooltip placement="right" label={t('editor.redo')} description={t('editor.redoDesc')}>
          <button className="editor-icon" onClick={() => ed().redo()} disabled={!canRedo}>
            <Redo2 size={15} strokeWidth={1.9} aria-hidden />
          </button>
        </Tooltip>
        <button className="btn primary sm editor-save" disabled={!dirty || saving} onClick={() => void ed().save()}>
          <Save size={14} strokeWidth={1.9} aria-hidden />
          {saving ? t('editor.saving') : t('editor.save')}
        </button>
      </footer>
    </div>
  );
}
