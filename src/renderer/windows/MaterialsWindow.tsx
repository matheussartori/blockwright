// The Materials panel: the Bill of Materials for the open structure — item counts
// with stack + shulker math (state-aware rollup, entities included) and CSV/JSON
// export. Rendered as a tab in the docked inspector sidebar or torn off into a
// FloatingWindow, like the Inspector (the chrome lives in InspectorDock).
import { useMemo, useState } from 'react';
import { FileDown } from 'lucide-react';
import type { MaterialsFormat } from '@/shared/types';
import { api } from '../api';
import { buildMaterialList, materialsToCsv, materialsToJson } from '../materials/materials';
import { useActiveDoc, useSettings, useT } from '../hooks/useStores';
import { representativeTexture } from './InspectorWindow';

function rgb(color: [number, number, number]): string {
  return `rgb(${color.map((c) => Math.round(c * 255)).join(',')})`;
}

export function MaterialsContent() {
  const t = useT();
  const structure = useActiveDoc()?.structure ?? null;
  const textureIcons = useSettings((s) => s.blockTextureIcons);
  const preferredFormat = useSettings((s) => s.materialsFormat);
  const [saved, setSaved] = useState<string | null>(null);
  const list = useMemo(() => (structure ? buildMaterialList(structure) : null), [structure]);

  if (!structure || !list) return null;

  const doExport = async (format: MaterialsFormat) => {
    const result = await api.exportMaterials({
      suggestedName: `${structure.name.replace(/\.(nbt|schem|litematic)$/i, '')}-materials`,
      format,
      csv: materialsToCsv(list),
      json: materialsToJson(list, { name: structure.name, size: structure.size }),
    });
    if (result.ok && result.path) {
      setSaved(result.path);
      setTimeout(() => setSaved(null), 2500);
    }
  };

  // The preferred format leads; the other is one click away.
  const formats: MaterialsFormat[] = preferredFormat === 'json' ? ['json', 'csv'] : ['csv', 'json'];

  return (
    <>
      <div className="materials-head">
        <div className="materials-total">
          {t('materials.total', { n: list.totalItems.toLocaleString() })}
        </div>
        <div className="materials-actions">
          {formats.map((format) => (
            <button
              key={format}
              type="button"
              className="materials-export-btn"
              title={t('materials.exportHint', { format: format.toUpperCase() })}
              onClick={() => void doExport(format)}
            >
              <FileDown size={13} strokeWidth={1.8} aria-hidden />
              {format.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      {saved && <p className="materials-saved" title={saved}>{t('materials.saved')}</p>}
      {list.blocks.length === 0 && list.entities.length === 0 && (
        <p className="materials-empty">{t('materials.empty')}</p>
      )}
      <div className="palette-list materials-list">
        {list.blocks.map((row) => {
          const entry = row.paletteState >= 0 ? structure.palette[row.paletteState] : null;
          const texture = entry ? representativeTexture(entry) : null;
          return (
            <div className="materials-row" key={row.id}>
              {textureIcons && texture ? (
                <img className="swatch swatch-tex" src={api.textureUrl(texture)} alt="" draggable={false} />
              ) : (
                <span className="swatch" style={{ background: rgb(entry?.color ?? [0.5, 0.5, 0.5]) }} />
              )}
              <span className="block-name" title={row.id}>{row.id.replace('minecraft:', '')}</span>
              <span className="materials-count">{row.count.toLocaleString()}</span>
              <span className="materials-stacks" title={t('materials.stacksHint', { size: row.stackSize })}>
                {row.stacks > 0 ? `${row.stacks}×${row.stackSize}${row.remainder ? ` + ${row.remainder}` : ''}` : ''}
                {row.shulkers > 0 && (
                  <span className="chip materials-shulkers">{t('materials.shulkers', { n: row.shulkers })}</span>
                )}
              </span>
            </div>
          );
        })}
        {list.entities.length > 0 && (
          <div className="materials-section">{t('materials.entities')}</div>
        )}
        {list.entities.map((row) => (
          <div className="materials-row" key={`entity:${row.id}`}>
            <span className="swatch" style={{ background: 'var(--border-strong)' }} />
            <span className="block-name" title={row.id}>{row.id.replace('minecraft:', '')}</span>
            <span className="materials-count">{row.count.toLocaleString()}</span>
            <span className="materials-stacks" />
          </div>
        ))}
      </div>
    </>
  );
}
