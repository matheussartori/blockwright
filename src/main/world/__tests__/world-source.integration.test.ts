// Real-save integration check for the whole reader (level.dat + region + chunk decode). Hermetic by
// default — skipped unless BW_TEST_WORLD points at a Minecraft world folder. Run locally with:
//   BW_TEST_WORLD="$HOME/Library/Application Support/minecraft/saves/New World" npm run test
import { describe, expect, it } from 'vitest';
import { WorldSource } from '../world-source';

const WORLD = process.env.BW_TEST_WORLD;

describe.skipIf(!WORLD)('WorldSource against a real save', () => {
  it('opens meta and decodes the spawn chunk', async () => {
    const src = await WorldSource.open(WORLD!);
    const meta = src.getMeta();
    expect(meta.dataVersion).toBeGreaterThan(0);
    expect(meta.dimensions.map((d) => d.id)).toContain('minecraft:overworld');
    expect(meta.name.length).toBeGreaterThan(0);

    const [sx, , sz] = meta.spawn;
    const col = await src.getChunk('minecraft:overworld', sx >> 4, sz >> 4);
    expect(col).not.toBeNull();
    expect(col!.sections.length).toBeGreaterThan(0);

    // The spawn column must contain at least one non-air block (solid ground).
    const solid = col!.sections.some((s) => s.uniform || (s.blocks && s.blocks.some((i) => i > 0)));
    expect(solid).toBe(true);

    // The cache returns the same instance on a second read.
    expect(await src.getChunk('minecraft:overworld', sx >> 4, sz >> 4)).toBe(col);
    src.dispose();
  });
});
