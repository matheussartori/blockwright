// The export dialog's biome control: a "Mod biomes / Vanilla biomes" source toggle
// (shown only when the workspace defines biomes), then either a multi-select of the
// mod's own biomes or a vanilla preset dropdown. Pure view — the parent owns the state.
import { Check } from 'lucide-react';
import { Segmented } from '../ui/Segmented';
import { Select, type SelectOption } from '../ui/Select';
import type { TFunction } from '@/shared/i18n';

export type BiomeSource = 'mod' | 'vanilla';

interface BiomePickerProps {
  source: BiomeSource;
  onSource: (source: BiomeSource) => void;
  /** The mod's own biome ids (empty when the workspace defines none). */
  modBiomes: string[];
  picked: string[];
  onToggle: (biome: string) => void;
  onToggleAll: () => void;
  preset: string;
  onPreset: (id: string) => void;
  presetOptions: SelectOption[];
  t: TFunction;
}

/** A biome id without its namespace (`theplacebeyond:bleak/void` → `bleak/void`). */
const bare = (id: string): string => (id.includes(':') ? id.slice(id.indexOf(':') + 1) : id);

export function BiomePicker({
  source,
  onSource,
  modBiomes,
  picked,
  onToggle,
  onToggleAll,
  preset,
  onPreset,
  presetOptions,
  t,
}: BiomePickerProps) {
  const hasMod = modBiomes.length > 0;
  return (
    <div className="export-field">
      <span className="export-label">{t('export.biomesLabel')}</span>
      {hasMod && (
        <Segmented
          value={source}
          ariaLabel={t('export.biomesLabel')}
          onChange={(v) => onSource(v as BiomeSource)}
          options={[
            { value: 'mod', label: t('export.biomeSourceMod') },
            { value: 'vanilla', label: t('export.biomeSourceVanilla') },
          ]}
        />
      )}
      {hasMod && source === 'mod' ? (
        <>
          <div className="export-biome-list" role="group" aria-label={t('export.biomesLabel')}>
            {modBiomes.map((b) => {
              const on = picked.includes(b);
              return (
                <button
                  key={b}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  title={b}
                  className={`export-biome-chip no-drag${on ? ' on' : ''}`}
                  onClick={() => onToggle(b)}
                >
                  {on && <Check size={12} strokeWidth={2.6} aria-hidden />}
                  <span>{bare(b)}</span>
                </button>
              );
            })}
          </div>
          <button type="button" className="export-biome-all no-drag" onClick={onToggleAll}>
            {picked.length === modBiomes.length ? t('export.biomeClear') : t('export.biomeAll')}
          </button>
        </>
      ) : (
        <Select value={preset} options={presetOptions} onChange={onPreset} />
      )}
    </div>
  );
}
