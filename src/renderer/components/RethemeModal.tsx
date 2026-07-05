// The Re-theme dialog (File ▸ Re-theme Structure…): swap the build's palette wholesale —
// per-block target fields with occurrence counts, plus a one-click decoration suggestion
// (roles classified main-side, the registered decorations' role→block maps). Blockstate
// properties are CARRIED through every swap (a stair keeps its facing/half/shape — the
// thing naive find&replace re-themers corrupt), because the store's `retheme` resolves
// each target WITH the source entry's properties. Applying is one undoable editor step;
// edit mode is entered so Undo/Save are in reach, and saving lands as a new version.
import { useEffect, useMemo, useState } from 'react';
import { Paintbrush, Wand2 } from 'lucide-react';
import type { GenerationCatalog } from '@/shared/types';
import { api } from '../api';
import { useActiveDoc, useApp, useLocale, useT } from '../hooks/useStores';
import { store } from '../state/store';
import { editorStore } from '../state/editor';
import { Modal } from './ui/Modal';
import { Select } from './ui/Select';
import { BlockPreview } from './ui/BlockPreview';
import { BlockField } from './editor/BlockField';
import { useBlockIds } from './editor/useBlockIds';

/** One distinct source block of the build: its palette indices + how many cells use it. */
interface SourceRow {
  name: string;
  count: number;
  indices: number[];
}

export function RethemeModal() {
  const t = useT();
  const locale = useLocale();
  const open = useApp((s) => s.rethemeOpen);
  const doc = useActiveDoc();
  const blockIds = useBlockIds();
  const [catalog, setCatalog] = useState<GenerationCatalog | null>(null);
  const [decoration, setDecoration] = useState<string>('');
  /** Draft mapping: source block name → target block name ('' = leave unchanged). */
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const close = () => {
    store.getState().setRethemeOpen(false);
    setTargets({});
  };

  // The catalog is localized at the IPC boundary, so refetch on locale change too.
  useEffect(() => {
    if (!open) return;
    void api.generationCatalog().then((c) => {
      setCatalog(c);
      setDecoration((cur) => cur || (c.decoration[0]?.id ?? ''));
    });
  }, [open, locale]);

  // Distinct non-air blocks, most-used first — the rows the user maps.
  const rows = useMemo<SourceRow[]>(() => {
    const struct = doc?.structure;
    if (!struct) return [];
    const countByState = new Map<number, number>();
    for (const b of struct.blocks) countByState.set(b.state, (countByState.get(b.state) ?? 0) + 1);
    const byName = new Map<string, SourceRow>();
    struct.palette.forEach((entry, i) => {
      if (!entry || entry.air || !countByState.has(i)) return;
      const row = byName.get(entry.name) ?? { name: entry.name, count: 0, indices: [] };
      row.count += countByState.get(i) ?? 0;
      row.indices.push(i);
      byName.set(entry.name, row);
    });
    return [...byName.values()].sort((a, b) => b.count - a.count);
  }, [doc?.structure]);

  if (!open) return null;

  const strip = (name: string) => name.replace(/^minecraft:/, '');
  const changed = rows.filter((r) => targets[r.name] && targets[r.name] !== r.name);

  const suggest = async () => {
    if (!decoration) return;
    setBusy(true);
    try {
      const map = await api.rethemeMap(rows.map((r) => r.name), decoration);
      // Merge over the draft: the decoration fills its rows, manual picks elsewhere stay.
      setTargets((prev) => ({ ...prev, ...map }));
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    const mapping: Record<number, string> = {};
    for (const row of changed) for (const idx of row.indices) mapping[idx] = targets[row.name];
    setBusy(true);
    try {
      await editorStore.getState().retheme(mapping);
      // Land in edit mode so Undo and Save-as-version are one click away.
      editorStore.getState().setActive(true);
      close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('retheme.title')}
      className="modal-lg retheme-modal"
      footer={
        <>
          <span className="retheme-count">{changed.length > 0 ? t('retheme.pending', { n: changed.length }) : t('retheme.pendingNone')}</span>
          <button className="btn" onClick={close}>
            {t('retheme.cancel')}
          </button>
          <button className="btn primary" disabled={busy || changed.length === 0} onClick={() => void apply()}>
            <Paintbrush size={14} strokeWidth={1.9} aria-hidden />
            {t('retheme.apply')}
          </button>
        </>
      }
    >
      <p className="retheme-note">{t('retheme.note')}</p>
      <div className="retheme-deco">
        <Select
          value={decoration}
          options={(catalog?.decoration ?? []).map((d) => ({ value: d.id, label: d.label, description: d.description }))}
          onChange={setDecoration}
          ariaLabel={t('retheme.decoration')}
        />
        <button className="btn sm" disabled={busy || !decoration || rows.length === 0} onClick={() => void suggest()}>
          <Wand2 size={14} strokeWidth={1.9} aria-hidden />
          {t('retheme.suggest')}
        </button>
      </div>
      <div className="retheme-rows">
        {rows.map((row) => (
          <div key={row.name} className="retheme-row">
            <div className="retheme-src">
              <div className="editor-swatch">
                <BlockPreview blockId={row.name} />
              </div>
              <div className="retheme-srcmeta">
                <span className="retheme-srcname" title={row.name}>
                  {strip(row.name)}
                </span>
                <span className="retheme-srccount">{t('retheme.count', { n: row.count })}</span>
              </div>
            </div>
            <span className="retheme-arrow" aria-hidden>
              →
            </span>
            <div className="retheme-target">
              {targets[row.name] && targets[row.name] !== row.name && (
                <div className="editor-swatch">
                  <BlockPreview blockId={targets[row.name]} />
                </div>
              )}
              <BlockField
                label=""
                value={targets[row.name] ?? ''}
                onChange={(v) => setTargets((prev) => ({ ...prev, [row.name]: v }))}
                options={blockIds}
                listId="retheme-blocks"
                placeholder={t('retheme.keep')}
              />
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="retheme-note">{t('retheme.empty')}</p>}
      </div>
    </Modal>
  );
}
