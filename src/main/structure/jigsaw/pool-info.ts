// The Jigsaw Lab's pool inspector: resolve every distinct template pool a structure's
// connectors reference into a serializable summary (existence, elements, fallback).
// Read-only over resolvePool — the same resolution the assembler uses, so what the
// panel shows is exactly what an assembly would draw from.
import type { JigsawPoolInfo } from '@/shared/types';
import { loadStructureMeta } from '../io/load-structure';
import { resolvePool } from './template-pool';

const EMPTY_ID = 'minecraft:empty';

/** Distinct pools referenced by `filePath`'s connectors, in connector order (the
 *  panel lists them alongside the connectors). `minecraft:empty` and blank pools
 *  are skipped — they mean "no expansion", not a pool to inspect. */
export async function resolveJigsawPools(filePath: string): Promise<JigsawPoolInfo[]> {
  const meta = await loadStructureMeta(filePath);
  const seen = new Set<string>();
  const infos: JigsawPoolInfo[] = [];
  for (const j of meta.jigsaws) {
    if (!j.pool || j.pool === EMPTY_ID || seen.has(j.pool)) continue;
    seen.add(j.pool);
    const pool = resolvePool(j.pool);
    const fallback = pool.fallback && pool.fallback !== EMPTY_ID ? pool.fallback : null;
    infos.push({
      id: pool.id,
      exists: pool.exists,
      fallback: pool.fallback,
      fallbackExists: fallback ? resolvePool(fallback).exists : null,
      elements: pool.elements.map((el) => ({
        structureId: el.structureId,
        exists: el.empty === true || el.structurePath !== null,
        weight: el.weight,
        empty: el.empty === true,
      })),
    });
  }
  return infos;
}
