// Structure metadata + the unique block palette. Rendered as a tab in the docked
// inspector sidebar, or inside a FloatingWindow when torn off — the chrome lives
// in InspectorDock / FloatingPanels, this file is just the body.
import { useMemo } from 'react';
import type { StructureData } from '@/shared/types';
import { useApp } from '../hooks/useStores';

function uniqueBlocks(data: StructureData) {
  return data.palette
    .filter((p) => !p.air)
    .map((p) => ({
      name: p.name.replace('minecraft:', ''),
      color: p.color,
      resolved: p.models.length > 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function InspectorContent() {
  const structure = useApp((s) => s.structure);
  const blocks = useMemo(() => (structure ? uniqueBlocks(structure) : []), [structure]);

  if (!structure) return null;

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
            <dd>{blocks.length}</dd>
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
        {blocks.map((b, i) => (
          <div className="palette-row" key={`${b.name}-${i}`}>
            <span
              className="swatch"
              style={{ background: `rgb(${b.color.map((c) => Math.round(c * 255)).join(',')})` }}
            />
            <span className="block-name">{b.name}</span>
            {!b.resolved && <span className="chip">flat</span>}
          </div>
        ))}
      </div>
    </>
  );
}
