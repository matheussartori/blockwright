// The controls for the active editor tool. Each branch is a focused little form that calls
// the matching store action; the store (state/editor.ts) + pure ops (editor/ops.ts) do the
// work. Move/Extrude share the AxisPad; Replace/Stairs share the BlockField autocomplete.
import { useMemo } from 'react';
import { Pipette, Trash2 } from 'lucide-react';
import { useEditor } from '../../hooks/useStores';
import { editorStore, type Tool } from '../../state/editor';
import type { Axis, Cell, Horizontal } from '../../editor/ops';
import { Select } from '../ui/Select';
import { Stepper } from '../ui/Stepper';
import { BlockPreview } from '../ui/BlockPreview';
import { AxisPad } from './AxisPad';
import { BlockField } from './BlockField';
import { useBlockIds } from './useBlockIds';
import type { MessageKey, TFunction } from '@/shared/i18n';

const DIRS: Horizontal[] = ['north', 'south', 'east', 'west'];
const axisDelta = (axis: Axis, dir: 1 | -1): Cell => [axis === 'x' ? dir : 0, axis === 'y' ? dir : 0, axis === 'z' ? dir : 0];

export function ToolControls({ tool, t }: { tool: Tool; t: TFunction }) {
  const ed = editorStore.getState;
  const selection = useEditor((s) => s.selection);
  const anchor = useEditor((s) => s.anchor);
  const extrudeCount = useEditor((s) => s.extrudeCount);
  const extrudeStep = useEditor((s) => s.extrudeStep);
  const stairsBlock = useEditor((s) => s.stairsBlock);
  const stairsDir = useEditor((s) => s.stairsDir);
  const stairsSteps = useEditor((s) => s.stairsSteps);
  const replaceBlock = useEditor((s) => s.replaceBlock);
  const placeBlock = useEditor((s) => s.placeBlock);
  const eyedropper = useEditor((s) => s.eyedropper);
  const blockIds = useBlockIds();
  const stairIds = useMemo(() => blockIds.filter((id) => id.endsWith('_stairs')), [blockIds]);
  const hasSel = selection.length > 0;

  switch (tool) {
    case 'select':
      return <p className="editor-hint">{t('editor.selectHint')}</p>;

    case 'move':
      return (
        <>
          <p className="editor-hint">{t('editor.moveHint')}</p>
          <AxisPad t={t} onAxis={(axis, dir) => ed().move(axisDelta(axis, dir))} />
        </>
      );

    case 'extrude':
      return (
        <>
          <p className="editor-hint">{t('editor.extrudeHint')}</p>
          <div className="editor-grid2">
            <label className="editor-field">
              <span className="editor-label">{t('editor.count')}</span>
              <Stepper value={extrudeCount} min={1} max={64} onChange={(n) => ed().setExtrudeCount(n)} ariaLabel={t('editor.count')} />
            </label>
            <label className="editor-field">
              <span className="editor-label">{t('editor.spacing')}</span>
              <Stepper value={extrudeStep} min={1} max={16} onChange={(n) => ed().setExtrudeStep(n)} ariaLabel={t('editor.spacing')} />
            </label>
          </div>
          <AxisPad t={t} onAxis={(axis, dir) => ed().extrude(axis, dir)} />
        </>
      );

    case 'transform':
      return (
        <>
          <p className="editor-hint">{t('editor.transformHint')}</p>
          <div className="editor-btngrid">
            <button className="btn sm no-drag" disabled={!hasSel} onClick={() => void ed().transform({ kind: 'mirror', axis: 'x' })}>
              {t('editor.mirrorX')}
            </button>
            <button className="btn sm no-drag" disabled={!hasSel} onClick={() => void ed().transform({ kind: 'mirror', axis: 'z' })}>
              {t('editor.mirrorZ')}
            </button>
            <button className="btn sm no-drag" disabled={!hasSel} onClick={() => void ed().transform({ kind: 'rotate', turns: 1 })}>
              {t('editor.rotateCw')}
            </button>
            <button className="btn sm no-drag" disabled={!hasSel} onClick={() => void ed().transform({ kind: 'rotate', turns: -1 })}>
              {t('editor.rotateCcw')}
            </button>
          </div>
        </>
      );

    case 'place':
      return (
        <>
          <p className="editor-hint">{t('editor.placeHint')}</p>
          <div className="editor-blockrow">
            <div className="editor-swatch">
              <BlockPreview blockId={placeBlock} />
            </div>
            <BlockField label={t('editor.placeBlockLabel')} value={placeBlock} onChange={(v) => ed().setPlaceBlock(v)} options={blockIds} listId="editor-place-blocks" />
          </div>
        </>
      );

    case 'stairs':
      return (
        <>
          <p className="editor-hint">{anchor ? t('editor.stairsHint') : t('editor.stairsPick')}</p>
          <BlockField label={t('editor.block')} value={stairsBlock} onChange={(v) => ed().setStairsBlock(v)} options={stairIds} listId="editor-stair-blocks" />
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
      );

    case 'replace':
      return (
        <>
          <p className="editor-hint">{t('editor.replaceHint')}</p>
          <div className="editor-blockrow">
            <div className="editor-swatch">
              <BlockPreview blockId={replaceBlock} />
            </div>
            <BlockField label={t('editor.withBlock')} value={replaceBlock} onChange={(v) => ed().setReplaceBlock(v)} options={blockIds} listId="editor-blocks" />
          </div>
          <button
            className={`btn sm ghost editor-eyedrop${eyedropper ? ' active' : ''}`}
            onClick={() => ed().setEyedropper(!eyedropper)}
            title={t('editor.eyedropperHint')}
          >
            <Pipette size={14} strokeWidth={1.9} aria-hidden />
            {eyedropper ? t('editor.eyedropperOn') : t('editor.eyedropper')}
          </button>
          <button className="btn primary sm editor-apply" disabled={!hasSel} onClick={() => void ed().replace()}>
            {t('editor.applyReplace')}
          </button>
        </>
      );

    case 'delete':
      return (
        <>
          <p className="editor-hint">{t('editor.deleteHint')}</p>
          <button className="btn sm editor-apply danger" disabled={!hasSel} onClick={() => ed().remove()}>
            <Trash2 size={14} strokeWidth={1.9} aria-hidden />
            {t('editor.applyDelete')}
          </button>
        </>
      );

    default:
      return null;
  }
}
