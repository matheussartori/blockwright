// "Export to mod": writes a generated structure into the active workspace's data pack —
// the `.nbt` in the version-correct structure folder, plus the four worldgen JSON files
// that make Minecraft actually spawn it. Aimed at a mod dev mid-iteration: name it, say
// where/how often it spawns in plain terms, SEE the exact files before committing, and
// catch the silent killers (separation ≥ spacing, no biome match, the 1.21 folder rename)
// as inline checks. Main computes the file list + problems (planWorkspaceExport) so the
// preview here and the writes can't drift; this is a thin view over that plan.
import { useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, FileBox, FileJson, FolderTree, TriangleAlert, XCircle } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Segmented } from './ui/Segmented';
import { Select, type SelectOption } from './ui/Select';
import { Stepper } from './ui/Stepper';
import { api } from '../api';
import { useApp, useT } from '../hooks/useStores';
import { store } from '../state/store';
import { basename, dirname } from '../ui/path';
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
import type { MessageKey } from '@/shared/i18n';
import type { WorkspaceExportPlan, WorkspaceExportResult } from '@/shared/types';

/** The biome presets offered, in display order (no free-text editor in this pass). */
const BIOME_IDS = BIOME_PRESETS.map((p) => p.id);

export function ExportModal() {
  const t = useT();
  const target = useApp((s) => s.exportTarget);
  const workspace = useApp((s) => s.workspace);
  const open = target !== null;

  // The form's working state. Seeded from the defaults each time the dialog opens, so a
  // second export doesn't inherit the last run's tweaks.
  const [name, setName] = useState('');
  const [generate, setGenerate] = useState(DEFAULT_WORLDGEN.generate);
  const [terrain, setTerrain] = useState<TerrainAdaptation>(DEFAULT_WORLDGEN.terrainAdaptation);
  const [biomePreset, setBiomePreset] = useState(BIOME_IDS[0]);
  const [rarity, setRarity] = useState('uncommon');
  const [spacing, setSpacing] = useState(DEFAULT_WORLDGEN.spacing);
  const [separation, setSeparation] = useState(DEFAULT_WORLDGEN.separation);
  const [plan, setPlan] = useState<WorkspaceExportPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WorkspaceExportResult | null>(null);
  // The mod's own biomes (read from the workspace) + which the user picked, plus whether
  // the biome source is the mod's biomes or a vanilla bundle.
  const [modBiomes, setModBiomes] = useState<string[]>([]);
  const [pickedModBiomes, setPickedModBiomes] = useState<string[]>([]);
  const [biomeSource, setBiomeSource] = useState<'mod' | 'vanilla'>('vanilla');

  // Reset to a clean slate whenever a new structure is targeted; read the mod's biomes so
  // the picker can offer them (defaulting to all of them — a mod build usually belongs in
  // the mod's biomes, not vanilla ones).
  useEffect(() => {
    if (!target) return;
    setName(target.name);
    setGenerate(DEFAULT_WORLDGEN.generate);
    setTerrain(DEFAULT_WORLDGEN.terrainAdaptation);
    setBiomePreset(BIOME_IDS[0]);
    setRarity('uncommon');
    setSpacing(DEFAULT_WORLDGEN.spacing);
    setSeparation(DEFAULT_WORLDGEN.separation);
    setResult(null);
    setPlan(null);
    let stale = false;
    void api.listWorkspaceBiomes().then((biomes) => {
      if (stale) return;
      setModBiomes(biomes);
      setPickedModBiomes(biomes);
      setBiomeSource(biomes.length > 0 ? 'mod' : 'vanilla');
    });
    return () => {
      stale = true;
    };
  }, [target]);

  // The sanitized resource id everything keys off (the field stays free-typed; we always
  // export a legal name, so the user can't fat-finger an invalid id).
  const resourceName = useMemo(() => sanitizeResourceName(name), [name]);

  const worldgen: WorldgenOptions = useMemo(
    () => ({
      generate,
      terrainAdaptation: terrain,
      biomes:
        biomeSource === 'mod' ? pickedModBiomes : (BIOME_PRESETS.find((p) => p.id === biomePreset)?.biomes ?? []),
      spacing,
      separation,
    }),
    [generate, terrain, biomeSource, pickedModBiomes, biomePreset, spacing, separation],
  );

  // Ask main for the live plan (files + problems) as the options change. Last-write-wins.
  useEffect(() => {
    if (!open || !target || !workspace) return;
    let stale = false;
    void api.planWorkspaceExport({ sourcePath: target.path, name: resourceName, worldgen }).then((p) => {
      if (!stale) setPlan(p);
    });
    return () => {
      stale = true;
    };
  }, [open, target, workspace, resourceName, worldgen]);

  const close = () => store.getState().setExportTarget(null);

  // Drop the `data/<ns>/` prefix so the file rows read as the path INSIDE the data pack
  // (and the otherwise-identical `<name>.json` files become distinct by their folder).
  const shortRel = (rel: string) => (workspace ? rel.replace(`data/${workspace.namespace}/`, '') : rel);

  const errors = plan?.issues.filter((i) => i.level === 'error') ?? [];
  // Overwrite warnings are already shown per-file as a REPLACE badge, so only the
  // non-redundant warnings (e.g. the legacy-folder note) belong in the checks list.
  const warnings = plan?.issues.filter((i) => i.level === 'warning' && i.code !== 'overwrite') ?? [];
  const canExport = !!workspace && !!target && errors.length === 0 && !busy;

  const doExport = async () => {
    if (!target || !canExport) return;
    setBusy(true);
    const res = await api.exportToWorkspace({ sourcePath: target.path, name: resourceName, worldgen });
    setBusy(false);
    setResult(res);
    if (res.ok) {
      // The new file should show on the welcome screen's workspace list immediately.
      void api.listWorkspaceStructures().then((paths) => store.getState().setWorkspaceStructures(paths));
    }
  };

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
    const preset = RARITY_PRESETS.find((r) => r.id === id);
    if (preset) {
      setSpacing(preset.spacing);
      setSeparation(preset.separation);
    }
  };

  const footer = result?.ok ? (
    <>
      {result.revealPath && (
        <button className="btn ghost no-drag" onClick={() => void api.revealPath(result.revealPath!)}>
          {t('export.reveal')}
        </button>
      )}
      <button className="btn primary no-drag" onClick={close}>
        {t('export.close')}
      </button>
    </>
  ) : (
    <>
      <button className="btn ghost no-drag" onClick={close}>
        {t('export.cancel')}
      </button>
      <button className="btn primary no-drag" disabled={!canExport} onClick={() => void doExport()}>
        {busy ? t('export.confirmBusy') : t('export.confirm')}
      </button>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('export.title')}
      className="modal-lg export-modal"
      footer={workspace ? footer : undefined}
    >
      {!workspace ? (
        <div className="export-empty">
          <FolderTree size={32} strokeWidth={1.5} aria-hidden />
          <h3>{t('export.noWorkspaceTitle')}</h3>
          <p>{t('export.noWorkspaceBody', { ns: '<namespace>' })}</p>
          <button className="btn primary no-drag" onClick={() => void api.openWorkspace()}>
            {t('export.openWorkspace')}
          </button>
        </div>
      ) : result?.ok ? (
        <div className="export-success">
          <CheckCircle2 size={32} strokeWidth={1.6} aria-hidden />
          <h3>{t('export.successTitle', { workspace: workspace.name })}</h3>
          <p>{t('export.successBody', { count: result.written.length })}</p>
          <ul className="export-file-tree">
            {result.written.map((rel) => (
              <li key={rel} className="export-file" title={shortRel(rel)}>
                <CheckCircle2 size={15} strokeWidth={1.9} aria-hidden className="export-file-ok" />
                <span className="export-file-main">
                  <code className="export-file-name">{basename(rel)}</code>
                  <span className="export-file-dir">{dirname(shortRel(rel))}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="export-grid">
          {/* LEFT: the decisions. */}
          <div className="export-config">
            <p className="export-subtitle">{t('export.subtitle', { workspace: workspace.name })}</p>

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
              <span className="export-hint">
                {t('export.nameHint', { id: `${workspace.namespace}:${resourceName}` })}
              </span>
            </label>

            <div className="export-field export-switch-row">
              <span className="export-switch-text">
                <span className="export-label">{t('export.worldgenToggle')}</span>
                <span className="export-hint">{generate ? t('export.worldgenOn') : t('export.worldgenOff')}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={generate}
                aria-label={t('export.worldgenToggle')}
                className={`export-switch no-drag${generate ? ' on' : ''}`}
                onClick={() => setGenerate(!generate)}
              >
                <span className="export-switch-knob" />
              </button>
            </div>

            {generate && (
              <div className="export-worldgen">
                <label className="export-field">
                  <span className="export-label">{t('export.terrainLabel')}</span>
                  <Select value={terrain} options={terrainOptions} onChange={(v) => setTerrain(v as TerrainAdaptation)} />
                </label>
                <div className="export-field">
                  <span className="export-label">{t('export.biomesLabel')}</span>
                  {modBiomes.length > 0 && (
                    <Segmented
                      value={biomeSource}
                      ariaLabel={t('export.biomesLabel')}
                      onChange={(v) => setBiomeSource(v as 'mod' | 'vanilla')}
                      options={[
                        { value: 'mod', label: t('export.biomeSourceMod') },
                        { value: 'vanilla', label: t('export.biomeSourceVanilla') },
                      ]}
                    />
                  )}
                  {biomeSource === 'mod' && modBiomes.length > 0 ? (
                    <>
                      <div className="export-biome-list" role="group" aria-label={t('export.biomesLabel')}>
                        {modBiomes.map((b) => {
                          const on = pickedModBiomes.includes(b);
                          return (
                            <button
                              key={b}
                              type="button"
                              role="checkbox"
                              aria-checked={on}
                              title={b}
                              className={`export-biome-chip no-drag${on ? ' on' : ''}`}
                              onClick={() =>
                                setPickedModBiomes(on ? pickedModBiomes.filter((x) => x !== b) : [...pickedModBiomes, b])
                              }
                            >
                              {on && <Check size={12} strokeWidth={2.6} aria-hidden />}
                              <span>{b.includes(':') ? b.slice(b.indexOf(':') + 1) : b}</span>
                            </button>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        className="export-biome-all no-drag"
                        onClick={() => setPickedModBiomes(pickedModBiomes.length === modBiomes.length ? [] : modBiomes)}
                      >
                        {pickedModBiomes.length === modBiomes.length ? t('export.biomeClear') : t('export.biomeAll')}
                      </button>
                    </>
                  ) : (
                    <Select value={biomePreset} options={biomeOptions} onChange={setBiomePreset} />
                  )}
                </div>
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

          {/* RIGHT: what it will actually do — the file tree + the checks. */}
          <div className="export-preview">
            <div className="export-preview-head">
              <FolderTree size={15} strokeWidth={1.9} aria-hidden />
              <span>{t('export.filesLabel')}</span>
            </div>
            <ul className="export-file-tree">
              {(plan?.files ?? []).map((f) => (
                <li key={f.rel} className="export-file" title={shortRel(f.rel)}>
                  {f.kind === 'nbt' ? (
                    <FileBox size={16} strokeWidth={1.7} aria-hidden />
                  ) : (
                    <FileJson size={16} strokeWidth={1.7} aria-hidden />
                  )}
                  <span className="export-file-main">
                    <code className="export-file-name">{basename(f.rel)}</code>
                    <span className="export-file-dir">{dirname(shortRel(f.rel))}</span>
                  </span>
                  <span className={`export-file-badge${f.exists ? ' replace' : ''}`}>
                    {f.exists ? t('export.fileReplace') : t('export.fileNew')}
                  </span>
                </li>
              ))}
            </ul>

            {/* The checks footer, pinned to the bottom of the card: problems if any,
                else a calm "ready" confirmation so the panel always resolves. */}
            <div className="export-checks">
              {errors.map((iss, i) => (
                <p key={`e${i}`} className="export-issue error">
                  <XCircle size={14} strokeWidth={2} aria-hidden />
                  <span>{t(`export.issue.${iss.code}` as MessageKey, iss.detail ? { detail: iss.detail } : undefined)}</span>
                </p>
              ))}
              {warnings.map((iss, i) => (
                <p key={`w${i}`} className="export-issue warning">
                  <TriangleAlert size={14} strokeWidth={2} aria-hidden />
                  <span>{t(`export.issue.${iss.code}` as MessageKey, iss.detail ? { detail: iss.detail } : undefined)}</span>
                </p>
              ))}
              {result && !result.ok && (
                <p className="export-issue error">
                  <XCircle size={14} strokeWidth={2} aria-hidden />
                  <span>{t('export.failed', { detail: result.detail ?? '' })}</span>
                </p>
              )}
              {errors.length === 0 && (plan?.files.length ?? 0) > 0 && (
                <p className="export-issue ok">
                  <CheckCircle2 size={14} strokeWidth={2} aria-hidden />
                  <span>{t('export.ready', { count: plan?.files.length ?? 0 })}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
