// Structure metadata + the block list, grouped by block name. Rendered as a tab
// in the docked inspector sidebar, or inside a FloatingWindow when torn off — the
// chrome lives in InspectorDock / FloatingPanels, this file is just the body.
//
// Each row is a unique block name with its instance count; expanding it lists
// every occurrence in the .nbt. Clicking an occurrence focuses the camera on that
// block and flashes it (see Viewer.focusBlock) — handy in dense builds.
import { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
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

/** Group every block instance by its (namespace-stripped) name — including air-like entries
 *  (`air`, `structure_void`), since they're real palette entries the `.nbt` carries and the
 *  inspector should report them faithfully (structure_void in particular is intentional). */
function groupBlocks(data: StructureData): BlockGroup[] {
  const groups = new Map<string, BlockGroup>();
  for (const b of data.blocks) {
    const entry = data.palette[b.state];
    if (!entry) continue;
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

interface EntityGroup {
  name: string;
  color: [number, number, number];
  /** Floored positions (for the focus camera) of every occurrence. */
  positions: [number, number, number][];
}

/** Group structure entities (armor stands, mobs, …) by id. These have no palette block —
 *  they render from `StructureData.entities` — so the inspector lists them separately. The
 *  swatch reuses each entity's deterministic fallback color (same source the palette uses). */
function groupEntities(data: StructureData): EntityGroup[] {
  const groups = new Map<string, EntityGroup>();
  for (const e of data.entities ?? []) {
    const name = e.id.replace('minecraft:', '');
    let g = groups.get(name);
    if (!g) {
      g = { name, color: e.color, positions: [] };
      groups.set(name, g);
    }
    g.positions.push([Math.floor(e.pos[0]), Math.floor(e.pos[1]), Math.floor(e.pos[2])]);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

interface DataMarkerGroup {
  /** The metadata string — the marker's identity (several blocks often share one). */
  data: string;
  positions: [number, number, number][];
}

/** Group data-mode structure blocks by their metadata string. The string is the payload
 *  a mod reads (spawn/trigger hooks), so it headlines the row — not the block name. */
function groupDataMarkers(data: StructureData): DataMarkerGroup[] {
  const groups = new Map<string, DataMarkerGroup>();
  for (const m of data.dataMarkers ?? []) {
    let g = groups.get(m.data);
    if (!g) {
      g = { data: m.data, positions: [] };
      groups.set(m.data, g);
    }
    g.positions.push(m.pos);
  }
  return [...groups.values()].sort((a, b) => a.data.localeCompare(b.data));
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
  const entityGroups = useMemo(() => (structure ? groupEntities(structure) : []), [structure]);
  const markerGroups = useMemo(() => (structure ? groupDataMarkers(structure) : []), [structure]);
  // The data markers' swatch reuses the structure block's own palette entry (texture or
  // fallback color), so the row keeps the list's visual language.
  const markerSwatch = useMemo(() => {
    const entry = structure?.palette.find((p) => p.name === 'minecraft:structure_block');
    return entry ? { texture: representativeTexture(entry), color: entry.color } : null;
  }, [structure]);
  // The file's full palette size (air-like entries included — they're real palette entries).
  const paletteCount = structure?.palette.length ?? 0;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [copiedData, setCopiedData] = useState<string | null>(null);

  if (!structure) return null;

  const copyPath = () => {
    if (!structure.path) return;
    void navigator.clipboard?.writeText(structure.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const copyData = (data: string) => {
    void navigator.clipboard?.writeText(data);
    setCopiedData(data);
    setTimeout(() => setCopiedData(null), 1200);
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
          {structure.entities.length > 0 && (
            <div>
              <dt>{t('inspector.entities')}</dt>
              <dd>{structure.entities.length}</dd>
            </div>
          )}
          {(structure.dataMarkers?.length ?? 0) > 0 && (
            <div>
              <dt>{t('inspector.dataMarkers')}</dt>
              <dd>{structure.dataMarkers.length}</dd>
            </div>
          )}
        </dl>
      </div>
      <div className="palette-list">
        {markerGroups.map((g) => {
          const key = `data:${g.data}`;
          const open = expanded.has(key);
          const justCopied = copiedData === g.data;
          return (
            <div className="palette-group" key={key}>
              <div className="palette-row data-marker-row">
                <button
                  type="button"
                  className="data-marker-main"
                  aria-expanded={open}
                  onClick={() => toggle(key)}
                >
                  <span className={`bw-caret${open ? ' open' : ''}`}>▸</span>
                  {textureIcons && markerSwatch?.texture ? (
                    <img className="swatch swatch-tex" src={api.textureUrl(markerSwatch.texture)} alt="" draggable={false} />
                  ) : (
                    <span className="swatch" style={{ background: rgb(markerSwatch?.color ?? [0.55, 0.45, 0.55]) }} />
                  )}
                  <span className="block-name data-marker-string" title={g.data}>{g.data}</span>
                  <span className="chip">{t('inspector.dataChip')}</span>
                  <span className="block-count">({g.positions.length})</span>
                </button>
                <button
                  type="button"
                  className={`data-marker-copy${justCopied ? ' done' : ''}`}
                  aria-label={t('inspector.copyData')}
                  onClick={() => copyData(g.data)}
                >
                  {justCopied ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>
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
        {entityGroups.map((g) => {
          const key = `entity:${g.name}`;
          const open = expanded.has(key);
          return (
            <div className="palette-group" key={key}>
              <button
                type="button"
                className="palette-row"
                aria-expanded={open}
                onClick={() => toggle(key)}
              >
                <span className={`bw-caret${open ? ' open' : ''}`}>▸</span>
                <span className="swatch" style={{ background: rgb(g.color) }} />
                <span className="block-name">{g.name}</span>
                <span className="chip">{t('inspector.entities')}</span>
                <span className="block-count">({g.positions.length})</span>
              </button>
              {open && (
                <ul className="block-instances">
                  {g.positions.map((pos, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        className="instance-row"
                        title={t('inspector.focusEntity')}
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
