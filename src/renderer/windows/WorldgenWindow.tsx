// The Worldgen Studio panel: schema-validated forms over the worldgen JSON files
// the export writes (structure def / structure_set / template_pool / biome tag),
// side by side with the Jigsaw Lab — edit, Save, then re-simulate to see the
// effect in 3D without launching the game. Main does the surgical read/write
// (worldgen-studio.ts); this panel owns the draft and gates Save on the shared
// pure validation (shared/domain/worldgen-studio.ts).
//
// It reads as a spec sheet rather than a settings form: each section IS one file
// on disk (its path sits in the section header), every number carries the plain
// consequence of changing it, and the two abstractions nobody holds in their head
// — terrain adaptation and spacing/separation — are drawn, live, as diagrams.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { RotateCcw, TriangleAlert, X } from 'lucide-react';
import type { WorldgenModel } from '@/shared/types';
import type { MessageKey } from '@/shared/i18n';
import { BIOME_PRESETS, TERRAIN_ADAPTATIONS, type TerrainAdaptation } from '@/shared/domain/worldgen';
import { validateStudioModel, DISTANCE_MAX, SIZE_MAX, SIZE_MIN } from '@/shared/domain/worldgen-studio';
import { api } from '../api';
import { useApp, useActiveDoc, useT } from '../hooks/useStores';
import { store } from '../state/store';
import { Select, type SelectOption } from '../components/ui/Select';
import { Stepper } from '../components/ui/Stepper';
import { TerrainPreview } from '../components/export/TerrainPreview';
import { PlacementMap } from '../components/worldgen/PlacementMap';
import { basename } from '../ui/path';

/** A biome id without its namespace, for compact chips. */
const bare = (id: string): string => (id.includes(':') ? id.slice(id.indexOf(':') + 1) : id);
const namespaceOf = (id: string): string => (id.includes(':') ? id.slice(0, id.indexOf(':')) : 'minecraft');

/** Stand-in proportions for the terrain diagram when the def's own file isn't open. */
const NOMINAL_SIZE: [number, number, number] = [16, 11, 16];

/** The folder a worldgen file sits in — `structure`, `structure_set`, the pool's own
 *  directory. Every file here is named after the def, so the folder is the part that
 *  actually tells the sections apart; the full path rides along in the tooltip. */
const folderOf = (file: string): string => basename(file.replace(/[\\/][^\\/]*$/, ''));

/** A section header that names the file it edits — the panel's unit of work is a file.
 *  `note` stands in when a section has no single file of its own (inline biomes). */
function Section({ label, file, note, count }: { label: string; file?: string; note?: string; count?: number }) {
  return (
    <div className="studio-head">
      <span className="studio-head-label">{label}</span>
      {count !== undefined && <span className="studio-head-count">{count}</span>}
      {file ? (
        <span className="studio-head-file" title={file}>
          {folderOf(file)}/
        </span>
      ) : (
        note && <span className="studio-head-file">{note}</span>
      )}
    </div>
  );
}

