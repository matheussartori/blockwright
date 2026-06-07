// The Module Gallery: browse the generation modules grouped by category (Structure /
// Decoration / Basement / Roof / Room), read what each one builds, and see a live 3D
// preview composed from a ready structure. It mirrors the Block Catalog (shared Modal +
// Segmented + the StructurePreview scene) so it matches the rest of the app. This is
// the "explain the module types" screen — selection in the composer Details is the
// same set of modules. Room modules have no geometry preview but list their FURNISHING
// PRESETS (tiered by floor space) as an expandable, scale-chipped list — the SPACE ×
// DECORATION organism (see `@/shared/domain/furnishing`).
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { store } from '../state/store';
import { useApp, useT } from '../hooks/useStores';
import type { GenerationCatalog, GenerationModule, ModuleCategory, StructureData } from '@/shared/types';
import type { MessageKey } from '@/shared/i18n';
import { Modal } from './ui/Modal';
import { Segmented } from './ui/Segmented';
import { StructurePreview } from './ui/StructurePreview';

const CATEGORIES: { value: ModuleCategory; label: MessageKey }[] = [
  { value: 'structure', label: 'modules.catStructure' },
  { value: 'decoration', label: 'modules.catDecoration' },
  { value: 'basement', label: 'modules.catBasement' },
  { value: 'roof', label: 'modules.catRoof' },
  { value: 'room', label: 'modules.catRoom' },
];

/** i18n key for a furnishing-preset space tier chip. */
const SCALE_LABEL: Record<string, MessageKey> = {
  snug: 'modules.scaleSnug',
  standard: 'modules.scaleStandard',
  grand: 'modules.scaleGrand',
};

export function ModulesModal() {
  const t = useT();
  const open = useApp((s) => s.modulesOpen);

  const [catalog, setCatalog] = useState<GenerationCatalog | null>(null);
  const [category, setCategory] = useState<ModuleCategory>('structure');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<StructureData | null>(null);
  const [previewError, setPreviewError] = useState(false);

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

  const modules: GenerationModule[] = useMemo(() => catalog?.[category] ?? [], [catalog, category]);
  const selected = useMemo(
    () => modules.find((m) => m.id === selectedId) ?? modules[0] ?? null,
    [modules, selectedId],
  );

  // Default the selection to the first module of the active category.
  useEffect(() => {
    setSelectedId(modules[0]?.id ?? null);
  }, [modules]);

  // Load the selected module's 3D preview (compose → compile → load in main).
  useEffect(() => {
    let alive = true;
    setPreview(null);
    setPreviewError(false);
    if (!selected || !selected.hasPreview) return;
    void api
      .previewModule(selected.category, selected.id)
      .then((d) => alive && setPreview(d))
      .catch(() => alive && setPreviewError(true));
    return () => {
      alive = false;
    };
  }, [selected]);

  return (
    <Modal open={open} onClose={close} title={t('modules.title')} className="modal-lg catalog" bodyClassName="catalog-body">
      <div className="catalog-main">
        <div className="catalog-left">
          <div className="catalog-toolbar">
            <Segmented<ModuleCategory>
              ariaLabel={t('modules.category')}
              value={category}
              onChange={setCategory}
              options={CATEGORIES.map((c) => ({ value: c.value, label: t(c.label) }))}
            />
          </div>

          <div className="modules-list">
            {catalog === null && <div className="catalog-empty">{t('modules.loading')}</div>}
            {catalog !== null && modules.length === 0 && (
              <div className="catalog-empty">
                {t('modules.noneYet', { category: t(CATEGORIES.find((c) => c.value === category)!.label).toLowerCase() })}
              </div>
            )}
            {modules.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`modules-row${selected?.id === m.id ? ' selected' : ''}`}
                onClick={() => setSelectedId(m.id)}
              >
                <span className="modules-row-name">{m.label}</span>
                <span className="modules-row-desc">{m.description}</span>
              </button>
            ))}
          </div>
        </div>

        <aside className="catalog-side">
          <div className="catalog-preview">
            {selected && <span className="chip catalog-ns-badge">{selected.category}</span>}
            {selected?.hasPreview && !previewError ? (
              <StructurePreview data={preview} />
            ) : (
              <div className="modules-preview-empty">
                {selected ? (previewError ? t('modules.previewFailed') : t('modules.previewSoon')) : t('modules.selectModule')}
              </div>
            )}
          </div>
          {selected && (
            <div className="catalog-detail">
              <div className="catalog-detail-head">
                <span className="catalog-detail-name">{selected.label}</span>
              </div>
              <p className="modules-detail-desc">{selected.description}</p>
              {selected.appliesTo && selected.appliesTo.length > 0 && (
                <p className="modules-detail-applies">
                  <span className="modules-detail-applies-label">{t('modules.appliesTo')}</span>{' '}
                  {selected.appliesTo
                    .map((id) => catalog?.structure.find((s) => s.id === id)?.label ?? id)
                    .join(', ')}
                </p>
              )}
              {selected.presets && selected.presets.length > 0 && (
                <div className="modules-presets">
                  <div className="modules-presets-head">
                    <span className="modules-detail-applies-label">{t('modules.presets')}</span>
                    <span className="modules-presets-hint">{t('modules.presetsHint')}</span>
                  </div>
                  {selected.presets.map((p, i) => (
                    <details key={p.id} className="modules-preset" open={i === 0}>
                      <summary className="modules-preset-summary">
                        <span className={`chip modules-preset-scale scale-${p.scale}`}>
                          {SCALE_LABEL[p.scale] ? t(SCALE_LABEL[p.scale]) : p.scale}
                        </span>
                        <span className="modules-preset-name">{p.label}</span>
                      </summary>
                      <p className="modules-preset-desc">{p.summary}</p>
                      <ul className="modules-preset-items">
                        {p.furnishings.map((f, j) => (
                          <li key={j}>{f}</li>
                        ))}
                      </ul>
                    </details>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </Modal>
  );
}
