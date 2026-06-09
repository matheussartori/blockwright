// The Module Gallery: a composition BLUEPRINT rather than a flat catalog. The old
// screen flattened every module under category pills, which hid the one thing that
// actually matters here — how the modules COMPOSE. So the gallery is now host-first:
// pick a STRUCTURE (house/modern/…) on the left, and the right pane reads as an
// assembly sequence of the parts that link into it, in build order (roof → basement
// → rooms → decoration), joined by a connector spine. A part links via its
// `appliesTo`, so switching the host re-filters what's shown (a structure with
// nothing wired yet reads as "nothing links here yet"); the decoration stage is
// UNIVERSAL (no `appliesTo`) and marked as fitting any structure. Clicking a part
// expands its detail (description, applies-to, and — for rooms — the FURNISHING
// PRESETS) inline under its stage. Previews are image placeholders — drop
// `previews/<category>-<id>.png` in public/ to fill them (see `modulePreviewSrc`).
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { store } from '../state/store';
import { useApp, useT } from '../hooks/useStores';
import { moduleAppliesTo } from '@/shared/domain/applies-to';
import { modulesConflict } from '@/shared/domain/conflicts';
import type { GenerationCatalog, GenerationModule, ModuleCategory } from '@/shared/types';
import type { MessageKey } from '@/shared/i18n';
import { Modal } from './ui/Modal';
import { PreviewFrame, modulePreviewSrc } from './ui/PreviewFrame';

type T = ReturnType<typeof useT>;

/** i18n key for a furnishing-preset space tier chip. */
const SCALE_LABEL: Record<string, MessageKey> = {
  snug: 'modules.scaleSnug',
  standard: 'modules.scaleStandard',
  grand: 'modules.scaleGrand',
};

/** The composition stages, in build ORDER — a host structure is capped by a roof,
 *  dug under by a basement, partitioned into rooms, then skinned by a decoration.
 *  The decoration carries no `appliesTo`, so it's UNIVERSAL (fits any structure). */
const STAGES: { category: ModuleCategory; label: MessageKey; role: MessageKey; universal?: boolean }[] = [
  { category: 'roof', label: 'modules.catRoof', role: 'modules.roleRoof' },
  { category: 'attic', label: 'modules.catAttic', role: 'modules.roleAttic' },
  { category: 'basement', label: 'modules.catBasement', role: 'modules.roleBasement' },
  { category: 'room', label: 'modules.catRoom', role: 'modules.roleRoom' },
  { category: 'decoration', label: 'modules.catDecoration', role: 'modules.roleDecoration', universal: true },
];

/** Count the parts that link to a host (exclude the universal decoration stage).
 *  Resolves the host's GROUP so a group-shared module is counted too. */
function linkedParts(catalog: GenerationCatalog, host: GenerationModule): number {
  return STAGES.filter((s) => !s.universal).reduce(
    (n, s) => n + (catalog[s.category] ?? []).filter((m) => moduleAppliesTo(m.appliesTo, host.id, host.group)).length,
    0,
  );
}

