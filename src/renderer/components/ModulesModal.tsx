// The Module Gallery: browse what the generator can build, grouped by category
// (Structure / Decoration / Basement / Roof / Room), and read what each module
// does. Unlike the Block Catalog (hundreds of items → grid-dominant), there are
// only a handful of modules per category and each carries rich, paragraph-length
// detail — so this screen is DETAIL-DOMINANT: a compact left index of modules and
// a wide right pane with a hero image, the description, and (for room modules) the
// FURNISHING PRESETS laid out as readable per-scale cards (the old narrow sidebar
// crushed them). Previews are image placeholders — drop `previews/<category>-<id>.png`
// in public/ to fill them with in-game screenshots (see `modulePreviewSrc`).
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { store } from '../state/store';
import { useApp, useT } from '../hooks/useStores';
import type { GenerationCatalog, GenerationModule, ModuleCategory } from '@/shared/types';
import type { MessageKey } from '@/shared/i18n';
import { Modal } from './ui/Modal';
import { PreviewFrame, modulePreviewSrc } from './ui/PreviewFrame';

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

  const catLabel = (c: ModuleCategory) => t(CATEGORIES.find((x) => x.value === c)!.label);

  return (
    <Modal open={open} onClose={close} title={t('modules.title')} className="modal-xl gallery" bodyClassName="gallery-body">
      <div className="gallery-main">
        <aside className="gallery-rail">
          <div className="gallery-cats" role="tablist" aria-label={t('modules.category')}>
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                role="tab"
                aria-selected={category === c.value}
                className={`gallery-cat${category === c.value ? ' active' : ''}`}
                onClick={() => setCategory(c.value)}
              >
                {t(c.label)}
              </button>
            ))}
          </div>

          <div className="gallery-index">
            {catalog === null && <div className="catalog-empty">{t('modules.loading')}</div>}
            {catalog !== null && modules.length === 0 && (
              <div className="catalog-empty">{t('modules.noneYet', { category: catLabel(category).toLowerCase() })}</div>
            )}
            {modules.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`gallery-item${selected?.id === m.id ? ' selected' : ''}`}
                onClick={() => setSelectedId(m.id)}
              >
                <PreviewFrame
                  className="gallery-item-thumb"
                  src={modulePreviewSrc(m.category, m.id)}
                  alt={m.label}
                />
                <span className="gallery-item-text">
                  <span className="gallery-item-name">{m.label}</span>
                  <span className="gallery-item-desc">{m.description}</span>
                </span>
              </button>
            ))}
          </div>

          {catalog !== null && modules.length > 0 && (
            <div className="gallery-rail-foot">{t('modules.count', { count: modules.length })}</div>
          )}
        </aside>

        <section className="gallery-detail">
          {selected ? (
            <>
              <div className="gallery-hero">
                <PreviewFrame
                  src={modulePreviewSrc(selected.category, selected.id)}
                  alt={selected.label}
                  badge={<span className="chip gallery-hero-badge">{catLabel(selected.category)}</span>}
                  placeholder={t('modules.previewSoon')}
                />
              </div>

              <div className="gallery-detail-body">
                <header className="gallery-detail-head">
                  <h3 className="gallery-detail-name">{selected.label}</h3>
                  {selected.appliesTo && selected.appliesTo.length > 0 && (
                    <p className="gallery-applies">
                      <span className="gallery-applies-label">{t('modules.appliesTo')}</span>
                      {selected.appliesTo.map((id) => (
                        <span key={id} className="chip">
                          {catalog?.structure.find((s) => s.id === id)?.label ?? id}
                        </span>
                      ))}
                    </p>
                  )}
                </header>

                <p className="gallery-detail-desc">{selected.description}</p>

                {selected.presets && selected.presets.length > 0 && (
                  <div className="gallery-presets">
                    <div className="gallery-presets-head">
                      <span className="gallery-section-label">{t('modules.presets')}</span>
                      <span className="gallery-presets-hint">{t('modules.presetsHint')}</span>
                    </div>
                    <div className="gallery-presets-grid">
                      {selected.presets.map((p) => (
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
            </>
          ) : (
            <div className="gallery-detail-empty">{t('modules.selectModule')}</div>
          )}
        </section>
      </div>
    </Modal>
  );
}
