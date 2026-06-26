// The export dialog's left column: every decision that shapes the worldgen config — the
// resource name, the "generate worldgen files" switch, and (when on) terrain fit, biomes,
// and rarity. Owns its own control state (reset by a `key` remount per target) and reports
// the resulting {name, resourceName, worldgen} up via `onChange`, so the orchestrator only
// has to plan + write it. The biome sub-control lives in BiomePicker.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { Select, type SelectOption } from '../ui/Select';
import { Stepper } from '../ui/Stepper';
import { Switch } from '../ui/Switch';
import { BiomePicker, type BiomeSource } from './BiomePicker';
import { TerrainPreview } from './TerrainPreview';
import {
  BIOME_PRESETS,
  DEFAULT_WORLDGEN,
  RARITY_PRESETS,
  SPACING_MAX,
  SPACING_MIN,
  TERRAIN_ADAPTATIONS,
  sanitizeResourceName,
  type TerrainAdaptation,
  type WorldgenOptions,
} from '@/shared/domain/worldgen';
import type { MessageKey, TFunction } from '@/shared/i18n';

/** What the config column produces for the orchestrator to plan + write. */
export interface ExportDraft {
  name: string;
  resourceName: string;
  worldgen: WorldgenOptions;
}

const BIOME_IDS = BIOME_PRESETS.map((p) => p.id);
// The rarity the dialog opens on — spacing/separation are seeded from THIS preset (below), so
// the dropdown's label and the actual numbers can't silently disagree.
const DEFAULT_RARITY = 'uncommon';
const DEFAULT_RARITY_PRESET = RARITY_PRESETS.find((r) => r.id === DEFAULT_RARITY);

interface ExportConfigProps {
  workspaceName: string;
  namespace: string;
  defaultName: string;
  /** The structure's [w, h, d], to proportion the terrain preview. */
  structureSize: [number, number, number];
  /** Force the worldgen files on (a split assembly can't reassemble without its pools), so
   *  the toggle is locked and the worldgen options always show. */
  forceWorldgen?: boolean;
  onChange: (draft: ExportDraft) => void;
  t: TFunction;
}

