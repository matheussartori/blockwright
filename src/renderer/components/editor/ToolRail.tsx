// The editor's tool rail: one icon button per tool, the active one filled with the accent.
// Each button carries a Tooltip naming the tool (+ its number-key shortcut) and a one-line
// note on what it does. The order comes from TOOL_ORDER, so the 1–9 shortcuts always match
// the button positions.
import { ArrowUpFromLine, Brush, FlipHorizontal2, Move, MousePointer2, Replace, SquareDashed, Trash2, TrendingUp } from 'lucide-react';
import { TOOL_ORDER, type Tool } from '../../state/editor';
import type { MessageKey, TFunction } from '@/shared/i18n';
import { Tooltip } from '../ui/Tooltip';

const ICONS: Record<Tool, typeof Move> = {
  select: MousePointer2,
  move: Move,
  transform: FlipHorizontal2,
  extrude: ArrowUpFromLine,
  stairs: TrendingUp,
  paint: Brush,
  replace: Replace,
  void: SquareDashed,
  delete: Trash2,
};

export function ToolRail({ tool, onTool, t }: { tool: Tool; onTool: (tool: Tool) => void; t: TFunction }) {
  return (
    <div className="editor-tools">
      {TOOL_ORDER.map((id, i) => {
        const Icon = ICONS[id];
        return (
          <Tooltip
            key={id}
            placement="right"
            label={`${t(`editor.tool.${id}` as MessageKey)} — ${i + 1}`}
            description={t(`editor.toolDesc.${id}` as MessageKey)}
          >
            <button
              className={`editor-tool${tool === id ? ' active' : ''}`}
              onClick={() => onTool(id)}
              aria-pressed={tool === id}
            >
              <Icon size={17} strokeWidth={1.8} aria-hidden />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
