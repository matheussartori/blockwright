// The block editor's control surface: a floating panel on the stage. When edit mode is
// off it's a single "Edit" button; on, it's the tool rail + the active tool's controls +
// the selection readout + Save/Undo/Redo. The actual block ops live in the editor store
// (state/editor.ts) and the pure ops (editor/ops.ts); this is a thin, themed view over
// them. Move/extrude use precise ±1 axis buttons (and arrow keys via EditorLayer) — no
// fiddly 3D gizmo. Save writes a new `.nbt` version, so a bad edit is never fatal.
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpFromLine,
  Boxes,
  Move,
  MousePointer2,
  Pencil,
  Redo2,
  Replace,
  Save,
  Trash2,
  TrendingUp,
  Undo2,
  X,
} from 'lucide-react';
import { api } from '../../api';
import { useActiveDoc, useEditor, useT } from '../../hooks/useStores';
import { editorStore, type Tool } from '../../state/editor';
import { cellKey, parseCell, type Axis, type Cell, type Horizontal } from '../../editor/ops';
import { Select } from '../ui/Select';
import { Stepper } from '../ui/Stepper';
import type { MessageKey, TFunction } from '@/shared/i18n';

const TOOLS: { id: Tool; Icon: typeof Move }[] = [
  { id: 'select', Icon: MousePointer2 },
  { id: 'move', Icon: Move },
  { id: 'extrude', Icon: ArrowUpFromLine },
  { id: 'stairs', Icon: TrendingUp },
  { id: 'replace', Icon: Replace },
  { id: 'delete', Icon: Trash2 },
];

const DIRS: Horizontal[] = ['north', 'south', 'east', 'west'];

/** The six axis buttons shared by Move (±1) and Extrude (±count). */
function AxisPad({ onAxis, t }: { onAxis: (axis: Axis, dir: 1 | -1) => void; t: TFunction }) {
  const rows: { axis: Axis; label: string }[] = [
    { axis: 'x', label: t('editor.axisX') },
    { axis: 'y', label: t('editor.axisY') },
    { axis: 'z', label: t('editor.axisZ') },
  ];
  return (
    <div className="editor-axispad">
      {rows.map(({ axis, label }) => (
        <div key={axis} className="editor-axisrow">
          <button className="editor-axisbtn no-drag" onClick={() => onAxis(axis, -1)} aria-label={`−${label}`}>
            −
          </button>
          <span className="editor-axislabel">{label}</span>
          <button className="editor-axisbtn no-drag" onClick={() => onAxis(axis, 1)} aria-label={`+${label}`}>
            +
          </button>
        </div>
      ))}
    </div>
  );
}

