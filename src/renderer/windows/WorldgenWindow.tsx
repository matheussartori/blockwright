// The Worldgen Studio panel: schema-validated forms over the worldgen JSON files
// the export writes (structure def / structure_set / template_pool / biome tag),
// side by side with the Jigsaw Lab — edit, Save, then re-simulate to see the
// effect in 3D without launching the game. Main does the surgical read/write
// (worldgen-studio.ts); this panel owns the draft and gates Save on the shared
// pure validation (shared/domain/worldgen-studio.ts).
import { useEffect, useMemo, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import type { WorldgenModel } from '@/shared/types';
import type { MessageKey } from '@/shared/i18n';
import { BIOME_PRESETS, TERRAIN_ADAPTATIONS, type TerrainAdaptation } from '@/shared/domain/worldgen';
import { validateStudioModel, DISTANCE_MAX, SIZE_MAX, SIZE_MIN } from '@/shared/domain/worldgen-studio';
import { api } from '../api';
import { useApp, useActiveDoc, useT } from '../hooks/useStores';
import { store } from '../state/store';
import { Select, type SelectOption } from '../components/ui/Select';
import { Stepper } from '../components/ui/Stepper';
import { basename } from '../ui/path';

/** A biome id without its namespace, for compact chips. */
const bare = (id: string): string => (id.includes(':') ? id.slice(id.indexOf(':') + 1) : id);

export function WorldgenContent() {
  const t = useT();
  const workspace = useApp((s) => s.workspace);
  const structure = useActiveDoc()?.structure ?? null;

  const [defs, setDefs] = useState<string[]>([]);
  const [name, setName] = useState<string | null>(null);
  const [model, setModel] = useState<WorldgenModel | null>(null);
  const [modBiomes, setModBiomes] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // The workspace's editable defs; default to the one matching the open file.
  useEffect(() => {
    setDefs([]);
    setName(null);
    if (!workspace) return;
    let stale = false;
    void api.worldgenDefs().then((list) => {
      if (stale) return;
      setDefs(list);
      const open = structure ? basename(structure.path).replace(/\.nbt$/i, '') : null;
      setName(open && list.includes(open) ? open : list[0] ?? null);
    });
    void api.listWorkspaceBiomes().then((biomes) => {
      if (!stale) setModBiomes(biomes ?? []);
    });
    return () => {
      stale = true;
    };
    // structure?.path only picks the DEFAULT selection — don't reload on tab switches.
  }, [workspace?.root]);

  // Load the selected def's model.
  useEffect(() => {
    setModel(null);
    setDirty(false);
    setSaved(false);
    setSaveError(null);
    if (!name) return;
    let stale = false;
    void api.worldgenRead(name).then((m) => {
      if (!stale) setModel(m);
    });
    return () => {
      stale = true;
    };
  }, [name, workspace?.root]);

  const issues = useMemo(() => (model ? validateStudioModel(model) : []), [model]);
  const hasErrors = issues.some((i) => i.level === 'error');

  const defOptions: SelectOption[] = defs.map((d) => ({ value: d, label: d }));
  const terrainOptions: SelectOption[] = TERRAIN_ADAPTATIONS.map((id) => ({
    value: id,
    label: t(`export.terrain.${id}` as MessageKey),
  }));
  // Add-biome choices: the mod's own + every vanilla-preset biome, minus picked.
  const biomeChoices: SelectOption[] = useMemo(() => {
    if (!model) return [];
    const all = [...new Set([...modBiomes, ...BIOME_PRESETS.flatMap((p) => p.biomes)])].sort();
    return all.filter((b) => !model.biomes.includes(b)).map((b) => ({ value: b, label: bare(b), title: b }));
  }, [model, modBiomes]);

  if (!workspace) return null;

  const patch = (p: Partial<WorldgenModel>) => {
    if (!model) return;
    setModel({ ...model, ...p });
    setDirty(true);
    setSaved(false);
  };

  const save = async () => {
    if (!model || hasErrors) return;
    setBusy(true);
    setSaveError(null);
    try {
      const result = await api.worldgenWrite(model);
      if (result.ok) {
        setDirty(false);
        setSaved(true);
        store.getState().bumpWorldgenRev(); // the Jigsaw Lab re-reads pools from disk
      } else {
        setSaveError(result.error);
      }
    } finally {
      setBusy(false);
    }
  };

  if (defs.length === 0) return <p className="bw-note">{t('studio.noDefs')}</p>;

  return (
    <>
      <label className="bw-field bw-field-block">
        {t('studio.def')}
        <Select value={name ?? ''} options={defOptions} onChange={(v) => setName(v)} ariaLabel={t('studio.def')} />
      </label>

      {!model ? (
        <p className="bw-note">{t('studio.loading')}</p>
      ) : (
        <>
          <div className="bw-section">{t('studio.structureSection')}</div>
          <label className="bw-field bw-field-block">
            {t('studio.terrain')}
            <Select
              value={model.terrainAdaptation}
              options={terrainOptions}
              onChange={(v) => patch({ terrainAdaptation: v as TerrainAdaptation })}
              ariaLabel={t('studio.terrain')}
            />
          </label>
          <div className="studio-row">
            <label className="bw-field">
              {t('studio.size')}
              <Stepper value={model.size} min={SIZE_MIN} max={SIZE_MAX} onChange={(v) => patch({ size: v })} size="sm" ariaLabel={t('studio.size')} />
            </label>
            <label className="bw-field">
              {t('studio.maxDistance')}
              <Stepper
                value={model.maxDistance}
                min={1}
                max={DISTANCE_MAX}
                onChange={(v) => patch({ maxDistance: v })}
                size="sm"
                ariaLabel={t('studio.maxDistance')}
              />
            </label>
          </div>

          {model.set && (
            <>
              <div className="bw-section">{t('studio.placementSection')}</div>
              <div className="studio-row">
                <label className="bw-field">
                  {t('studio.spacing')}
                  <Stepper
                    value={model.set.spacing}
                    min={1}
                    max={256}
                    onChange={(v) => patch({ set: { ...model.set!, spacing: v } })}
                    size="sm"
                    ariaLabel={t('studio.spacing')}
                  />
                </label>
                <label className="bw-field">
                  {t('studio.separation')}
                  <Stepper
                    value={model.set.separation}
                    min={0}
                    max={256}
                    onChange={(v) => patch({ set: { ...model.set!, separation: v } })}
                    size="sm"
                    ariaLabel={t('studio.separation')}
                  />
                </label>
              </div>
            </>
          )}

          <div className="bw-section">{t('studio.biomesSection')}</div>
          <div className="studio-chips">
            {model.biomes.map((b) => (
              <button
                key={b}
                type="button"
                className="studio-chip"
                title={t('studio.removeBiome', { biome: b })}
                onClick={() => patch({ biomes: model.biomes.filter((x) => x !== b) })}
              >
                {bare(b)} ×
              </button>
            ))}
          </div>
          <Select
            value=""
            options={biomeChoices}
            onChange={(v) => patch({ biomes: [...model.biomes, v] })}
            placeholder={t('studio.addBiome')}
            searchable
            ariaLabel={t('studio.addBiome')}
          />

          {model.pool && (
            <>
              <div className="bw-section">
                {t('studio.poolSection')} <span className="bw-count">{model.pool.elements.length}</span>
              </div>
              <ul className="bw-rows">
                {model.pool.elements.map((el, i) => (
                  <li key={el.index} className="bw-row static">
                    <span className="bw-row-name" title={el.location}>{bare(el.location)}</span>
                    <span className="bw-row-tag">
                      <Stepper
                        value={el.weight}
                        min={1}
                        max={150}
                        onChange={(v) => {
                          const elements = model.pool!.elements.map((e, j) => (j === i ? { ...e, weight: v } : e));
                          patch({ pool: { ...model.pool!, elements } });
                        }}
                        size="sm"
                        ariaLabel={t('studio.weight', { piece: el.location })}
                      />
                    </span>
                  </li>
                ))}
              </ul>
              <label className="bw-field bw-field-block">
                {t('studio.fallback')}
                <input
                  type="text"
                  value={model.pool.fallback}
                  onChange={(e) => patch({ pool: { ...model.pool!, fallback: e.target.value } })}
                />
              </label>
            </>
          )}

          {issues.length > 0 && (
            <ul className="bw-warn-list">
              {issues.map((i, k) => (
                <li key={k} className="bw-warn">
                  <TriangleAlert size={12} /> {t(`studio.issue.${i.code}` as MessageKey, { detail: i.detail ?? '' })}
                </li>
              ))}
            </ul>
          )}

          <div className="bw-controls studio-save">
            <button
              className="btn primary sm grow"
              type="button"
              disabled={!dirty || hasErrors || busy}
              onClick={() => void save()}
            >
              {busy ? t('studio.saving') : t('studio.save')}
            </button>
          </div>
          {saved && <div className="bw-ok">{t('studio.savedHint')}</div>}
          {saveError && <p className="bw-warn">{t('studio.saveFailed', { error: saveError })}</p>}
        </>
      )}
    </>
  );
}
