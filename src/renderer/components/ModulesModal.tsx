// The Module Gallery: browse the generation modules grouped by category (Structure /
// Decoration / Basement / Roof), read what each one builds, and see a live 3D preview
// composed from a ready structure. It mirrors the Block Catalog (shared Modal +
// Segmented + the StructurePreview scene) so it matches the rest of the app. This is
// the "explain the module types" screen — selection in the composer Details is the
// same set of modules.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { store } from '../state/store';
import { useApp } from '../hooks/useStores';
import type { GenerationCatalog, GenerationModule, ModuleCategory, StructureData } from '@/shared/types';
import { Modal } from './ui/Modal';
import { Segmented } from './ui/Segmented';
import { StructurePreview } from './ui/StructurePreview';

const CATEGORIES: { value: ModuleCategory; label: string }[] = [
  { value: 'structure', label: 'Structure' },
  { value: 'decoration', label: 'Decoration' },
  { value: 'basement', label: 'Basement' },
  { value: 'roof', label: 'Roof' },
];

export function ModulesModal() {
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
    <Modal open={open} onClose={close} title="Module Gallery" className="modal-lg catalog" bodyClassName="catalog-body">
      <div className="catalog-main">
        <div className="catalog-left">
          <div className="catalog-toolbar">
            <Segmented<ModuleCategory>
              ariaLabel="Module category"
              value={category}
              onChange={setCategory}
              options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
            />
          </div>

          <div className="modules-list">
            {catalog === null && <div className="catalog-empty">Loading modules…</div>}
            {catalog !== null && modules.length === 0 && (
              <div className="catalog-empty">No {category} modules yet — coming soon.</div>
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
                {selected ? (previewError ? 'Preview failed to build.' : 'Preview coming soon.') : 'Select a module.'}
              </div>
            )}
          </div>
          {selected && (
            <div className="catalog-detail">
              <div className="catalog-detail-head">
                <span className="catalog-detail-name">{selected.label}</span>
              </div>
              <p className="modules-detail-desc">{selected.description}</p>
            </div>
          )}
        </aside>
      </div>
    </Modal>
  );
}
