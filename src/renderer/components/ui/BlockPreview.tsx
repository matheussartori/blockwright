// A small, self-contained 3D preview of a single block for the Block Catalog. It
// loads the block's 1×1×1 StructureData (`previewBlock` in main) and hands it to the
// shared StructurePreview, which runs the lightweight Three.js scene + auto-framing.
import { useEffect, useState } from 'react';
import type { StructureData } from '@/shared/types';
import { api } from '../../api';
import { StructurePreview } from './StructurePreview';

export function BlockPreview({ blockId }: { blockId: string | null }) {
  const [data, setData] = useState<StructureData | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    if (!blockId) return;
    void api
      .previewBlock(blockId)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [blockId]);

  return <StructurePreview data={data} />;
}