export function ExportConfig({ workspaceName, namespace, defaultName, structureSize, forceWorldgen = false, onChange, t }: ExportConfigProps) {
  const [name, setName] = useState(defaultName);
  const [generate, setGenerate] = useState(DEFAULT_WORLDGEN.generate);
  const [terrain, setTerrain] = useState<TerrainAdaptation>(DEFAULT_WORLDGEN.terrainAdaptation);
  const [biomeSource, setBiomeSource] = useState<BiomeSource>('vanilla');
  const [modBiomes, setModBiomes] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [preset, setPreset] = useState(BIOME_IDS[0]);
  const [rarity, setRarity] = useState(DEFAULT_RARITY);
  const [spacing, setSpacing] = useState(DEFAULT_RARITY_PRESET?.spacing ?? DEFAULT_WORLDGEN.spacing);
  const [separation, setSeparation] = useState(DEFAULT_RARITY_PRESET?.separation ?? DEFAULT_WORLDGEN.separation);

  // Read the mod's own biomes; default to picking all of them (a mod build usually
  // belongs in the mod's biomes, not vanilla ones).
  useEffect(() => {
    let stale = false;
    void api.listWorkspaceBiomes().then((biomes) => {
      if (stale) return;
      setModBiomes(biomes);
      setPicked(biomes);
      setBiomeSource(biomes.length > 0 ? 'mod' : 'vanilla');
    });
    return () => {
      stale = true;
    };
  }, []);

  // A split (oversized) export MUST emit its worldgen plumbing, so the toggle is locked on.
  const effectiveGenerate = generate || forceWorldgen;
  const resourceName = useMemo(() => sanitizeResourceName(name), [name]);
  const worldgen: WorldgenOptions = useMemo(
    () => ({
      generate: effectiveGenerate,
      terrainAdaptation: terrain,
      biomes: biomeSource === 'mod' ? picked : (BIOME_PRESETS.find((p) => p.id === preset)?.biomes ?? []),
      spacing,
      separation,
    }),
    [effectiveGenerate, terrain, biomeSource, picked, preset, spacing, separation],
  );

  useEffect(() => onChange({ name, resourceName, worldgen }), [name, resourceName, worldgen, onChange]);

  const terrainOptions: SelectOption[] = TERRAIN_ADAPTATIONS.map((id) => ({
    value: id,
    label: t(`export.terrain.${id}` as MessageKey),
    description: t(`export.terrain.${id}Desc` as MessageKey),
  }));
  const biomeOptions: SelectOption[] = BIOME_IDS.map((id) => ({
    value: id,
    label: t(`export.biome.${id}` as MessageKey),
    description: t('export.biomesCount', { count: BIOME_PRESETS.find((p) => p.id === id)?.biomes.length ?? 0 }),
  }));
  const rarityOptions: SelectOption[] = [...RARITY_PRESETS.map((r) => r.id), 'custom'].map((id) => ({
    value: id,
    label: t(`export.rarity.${id}` as MessageKey),
  }));

  const pickRarity = (id: string) => {
    setRarity(id);
    const r = RARITY_PRESETS.find((p) => p.id === id);
    if (r) {
      setSpacing(r.spacing);
      setSeparation(r.separation);
    }
  };
  const toggleBiome = (b: string) => setPicked(picked.includes(b) ? picked.filter((x) => x !== b) : [...picked, b]);
  const toggleAllBiomes = () => setPicked(picked.length === modBiomes.length ? [] : modBiomes);

  return (
    <div className="export-config">
      <p className="export-subtitle">{t('export.subtitle', { workspace: workspaceName })}</p>

      <label className="export-field">
        <span className="export-label">{t('export.nameLabel')}</span>
        <input
          className="export-name-input"
          value={name}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <span className="export-hint">{t('export.nameHint', { id: `${namespace}:${resourceName}` })}</span>
      </label>

      <div className="export-field export-switch-row">
        <span className="export-switch-text">
          <span className="export-label">{t('export.worldgenToggle')}</span>
          <span className="export-hint">
            {forceWorldgen ? t('export.worldgenForced') : effectiveGenerate ? t('export.worldgenOn') : t('export.worldgenOff')}
          </span>
        </span>
        <Switch checked={effectiveGenerate} onChange={setGenerate} disabled={forceWorldgen} ariaLabel={t('export.worldgenToggle')} />
      </div>

      {effectiveGenerate && (
        <div className="export-worldgen">
          <label className="export-field">
            <span className="export-label">{t('export.terrainLabel')}</span>
            <Select value={terrain} options={terrainOptions} onChange={(v) => setTerrain(v as TerrainAdaptation)} />
            <TerrainPreview size={structureSize} adaptation={terrain} t={t} />
          </label>
          <BiomePicker
            source={biomeSource}
            onSource={setBiomeSource}
            modBiomes={modBiomes}
            picked={picked}
            onToggle={toggleBiome}
            onToggleAll={toggleAllBiomes}
            preset={preset}
            onPreset={setPreset}
            presetOptions={biomeOptions}
            t={t}
          />
          <label className="export-field">
            <span className="export-label">{t('export.rarityLabel')}</span>
            <Select value={rarity} options={rarityOptions} onChange={pickRarity} />
          </label>
          {rarity === 'custom' && (
            <div className="export-grid-steppers">
              <label className="export-stepper">
                <span className="export-label">{t('export.spacingLabel')}</span>
                <Stepper value={spacing} min={SPACING_MIN} max={SPACING_MAX} onChange={setSpacing} ariaLabel={t('export.spacingLabel')} />
              </label>
              <label className="export-stepper">
                <span className="export-label">{t('export.separationLabel')}</span>
                <Stepper value={separation} min={0} max={SPACING_MAX} onChange={setSeparation} ariaLabel={t('export.separationLabel')} />
              </label>
            </div>
          )}
          <p className="export-hint export-grid-hint">{t('export.gridHint', { spacing, separation })}</p>
        </div>
      )}
    </div>
  );
}
