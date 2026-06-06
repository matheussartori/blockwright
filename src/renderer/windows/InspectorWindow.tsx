// Structure metadata + the block list, grouped by block name. Rendered as a tab
// in the docked inspector sidebar, or inside a FloatingWindow when torn off — the
// chrome lives in InspectorDock / FloatingPanels, this file is just the body.
//
// Each row is a unique block name with its instance count; expanding it lists
// every occurrence in the .nbt. Clicking an occurrence focuses the camera on that
// block and flashes it (see Viewer.focusBlock) — handy in dense builds.
import { useMemo, useState } from 'react';
import type { StructureData, PaletteEntry } from '@/shared/types';
import { api } from '../api';
import { useActiveDoc, useSettings, useT } from '../hooks/useStores';
import { useViewer } from '../viewer/ViewerProvider';

interface BlockGroup {
  name: string;
  color: [number, number, number];
  /** A representative texture key (namespace/path) for the icon, or null. */
  texture: string | null;
  resolved: boolean;
  positions: [number, number, number][];
}

/** Pick one texture key to represent a block in the list — prefer a side face
 *  (the most recognizable), then top/bottom, scanning the resolved models. */
function representativeTexture(entry: PaletteEntry): string | null {
  const order: ('south' | 'north' | 'east' | 'west' | 'up' | 'down')[] = [
    'south', 'north', 'east', 'west', 'up', 'down',
  ];
  for (const model of entry.models) {
    for (const el of model.elements) {
      for (const dir of order) {
        const tex = el.faces[dir]?.texture;
        if (tex) return tex;
      }
    }
  }
  // Fall back to any face on any element if none of the preferred sides resolved.
  for (const model of entry.models) {
    for (const el of model.elements) {
      for (const face of Object.values(el.faces)) {
        if (face?.texture) return face.texture;
      }
    }
  }
  return null;
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
      g = {
        name,
        color: entry.color,
        texture: representativeTexture(entry),
        resolved: entry.models.length > 0,
        positions: [],
      };
      groups.set(name, g);
    }
    // A name with any resolved state counts as resolved (no "flat" chip).
    if (entry.models.length > 0) g.resolved = true;
    if (!g.texture) g.texture = representativeTexture(entry);
    g.positions.push(b.pos);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function rgb(color: [number, number, number]): string {
  return `rgb(${color.map((c) => Math.round(c * 255)).join(',')})`;
}

export function InspectorContent() {
  const t = useT();
  const structure = useActiveDoc()?.structure ?? null;
  const textureIcons = useSettings((s) => s.blockTextureIcons);
  const viewer = useViewer();
  const groups = useMemo(() => (structure ? groupBlocks(structure) : []), [structure]);
  const paletteCount = useMemo(
    () => (structure ? structure.palette.filter((p) => !p.air).length : 0),
    [structure],
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  if (!structure) return null;

  const copyPath = () => {
    if (!structure.path) return;
    void navigator.clipboard?.writeText(structure.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

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
        {structure.path && (
          <button
            type="button"
            className="inspector-path"
            title={copied ? t('inspector.copied') : `${t('inspector.clickToCopy')}\n${structure.path}`}
            onClick={copyPath}
          >
            {copied ? t('inspector.copiedClipboard') : structure.path}
          </button>
        )}
        <dl className="meta">
          <div>
            <dt>{t('inspector.size')}</dt>
            <dd>{structure.size.join(' × ')}</dd>
          </div>
          <div>
            <dt>{t('inspector.blocks')}</dt>
            <dd>{structure.blockCount.toLocaleString()}</dd>
          </div>
          <div>
            <dt>{t('inspector.palette')}</dt>
            <dd>{paletteCount}</dd>
          </div>
          {structure.jigsaws.length > 0 && (
            <div>
              <dt>{t('inspector.jigsaws')}</dt>
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
                {textureIcons && g.texture ? (
                  <img className="swatch swatch-tex" src={api.textureUrl(g.texture)} alt="" draggable={false} />
                ) : (
                  <span className="swatch" style={{ background: rgb(g.color) }} />
                )}
                <span className="block-name">{g.name}</span>
                {!g.resolved && <span className="chip">{t('inspector.flat')}</span>}
                <span className="block-count">({g.positions.length})</span>
              </button>
              {open && (
                <ul className="block-instances">
                  {g.positions.map((pos, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        className="instance-row"
                        title={t('inspector.focusBlock')}
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