export function EditorPanel() {
  const t = useT();
  const active = useEditor((s) => s.active);
  const tool = useEditor((s) => s.tool);
  const selection = useEditor((s) => s.selection);
  const dirty = useEditor((s) => s.dirty);
  const saving = useEditor((s) => s.saving);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const replaceBlock = useEditor((s) => s.replaceBlock);
  const stairsBlock = useEditor((s) => s.stairsBlock);
  const stairsDir = useEditor((s) => s.stairsDir);
  const stairsSteps = useEditor((s) => s.stairsSteps);
  const extrudeCount = useEditor((s) => s.extrudeCount);
  const anchor = useEditor((s) => s.anchor);
  const structure = useActiveDoc()?.structure ?? null;
  const ed = editorStore.getState;

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

  // Block ids for the Replace / Stairs autocomplete (the content pack's placeable blocks).
  const [blockIds, setBlockIds] = useState<string[]>([]);
  useEffect(() => {
    if (!active || blockIds.length) return;
    void api.listCatalog().then((blocks) => setBlockIds(blocks.map((b) => b.id)));
  }, [active, blockIds.length]);
  const stairIds = useMemo(() => blockIds.filter((id) => id.endsWith('_stairs')), [blockIds]);

  const bounds = useMemo(() => {
    if (!selection.length) return null;
    const cells = selection.map(parseCell);
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const c of cells) for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], c[i]);
      hi[i] = Math.max(hi[i], c[i]);
    }
    return `${hi[0] - lo[0] + 1}×${hi[1] - lo[1] + 1}×${hi[2] - lo[2] + 1}`;
  }, [selection]);

  if (!active) {
    return (
      <button className="editor-fab no-drag" onClick={() => ed().setActive(true)} title={t('editor.enterHint')}>
        <Pencil size={15} strokeWidth={1.9} aria-hidden />
        {t('editor.enter')}
      </button>
    );
  }

  const axisDelta = (axis: Axis, dir: 1 | -1): Cell => {
    const d: Cell = [0, 0, 0];
    d[axis === 'x' ? 0 : axis === 'y' ? 1 : 2] = dir;
    return d;
  };
  const hasSel = selection.length > 0;

  return (
    <div className="editor-panel no-drag">
      <header className="editor-head">
        <span className="editor-title">
          <Boxes size={15} strokeWidth={1.9} aria-hidden />
          {t('editor.title')}
        </span>
        <button className="editor-icon" onClick={() => ed().setActive(false)} title={t('editor.exit')} aria-label={t('editor.exit')}>
          <X size={15} strokeWidth={2} aria-hidden />
        </button>
      </header>

      <div className="editor-tools">
        {TOOLS.map(({ id, Icon }) => (
          <button
            key={id}
            className={`editor-tool${tool === id ? ' active' : ''}`}
            onClick={() => ed().setTool(id)}
            title={t(`editor.tool.${id}` as MessageKey)}
            aria-pressed={tool === id}
          >
            <Icon size={17} strokeWidth={1.8} aria-hidden />
          </button>
        ))}
      </div>

      <div className="editor-context">
        {tool === 'select' && <p className="editor-hint">{t('editor.selectHint')}</p>}

        {tool === 'move' && (
          <>
            <p className="editor-hint">{t('editor.moveHint')}</p>
            <AxisPad t={t} onAxis={(axis, dir) => ed().move(axisDelta(axis, dir))} />
          </>
        )}

        {tool === 'extrude' && (
          <>
            <p className="editor-hint">{t('editor.extrudeHint')}</p>
            <label className="editor-field">
              <span className="editor-label">{t('editor.count')}</span>
              <Stepper value={extrudeCount} min={1} max={64} onChange={(n) => ed().setExtrudeCount(n)} ariaLabel={t('editor.count')} />
            </label>
            <AxisPad t={t} onAxis={(axis, dir) => ed().extrude(axis, dir)} />
          </>
        )}

        {tool === 'stairs' && (
          <>
            <p className="editor-hint">{anchor ? t('editor.stairsHint') : t('editor.stairsPick')}</p>
            <label className="editor-field">
              <span className="editor-label">{t('editor.block')}</span>
              <input
                className="editor-input"
                list="editor-stair-blocks"
                value={stairsBlock}
                spellCheck={false}
                onChange={(e) => ed().setStairsBlock(e.target.value)}
              />
              <datalist id="editor-stair-blocks">
                {stairIds.map((id) => (
                  <option key={id} value={id} />
                ))}
              </datalist>
            </label>
            <label className="editor-field">
              <span className="editor-label">{t('editor.direction')}</span>
              <Select
                value={stairsDir}
                options={DIRS.map((d) => ({ value: d, label: t(`editor.dir.${d}` as MessageKey) }))}
                onChange={(v) => ed().setStairsDir(v as Horizontal)}
              />
            </label>
            <label className="editor-field">
              <span className="editor-label">{t('editor.steps')}</span>
              <Stepper value={stairsSteps} min={1} max={64} onChange={(n) => ed().setStairsSteps(n)} ariaLabel={t('editor.steps')} />
            </label>
            <button className="btn primary sm editor-apply" disabled={!anchor} onClick={() => void ed().stairs()}>
              {t('editor.buildStairs')}
            </button>
          </>
        )}

        {tool === 'replace' && (
          <>
            <p className="editor-hint">{t('editor.replaceHint')}</p>
            <label className="editor-field">
              <span className="editor-label">{t('editor.withBlock')}</span>
              <input
                className="editor-input"
                list="editor-blocks"
                value={replaceBlock}
                spellCheck={false}
                onChange={(e) => ed().setReplaceBlock(e.target.value)}
              />
              <datalist id="editor-blocks">
                {blockIds.map((id) => (
                  <option key={id} value={id} />
                ))}
              </datalist>
            </label>
            <button className="btn primary sm editor-apply" disabled={!hasSel} onClick={() => void ed().replace()}>
              {t('editor.applyReplace')}
            </button>
          </>
        )}

        {tool === 'delete' && (
          <>
            <p className="editor-hint">{t('editor.deleteHint')}</p>
            <button className="btn sm editor-apply danger" disabled={!hasSel} onClick={() => ed().remove()}>
              <Trash2 size={14} strokeWidth={1.9} aria-hidden />
              {t('editor.applyDelete')}
            </button>
          </>
        )}
      </div>

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

      <footer className="editor-foot">
        <button className="editor-icon" onClick={() => ed().undo()} disabled={!canUndo} title={t('editor.undo')} aria-label={t('editor.undo')}>
          <Undo2 size={15} strokeWidth={1.9} aria-hidden />
        </button>
        <button className="editor-icon" onClick={() => ed().redo()} disabled={!canRedo} title={t('editor.redo')} aria-label={t('editor.redo')}>
          <Redo2 size={15} strokeWidth={1.9} aria-hidden />
        </button>
        <button className="btn primary sm editor-save" disabled={!dirty || saving} onClick={() => void ed().save()}>
          <Save size={14} strokeWidth={1.9} aria-hidden />
          {saving ? t('editor.saving') : t('editor.save')}
        </button>
      </footer>
    </div>
  );
}
