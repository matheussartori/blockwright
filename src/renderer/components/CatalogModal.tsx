// The Block Catalog: browse every placeable block in the active content (vanilla
// pack + the active mod workspace's namespace), in a list or grid, with a live 3D
// preview of the selected block. Built on the shared Modal + Segmented primitives
// so it matches the rest of the app. Copying a block id (e.g. into the Generate
// composer) is the main action; it's also the seed for future inspector ↔ block
// links and mod-block-aware generation.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { store } from '../state/store';
import { useApp, useT } from '../hooks/useStores';
import type { CatalogBlock } from '@/shared/types';
import { Modal } from './ui/Modal';
import { Segmented } from './ui/Segmented';
import { BlockPreview } from './ui/BlockPreview';

type ViewMode = 'grid' | 'list';
type NsFilter = 'all' | 'minecraft' | 'mod';

/** Deterministic swatch colour for a block with no resolvable texture. */
function fallbackColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 32% 45%)`;
}

const VIEW_ICONS = {
  grid: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden>
      <rect x="1" y="1" width="6" height="6" rx="1" /><rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" /><rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  ),
  list: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden>
      <rect x="1" y="2" width="14" height="3" rx="1" /><rect x="1" y="7" width="14" height="3" rx="1" />
      <rect x="1" y="12" width="14" height="2.5" rx="1" />
    </svg>
  ),
} as const;

const CopyIcon = (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
    <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
  </svg>
);

const CheckIcon = (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
    <path d="M3 8.5l3.2 3.2L13 5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function Thumb({ block }: { block: CatalogBlock }) {
  return block.texture ? (
    <img src={api.textureUrl(block.texture)} alt="" loading="lazy" draggable={false} />
  ) : (
    <span className="catalog-swatch" style={{ background: fallbackColor(block.id) }} />
  );
}

export function CatalogModal() {
  const t = useT();
  const open = useApp((s) => s.catalogOpen);
  const workspace = useApp((s) => s.workspace);

  const [blocks, setBlocks] = useState<CatalogBlock[] | null>(null);
  const [query, setQuery] = useState('');
  const [ns, setNs] = useState<NsFilter>('all');
  const [view, setView] = useState<ViewMode>('grid');
  const [selected, setSelected] = useState<CatalogBlock | null>(null);
  const [copied, setCopied] = useState(false);

  const close = () => store.getState().setCatalogOpen(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setBlocks(null);
    void api.listCatalog().then((list) => {
      if (!alive) return;
      setBlocks(list);
      setSelected((cur) => cur ?? list[0] ?? null);
    });
    return () => {
      alive = false;
    };
  }, [open, workspace?.root]);

  const modNamespace = workspace?.namespace && workspace.namespace !== 'minecraft' ? workspace.namespace : null;

  const filtered = useMemo(() => {
    if (!blocks) return [];
    const q = query.trim().toLowerCase();
    return blocks.filter((b) => {
      if (ns === 'minecraft' && b.namespace !== 'minecraft') return false;
      if (ns === 'mod' && b.namespace === 'minecraft') return false;
      return q === '' || b.id.toLowerCase().includes(q);
    });
  }, [blocks, query, ns]);

  const copyId = (id: string) => {
    void navigator.clipboard?.writeText(id);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1300);
  };

  const select = (b: CatalogBlock) => {
    setSelected(b);
    setCopied(false);
  };

  return (
    <Modal open={open} onClose={close} title={t('catalog.title')} className="modal-lg catalog" bodyClassName="catalog-body">
      <div className="catalog-main">
        <div className="catalog-left">
          <div className="catalog-toolbar">
            <input
              className="input catalog-search"
              type="search"
              placeholder={t('catalog.search')}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {modNamespace && (
              <Segmented<NsFilter>
                ariaLabel={t('catalog.namespace')}
                value={ns}
                onChange={setNs}
                options={[
                  { value: 'all', label: t('catalog.all') },
                  { value: 'minecraft', label: 'minecraft' },
                  { value: 'mod', label: modNamespace },
                ]}
              />
            )}
            <Segmented<ViewMode>
              ariaLabel={t('catalog.viewLabel')}
              variant="icon"
              value={view}
              onChange={setView}
              options={[
                { value: 'grid', label: VIEW_ICONS.grid, title: t('catalog.gridView') },
                { value: 'list', label: VIEW_ICONS.list, title: t('catalog.listView') },
              ]}
            />
          </div>

          <div className={view === 'grid' ? 'catalog-grid' : 'catalog-list'}>
            {blocks === null && <div className="catalog-empty">{t('catalog.reading')}</div>}
            {blocks !== null && filtered.length === 0 && <div className="catalog-empty">{t('catalog.noMatch', { query })}</div>}
            {view === 'grid'
              ? filtered.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className={`catalog-tile${selected?.id === b.id ? ' selected' : ''}`}
                    title={b.id}
                    onClick={() => select(b)}
                    onDoubleClick={() => copyId(b.id)}
                  >
                    <span className="catalog-thumb">
                      <Thumb block={b} />
                    </span>
                    <span className="catalog-tile-label">{b.block}</span>
                  </button>
                ))
              : filtered.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className={`catalog-row${selected?.id === b.id ? ' selected' : ''}`}
                    onClick={() => select(b)}
                    onDoubleClick={() => copyId(b.id)}
                  >
                    <span className="catalog-row-thumb">
                      <Thumb block={b} />
                    </span>
                    <span className="catalog-row-id">{b.block}</span>
                    {b.namespace !== 'minecraft' && <span className="chip">{b.namespace}</span>}
                  </button>
                ))}
          </div>

          <div className="catalog-foot">{blocks ? t('catalog.blocksCount', { count: filtered.length }) : t('catalog.loading')}</div>
        </div>

        <aside className="catalog-side">
          <div className="catalog-preview">
            {selected && <span className="chip catalog-ns-badge">{selected.namespace}</span>}
            <BlockPreview blockId={selected?.id ?? null} />
          </div>
          {selected ? (
            <div className="catalog-detail">
              <div className="catalog-detail-head">
                <span className="catalog-detail-name" title={selected.block}>
                  {selected.block}
                </span>
              </div>
              <button
                type="button"
                className="catalog-id-copy"
                title={t('catalog.copyId')}
                onClick={() => copyId(selected.id)}
              >
                <code className="catalog-detail-id">{selected.id}</code>
                <span className="catalog-id-copy-icon">{copied ? CheckIcon : CopyIcon}</span>
              </button>
            </div>
          ) : (
            <div className="catalog-detail catalog-detail-empty">{t('catalog.selectToPreview')}</div>
          )}
        </aside>
      </div>
    </Modal>
  );
}
