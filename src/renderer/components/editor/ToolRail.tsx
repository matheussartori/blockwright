// The editor's tool rail: one icon button per tool, the active one filled with the accent.
import { ArrowUpFromLine, Brush, FlipHorizontal2, Move, MousePointer2, Replace, SquareDashed, Trash2, TrendingUp } from 'lucide-react';
import type { Tool } from '../../state/editor';
import type { MessageKey, TFunction } from '@/shared/i18n';

const TOOLS: { id: Tool; Icon: typeof Move }[] = [
  { id: 'select', Icon: MousePointer2 },
  { id: 'move', Icon: Move },
  { id: 'transform', Icon: FlipHorizontal2 },
  { id: 'extrude', Icon: ArrowUpFromLine },
  { id: 'stairs', Icon: TrendingUp },
  { id: 'paint', Icon: Brush },
  { id: 'replace', Icon: Replace },
  { id: 'void', Icon: SquareDashed },
  { id: 'delete', Icon: Trash2 },
];

export function ToolRail({ tool, onTool, t }: { tool: Tool; onTool: (tool: Tool) => void; t: TFunction }) {
  return (
    <div className="editor-tools">
      {TOOLS.map(({ id, Icon }) => (
        <button
          key={id}
          className={`editor-tool${tool === id ? ' active' : ''}`}
          onClick={() => onTool(id)}
          title={t(`editor.tool.${id}` as MessageKey)}
          aria-pressed={tool === id}
        >
          <Icon size={17} strokeWidth={1.8} aria-hidden />
        </button>
      ))}
    </div>
  );
}
