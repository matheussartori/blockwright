// Block entities aren't ordinary block models — vanilla renders them with a
// dedicated entity renderer, so their blockstate/model only carries a particle
// texture. Each kind synthesizes its own geometry from an entity atlas; this is
// just the dispatcher. Fluids (water/lava) are handled separately in `fluid.ts`
// since they're not block entities.
import type { ResolvedModel } from '@/shared/types';
import { resolveChest } from './chest';
import { resolveBed } from './bed';
import { resolveWallBanner } from './banner';
import { resolveDecoratedPot } from './decorated-pot';
import { resolveSkull } from './skull';

/** Resolve a block-entity block into a synthesized model, or null when the
 *  block isn't one we render specially. */
export function resolveBlockEntity(name: string, properties: Record<string, string>): ResolvedModel[] | null {
  return (
    resolveChest(name, properties) ??
    resolveBed(name, properties) ??
    resolveWallBanner(name, properties) ??
    resolveDecoratedPot(name, properties) ??
    resolveSkull(name, properties)
  );
}
