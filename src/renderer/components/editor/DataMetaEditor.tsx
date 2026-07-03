// The selection's "Structure data" field: when the selection holds data-mode structure
// blocks, edit the metadata string a mod reads at placement time — the write-side of the
// Inspector's data-marker rows, in the same dialect (mono string + the `data` chip).
// Enter/blur applies (one undo step via setDataMeta), Escape reverts. A multi-selection
// with one shared string edits all at once; mixed strings start empty and typing replaces
// them all (the placeholder says so before it happens).
import { useEffect, useMemo, useState } from 'react';
import { Database } from 'lucide-react';
import type { StructureData } from '@/shared/types';
import type { TFunction } from '@/shared/i18n';
import { editorStore } from '../../state/editor';
import { cellKey } from '../../editor/ops';

const STRUCTURE_BLOCK = 'minecraft:structure_block';

/** The selected data-mode structure blocks with their EFFECTIVE string: an in-session edit
 *  (`dataMeta`) wins, else the loaded marker string looked up by the block's origin cell
 *  (`nbtPos` — so a moved marker still resolves), else empty (a freshly painted marker).
 *  A structure block with no `mode` property counts as data — that's vanilla's default. */
function selectedMarkers(structure: StructureData, selection: string[]): { key: string; value: string }[] {
  const byPos = new Map(structure.blocks.map((b) => [cellKey(b.pos), b]));
  const loaded = new Map((structure.dataMarkers ?? []).map((m) => [cellKey(m.pos), m.data]));
  const out: { key: string; value: string }[] = [];
  for (const k of selection) {
    const b = byPos.get(k);
    const entry = b ? structure.palette[b.state] : undefined;
    if (!b || entry?.name !== STRUCTURE_BLOCK) continue;
    const mode = entry.properties?.mode;
    if (mode != null && mode !== 'data') continue;
    out.push({ key: k, value: b.dataMeta ?? loaded.get(cellKey(b.nbtPos ?? b.pos)) ?? '' });
  }
  return out;
}

export function DataMetaEditor({ structure, selection, t }: { structure: StructureData; selection: string[]; t: TFunction }) {
  const markers = useMemo(() => selectedMarkers(structure, selection), [structure, selection]);
  const mixed = new Set(markers.map((m) => m.value)).size > 1;
  const initial = mixed ? '' : (markers[0]?.value ?? '');
  // Re-seed the draft whenever the selected markers (or their strings) change — the
  // signature covers undo/redo rewinding a value under an unchanged selection.
  const sig = markers.map((m) => `${m.key}=${m.value}`).join(';');
  const [draft, setDraft] = useState(initial);
  // Deliberately keyed on the signature alone: `initial` derives from it.
  useEffect(() => setDraft(initial), [sig]);

  if (!markers.length) return null;

  const apply = () => {
    if (draft === initial) return; // includes the untouched-mixed case — never blanks by accident
    editorStore.getState().setDataMeta(markers.map((m) => m.key), draft);
  };

  return (
    <div className="editor-datameta">
      <div className="editor-datameta-head">
        <Database size={12} strokeWidth={1.9} aria-hidden />
        <span>{t('editor.dataMeta')}</span>
        <span className="chip">{t('inspector.dataChip')}</span>
        {markers.length > 1 && <span className="editor-datameta-count">×{markers.length}</span>}
      </div>
      <input
        className="editor-input"
        value={draft}
        placeholder={mixed ? t('editor.dataMetaMixed') : t('editor.dataMetaPlaceholder')}
        aria-label={t('editor.dataMeta')}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          // Enter defers to onBlur so the edit applies exactly once; Escape reverts in
          // place (a later blur then compares equal and no-ops).
          if (e.key === 'Enter') e.currentTarget.blur();
          else if (e.key === 'Escape') setDraft(initial);
        }}
      />
      <p className="editor-hint editor-note">{t('editor.dataMetaHint')}</p>
    </div>
  );
}
