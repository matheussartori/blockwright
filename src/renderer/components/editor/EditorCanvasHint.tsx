// The block editor's on-canvas hint chip: the active tool + its live modifier keys,
// bottom-centred over the stage while edit mode is on — the "what will a click do right
// now" answer without opening the guide. Renders nothing when the editor is inactive;
// pointer-events are off (it narrates, never intercepts).
import type { MessageKey } from '@/shared/i18n';
import { useEditor, useT } from '../../hooks/useStores';
import type { Tool } from '../../state/editor';

/** Which key-hint line the chip shows for a tool (grouped by interaction model). */
const kbdGroupFor = (tool: Tool): 'select' | 'paint' | 'void' | 'default' => {
  if (tool === 'select') return 'select';
  if (tool === 'paint' || tool === 'replace' || tool === 'stairs') return 'paint';
  if (tool === 'void') return 'void';
  return 'default';
};

export function EditorCanvasHint() {
  const t = useT();
  const active = useEditor((s) => s.active);
  const tool = useEditor((s) => s.tool);
  if (!active) return null;
  return (
    <div className="editor-canvas-hint" aria-hidden>
      <span className="editor-canvas-tool">{t(`editor.tool.${tool}` as MessageKey)}</span>
      <span className="editor-canvas-keys">{t(`editor.kbd.${kbdGroupFor(tool)}` as MessageKey)}</span>
    </div>
  );
}
