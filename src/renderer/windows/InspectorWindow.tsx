// Structure metadata + the block list, grouped by block name. Rendered as a tab
// in the docked inspector sidebar, or inside a FloatingWindow when torn off — the
// chrome lives in InspectorDock / FloatingPanels, this file is just the body.
//
// Each row is a unique block name with its instance count; expanding it lists
// every occurrence in the .nbt. Clicking an occurrence focuses the camera on that
// block and flashes it (see Viewer.focusBlock) — handy in dense builds.
import { useMemo, useState } from 'react';
import type { StructureData } from '@/shared/types';
import { useActiveDoc } from '../hooks/useStores';
import { useViewer } from '../viewer/ViewerProvider';

interface BlockGroup {
  name: string;
  color: [number, number, number];
  resolved: boolean;
  positions: [number, number, number][];
}

/** Group every non-air block instance by its (namespace-stripped) name. */
function groupBlocks(data: StructureData): BlockGroup[] {
  const groups = new Map<string, BlockGroup>();
  for (const b of data.blocks) {
    const entry = data.palette[b.state];
    if (!entry || entry.air) continue;
    const name = entry.name.replace('minecraft:', '');
    let g = groups.get(name);
    if (!g) {
      g = { name, color: entry.color, resolved: entry.models.length > 0, positions: [] };
      groups.set(name, g);
    }
    // A name with any resolved state counts as resolved (no "flat" chip).
    if (entry.models.length > 0) g.resolved = true;
    g.positions.push(b.pos);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function rgb(color: [number, number, number]): string {
  return `rgb(${color.map((c) => Math.round(c * 255)).join(',')})`;
}

export function InspectorContent() {
  const structure = useActiveDoc()?.structure ?? null;
  const viewer = useViewer();
  const groups = useMemo(() => (structure ? groupBlocks(structure) : []), [structure]);
  const paletteCount = useMemo(
    () => (structure ? structure.palette.filter((p) => !p.air).length : 0),
    [structure],
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (!structure) return null;

  const toggle = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <>
      <div className="inspector-meta">
        <h2 title={structure.name}>{structure.name}</h2>
        <dl className="meta">
          <div>
            <dt>Size</dt>
            <dd>{structure.size.join(' × ')}</dd>
          </div>
          <div>
            <dt>Blocks</dt>
            <dd>{structure.blockCount.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Palette</dt>
            <dd>{paletteCount}</dd>
          </div>
          {structure.jigsaws.length > 0 && (
            <div>
              <dt>Jigsaws</dt>
              <dd>{structure.jigsaws.length}</dd>
            </div>
          )}
        </dl>
      </div>
      <div className="palette-list">
        {groups.map((g) => {
          const open = expanded.has(g.name);
          return (
            <div className="palette-group" key={g.name}>
              <button
                type="button"
                className="palette-row"
                aria-expanded={open}
                onClick={() => toggle(g.name)}
              >
                <span className={`bw-caret${open ? ' open' : ''}`}>▸</span>
                <span className="swatch" style={{ background: rgb(g.color) }} />
                <span className="block-name">{g.name}</span>
                {!g.resolved && <span className="chip">flat</span>}
                <span className="block-count">({g.positions.length})</span>
              </button>
              {open && (
                <ul className="block-instances">
                  {g.positions.map((pos, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        className="instance-row"
                        title="Focus this block"
                        onClick={() => viewer?.focusBlock(pos)}
                      >
                        <span className="instance-idx">{i + 1}</span>
                        <span className="instance-pos">{pos.join(', ')}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
