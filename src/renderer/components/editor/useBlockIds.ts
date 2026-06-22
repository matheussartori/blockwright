// The content pack's placeable block ids, fetched once when the editor opens — the source
// for the Replace / Stairs autocomplete fields.
import { useEffect, useState } from 'react';
import { api } from '../../api';

export function useBlockIds(enabled: boolean): string[] {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    if (!enabled || ids.length) return;
    void api.listCatalog().then((blocks) => setIds(blocks.map((b) => b.id)));
  }, [enabled, ids.length]);
  return ids;
}