export function ModulesModal() {
  const t = useT();
  const open = useApp((s) => s.modulesOpen);

  const [catalog, setCatalog] = useState<GenerationCatalog | null>(null);
  const [structureId, setStructureId] = useState<string | null>(null);
  // `${category}:${id}` of the expanded part, or null. Reset when the host changes.
  const [openKey, setOpenKey] = useState<string | null>(null);

  const close = () => store.getState().setModulesOpen(false);

  // Load the registry once the gallery opens.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void api.generationCatalog().then((c) => {
      if (alive) setCatalog(c);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  const structures: GenerationModule[] = useMemo(() => catalog?.structure ?? [], [catalog]);
  const structure = useMemo(
    () => structures.find((s) => s.id === structureId) ?? structures[0] ?? null,
    [structures, structureId],
  );

  // Default the host to the first structure once the catalog arrives.
  useEffect(() => {
    setStructureId(structures[0]?.id ?? null);
  }, [structures]);

  // Collapse any open part detail when the host changes.
  useEffect(() => {
    setOpenKey(null);
  }, [structure?.id]);

  const stages = useMemo(() => {
    if (!catalog || !structure) return [];
    return STAGES.map((s) => ({
      ...s,
      modules: (catalog[s.category] ?? []).filter((m) =>
        s.universal ? true : moduleAppliesTo(m.appliesTo, structure.id, structure.group),
      ),
    }));
  }, [catalog, structure]);

  const partsCount = catalog && structure ? linkedParts(catalog, structure) : 0;

  // The part the user is focused on (its detail expanded). When it declares a conflict
  // (e.g. the flat roof vs an attic), sibling parts in other stages that clash with it are
  // dimmed with a reason note — so the gallery SHOWS incompatibility, not just compatibility.
  const focusedModule = useMemo(() => {
    if (!openKey) return null;
    for (const s of stages) for (const m of s.modules) if (`${s.category}:${m.id}` === openKey) return m;
    return null;
  }, [openKey, stages]);

  // Structures bucketed by their family (group), so the rail headers each group and
  // any ungrouped types fall into a trailing label-less section.
  const groupedStructures = useMemo(() => {
    if (!catalog) return [];
    const groups = catalog.groups ?? [];
    const out: { id: string; label?: string; items: GenerationModule[] }[] = [];
    for (const g of groups) {
      const items = structures.filter((s) => s.group === g.id);
      if (items.length > 0) out.push({ id: g.id, label: g.label, items });
    }
    const ungrouped = structures.filter((s) => !s.group || !groups.some((g) => g.id === s.group));
    if (ungrouped.length > 0) out.push({ id: '_ungrouped', items: ungrouped });
    return out;
  }, [catalog, structures]);

  return (
    <Modal open={open} onClose={close} title={t('modules.title')} className="modal-xl gallery" bodyClassName="gallery-body">
      <div className="gallery-main">
        <aside className="gallery-rail">
          <div className="gallery-rail-head">{t('modules.structures')}</div>
          <div className="gallery-structures">
            {catalog === null && <div className="catalog-empty">{t('modules.loading')}</div>}
            {groupedStructures.map((grp) => (
              <div key={grp.id} className="gallery-group">
                {grp.label && <div className="gallery-group-head">{grp.label}</div>}
                {grp.items.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`gallery-structure${structure?.id === s.id ? ' selected' : ''}`}
                    onClick={() => setStructureId(s.id)}
                  >
                    <PreviewFrame
                      className="gallery-structure-thumb"
                      src={modulePreviewSrc('structure', s.id)}
                      alt={s.label}
                    />
                    <span className="gallery-structure-text">
                      <span className="gallery-structure-name">{s.label}</span>
                      <span className="gallery-structure-meta">
                        {catalog ? t('modules.partsCount', { count: linkedParts(catalog, s) }) : ''}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </aside>

        <section className="gallery-detail">
          {structure ? (
            <>
              <header className="gallery-host">
                <PreviewFrame
                  className="gallery-host-thumb"
                  src={modulePreviewSrc('structure', structure.id)}
                  alt={structure.label}
                  placeholder={t('modules.previewSoon')}
                />
                <div className="gallery-host-text">
                  <span className="gallery-eyebrow">{t('modules.hostStructure')}</span>
                  <h3 className="gallery-host-name">{structure.label}</h3>
                  <p className="gallery-host-desc">{structure.description}</p>
                  <div className="gallery-host-meta">{t('modules.partsCount', { count: partsCount })}</div>
                </div>
              </header>

              <div className="gallery-flow">
                <div className="gallery-flow-root">
                  <span className="gallery-node gallery-node-root" />
                  <span className="gallery-flow-root-label">{structure.label}</span>
                </div>

                {stages.map((stage) => (
                  <div key={stage.category} className={`gallery-stage${stage.universal ? ' universal' : ''}`}>
                    <span className="gallery-node" />
                    <div className="gallery-stage-main">
                      <div className="gallery-stage-head">
                        <span className="gallery-stage-label">{t(stage.label)}</span>
                        {stage.universal ? (
                          <span className="chip gallery-tag-universal">{t('modules.universal')}</span>
                        ) : (
                          <span className="gallery-stage-count">{stage.modules.length}</span>
                        )}
                        <span className="gallery-stage-role">{t(stage.role)}</span>
                      </div>

                      {stage.modules.length === 0 ? (
                        <p className="gallery-stage-empty">
                          {t('modules.stageEmpty', { structure: structure.label })}
                        </p>
                      ) : (
                        <div className="gallery-stage-grid">
                          {stage.modules.map((m) => {
                            const key = `${stage.category}:${m.id}`;
                            const isOpen = openKey === key;
                            const conflict = !!focusedModule && focusedModule.id !== m.id && modulesConflict(focusedModule, m);
                            return (
                              <button
                                key={m.id}
                                type="button"
                                className={`gallery-part${isOpen ? ' open' : ''}${conflict ? ' conflict' : ''}`}
                                aria-expanded={isOpen}
                                onClick={() => setOpenKey(isOpen ? null : key)}
                              >
                                <span className="gallery-part-name">{m.label}</span>
                                <span className="gallery-part-desc">{m.description}</span>
                                {conflict ? (
                                  <span className="gallery-part-conflict">
                                    {t('modules.conflictWith', { label: focusedModule.label })}
                                  </span>
                                ) : (
                                  m.presets && m.presets.length > 0 && (
                                    <span className="gallery-part-tag">
                                      {t('modules.presetsCount', { count: m.presets.length })}
                                    </span>
                                  )
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {stage.modules
                        .filter((m) => `${stage.category}:${m.id}` === openKey)
                        .map((m) => (
                          <PartDetail key={m.id} module={m} catalog={catalog} t={t} />
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="gallery-detail-empty">{t('modules.loading')}</div>
          )}
        </section>
      </div>
    </Modal>
  );
}

/** The expanded detail for one linked part — preview, full description, the
 *  structures it pairs with, and (room modules) the furnishing presets. */
function PartDetail({ module, catalog, t }: { module: GenerationModule; catalog: GenerationCatalog | null; t: T }) {
  return (
    <div className="gallery-partdetail">
      <PreviewFrame
        className="gallery-partdetail-thumb"
        src={modulePreviewSrc(module.category, module.id)}
        alt={module.label}
        placeholder={t('modules.previewSoon')}
      />
      <div className="gallery-partdetail-body">
        <p className="gallery-partdetail-desc">{module.description}</p>

        {module.appliesTo && module.appliesTo.length > 0 && (
          <p className="gallery-applies">
            <span className="gallery-applies-label">{t('modules.appliesTo')}</span>
            {module.appliesTo.map((id) => (
              <span key={id} className="chip">
                {catalog?.structure.find((s) => s.id === id)?.label ?? id}
              </span>
            ))}
          </p>
        )}

        {module.presets && module.presets.length > 0 && (
          <div className="gallery-presets">
            <div className="gallery-presets-head">
              <span className="gallery-section-label">{t('modules.presets')}</span>
              <span className="gallery-presets-hint">{t('modules.presetsHint')}</span>
            </div>
            <div className="gallery-presets-grid">
              {module.presets.map((p) => (
                <article key={p.id} className="gallery-preset">
                  <div className="gallery-preset-head">
                    <span className={`chip gallery-preset-scale scale-${p.scale}`}>
                      {SCALE_LABEL[p.scale] ? t(SCALE_LABEL[p.scale]) : p.scale}
                    </span>
                    <span className="gallery-preset-name">{p.label}</span>
                  </div>
                  <p className="gallery-preset-summary">{p.summary}</p>
                  <ul className="gallery-preset-items">
                    {p.furnishings.map((f, j) => (
                      <li key={j}>{f}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