/** One labelled number: name + why it matters on the left, stepper on the right. */
function NumberRow({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <label className="studio-num">
      <span className="studio-num-text">
        <span className="studio-num-label">{label}</span>
        <span className="studio-num-hint">{hint}</span>
      </span>
      {children}
    </label>
  );
}

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
  // Bumped by Revert to re-run the load effect against the same def.
  const [reloads, setReloads] = useState(0);

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
  }, [name, workspace?.root, reloads]);

  const issues = useMemo(() => (model ? validateStudioModel(model) : []), [model]);
  const hasErrors = issues.some((i) => i.level === 'error');

  const defOptions: SelectOption[] = defs.map((d) => ({ value: d, label: d }));
  const terrainOptions: SelectOption[] = TERRAIN_ADAPTATIONS.map((id) => ({
    value: id,
    label: t(`export.terrain.${id}` as MessageKey),
    description: t(`export.terrain.${id}Desc` as MessageKey),
  }));
  // Add-biome choices: the mod's own + every vanilla-preset biome, minus picked.
  const biomeChoices: SelectOption[] = useMemo(() => {
    if (!model) return [];
    const all = [...new Set([...modBiomes, ...BIOME_PRESETS.flatMap((p) => p.biomes)])].sort();
    return all.filter((b) => !model.biomes.includes(b)).map((b) => ({ value: b, label: bare(b), title: b }));
  }, [model, modBiomes]);

  // Pool weights are a weighted draw, so show each piece's real share of the roll —
  // but only once there's an actual contest to show.
  const poolTotal = model?.pool?.elements.reduce((sum, el) => sum + Math.max(0, el.weight), 0) ?? 0;
  const weighted = (model?.pool?.elements.length ?? 0) > 1;

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

  // The terrain diagram is proportional; use the open build's real footprint when the
  // selected def is the file on screen, otherwise a neutral house-sized box.
  const openMatches = structure && basename(structure.path).replace(/\.nbt$/i, '') === name;
  const terrainSize: [number, number, number] = openMatches ? structure.size : NOMINAL_SIZE;

  return (
    <div className="studio">
      <label className="studio-def">
        <span className="studio-def-label">{t('studio.def')}</span>
        <Select value={name ?? ''} options={defOptions} onChange={(v) => setName(v)} ariaLabel={t('studio.def')} />
      </label>

      {!model ? (
        <p className="bw-note">{t('studio.loading')}</p>
      ) : (
        <>
          <Section label={t('studio.structureSection')} file={model.file} />
          <label className="studio-field">
            <span className="studio-num-label">{t('studio.terrain')}</span>
            <Select
              value={model.terrainAdaptation}
              options={terrainOptions}
              onChange={(v) => patch({ terrainAdaptation: v as TerrainAdaptation })}
              ariaLabel={t('studio.terrain')}
            />
          </label>
          <TerrainPreview size={terrainSize} adaptation={model.terrainAdaptation} t={t} />

          <NumberRow label={t('studio.size')} hint={t('studio.sizeHint')}>
            <Stepper value={model.size} min={SIZE_MIN} max={SIZE_MAX} onChange={(v) => patch({ size: v })} size="sm" ariaLabel={t('studio.size')} />
          </NumberRow>
          <NumberRow label={t('studio.maxDistance')} hint={t('studio.maxDistanceHint')}>
            <Stepper
              value={model.maxDistance}
              min={1}
              max={DISTANCE_MAX}
              onChange={(v) => patch({ maxDistance: v })}
              size="sm"
              ariaLabel={t('studio.maxDistance')}
            />
          </NumberRow>

          {model.set && (
            <>
              <Section label={t('studio.placementSection')} file={model.set.file} />
              <PlacementMap spacing={model.set.spacing} separation={model.set.separation} t={t} />
              <NumberRow label={t('studio.spacing')} hint={t('studio.spacingHint')}>
                <Stepper
                  value={model.set.spacing}
                  min={1}
                  max={256}
                  onChange={(v) => patch({ set: { ...model.set!, spacing: v } })}
                  size="sm"
                  ariaLabel={t('studio.spacing')}
                />
              </NumberRow>
              <NumberRow label={t('studio.separation')} hint={t('studio.separationHint')}>
                <Stepper
                  value={model.set.separation}
                  min={0}
                  max={256}
                  onChange={(v) => patch({ set: { ...model.set!, separation: v } })}
                  size="sm"
                  ariaLabel={t('studio.separation')}
                />
              </NumberRow>
            </>
          )}

          <Section
            label={t('studio.biomesSection')}
            count={model.biomes.length}
            note={model.biomesInline ? t('studio.biomesInline') : t('studio.biomesTag')}
          />
          {model.biomes.length === 0 ? (
            <p className="bw-note">{t('studio.biomesEmpty')}</p>
          ) : (
            <ul className="studio-chips">
              {model.biomes.map((b) => (
                <li key={b} className={`studio-chip${namespaceOf(b) === workspace.namespace ? ' own' : ''}`} title={b}>
                  <span className="studio-chip-text">{bare(b)}</span>
                  <button
                    type="button"
                    className="studio-chip-x"
                    title={t('studio.removeBiome', { biome: b })}
                    aria-label={t('studio.removeBiome', { biome: b })}
                    onClick={() => patch({ biomes: model.biomes.filter((x) => x !== b) })}
                  >
                    <X size={11} strokeWidth={2.4} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
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
              <Section label={t('studio.poolSection')} file={model.pool.file} count={model.pool.elements.length} />
              <ul className="studio-pool">
                {model.pool.elements.map((el, i) => {
                  const share = poolTotal > 0 ? Math.max(0, el.weight) / poolTotal : 0;
                  return (
                    <li key={el.index} className="studio-piece">
                      <span className="studio-piece-name" title={el.location}>
                        {bare(el.location)}
                      </span>
                      {/* A lone piece always wins the draw — its share says nothing. */}
                      {weighted && (
                        <span className="studio-piece-share">{t('studio.share', { percent: (share * 100).toFixed(0) })}</span>
                      )}
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
                      {weighted && (
                        <span className="studio-piece-bar" aria-hidden>
                          <span className="studio-piece-fill" style={{ width: `${share * 100}%` }} />
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <label className="studio-field">
                <span className="studio-num-label">{t('studio.fallback')}</span>
                <input
                  type="text"
                  className="studio-input"
                  spellCheck={false}
                  value={model.pool.fallback}
                  onChange={(e) => patch({ pool: { ...model.pool!, fallback: e.target.value } })}
                />
                <span className="studio-num-hint">{t('studio.fallbackHint')}</span>
              </label>
            </>
          )}

          {issues.length > 0 && (
            <ul className="bw-warn-list studio-issues">
              {issues.map((i, k) => (
                <li key={k} className="bw-warn">
                  <TriangleAlert size={12} /> {t(`studio.issue.${i.code}` as MessageKey, { detail: i.detail ?? '' })}
                </li>
              ))}
            </ul>
          )}

          <div className={`studio-save${dirty ? ' dirty' : ''}`}>
            <p className="studio-save-status">
              {hasErrors
                ? t('studio.saveBlocked')
                : dirty
                  ? t('studio.unsaved')
                  : saved
                    ? t('studio.savedHint')
                    : t('studio.inSync')}
            </p>
            <div className="studio-save-row">
              <button
                type="button"
                className="btn sm"
                disabled={!dirty || busy}
                title={t('studio.revert')}
                onClick={() => setReloads((n) => n + 1)}
              >
                <RotateCcw size={12} strokeWidth={2} aria-hidden /> {t('studio.revert')}
              </button>
              <button
                className="btn primary sm grow"
                type="button"
                disabled={!dirty || hasErrors || busy}
                onClick={() => void save()}
              >
                {busy ? t('studio.saving') : t('studio.save')}
              </button>
            </div>
          </div>
          {saveError && <p className="bw-warn">{t('studio.saveFailed', { error: saveError })}</p>}
        </>
      )}
    </div>
  );
}
