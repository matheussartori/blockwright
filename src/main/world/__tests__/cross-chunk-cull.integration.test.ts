// Real-save proof that cross-chunk face culling actually drops the buried seam between two solid
// adjacent chunks (the "flying through terrain shows walls at every chunk border" defect). Skipped
// unless BW_TEST_WORLD points at a Minecraft world. Run with:
//   BW_TEST_WORLD="$HOME/Library/Application Support/minecraft/saves/New World" npm run test
// Exercises the real path: region → decode → computeBorderPlanes → buildGeometryBuffers, so it locks
// the neighbour→plane mapping the world view relies on (east neighbour's WEST edge → xPos). Blocks
// are resolved to model-less occluder cubes here (air-vs-solid is all the culling needs — no content
// pack / electron), which keeps the test hermetic.
import { describe, expect, it } from 'vitest';
import { WorldSource } from '../world-source';
import type { ColumnData } from '../anvil/chunk-decode';
import type { RawPaletteEntry } from '../../structure/io/raw';
import { computeBorderPlanes } from '../../../renderer/world/chunk-borders';
import { buildGeometryBuffers, occluderStates, type GeomBlock, type GeomInput } from '../../../renderer/viewer/geometry-core';
import type { ChunkRenderPayload, PaletteEntry } from '@/shared/types';
import type { TexInfo } from '../../../renderer/viewer/model-geometry';

const WORLD = process.env.BW_TEST_WORLD;
const AIR = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air', 'minecraft:structure_void']);

/** A decoded column → render payload with a trivial resolver (non-air = a model-less occluder cube). */
function toPayload(col: ColumnData): ChunkRenderPayload {
  const palette: PaletteEntry[] = [];
  const index = new Map<string, number>();
  const intern = (raw: RawPaletteEntry): number => {
    const key = raw.Name;
    const hit = index.get(key);
    if (hit !== undefined) return hit;
    const idx = palette.length;
    palette.push({ name: raw.Name, properties: {}, air: AIR.has(raw.Name), color: [0.5, 0.5, 0.5], models: [] });
    index.set(key, idx);
    return idx;
  };
  const sections = col.sections.map((s) => {
    const local = s.palette.map(intern);
    if (s.uniform || !s.blocks) return { sectionY: s.sectionY, blocks: null, uniform: true, fill: local[0] ?? 0 };
    const blocks = new Uint16Array(4096);
    for (let c = 0; c < 4096; c++) blocks[c] = local[s.blocks[c]];
    return { sectionY: s.sectionY, blocks, uniform: false, fill: 0 };
  });
  return { cx: col.cx, cz: col.cz, palette, sections, textureKeys: [], heightmap: null, grassTint: null, empty: false };
}

/** Expand a payload to the non-air block list the geometry core meshes (mirrors the worker). */
function expand(payload: ChunkRenderPayload): GeomBlock[] {
  const air = payload.palette.map((p) => p.air);
  const blocks: GeomBlock[] = [];
  for (const s of payload.sections) {
    const baseY = s.sectionY * 16;
    if (s.uniform || !s.blocks) {
      if (air[s.fill]) continue;
      for (let ly = 0; ly < 16; ly++)
        for (let lz = 0; lz < 16; lz++)
          for (let lx = 0; lx < 16; lx++) blocks.push({ state: s.fill, pos: [lx, baseY + ly, lz] });
      continue;
    }
    for (let i = 0; i < 4096; i++) {
      const state = s.blocks[i];
      if (air[state]) continue;
      blocks.push({ state, pos: [i & 15, baseY + (i >> 8), (i >> 4) & 15] });
    }
  }
  return blocks;
}

const faceCount = (bs: ReturnType<typeof buildGeometryBuffers>): number =>
  bs.reduce((n, b) => n + b.positions.length / 3, 0) / 6;

describe.skipIf(!WORLD)('cross-chunk face culling on a real save', () => {
  it('drops the buried seam between two horizontally-adjacent solid chunks', async () => {
    const src = await WorldSource.open(WORLD!);
    const [sx, , sz] = src.getMeta().spawn;
    const cx = sx >> 4;
    const cz = sz >> 4;

    const westCol = await src.getChunk('minecraft:overworld', cx, cz);
    const eastCol = await src.getChunk('minecraft:overworld', cx + 1, cz);
    expect(westCol).not.toBeNull();
    expect(eastCol).not.toBeNull();

    const west = toPayload(westCol!);
    const east = toPayload(eastCol!);
    const tex = new Map<string, TexInfo>();

    const input: GeomInput = { palette: west.palette, blocks: expand(west) };
    const bare = buildGeometryBuffers(input, tex, { occlude: true });

    // The east neighbour's WEST edge is what sits just past the west chunk's x=15 border.
    const eastPlanes = computeBorderPlanes(east, occluderStates(east.palette, tex));
    const withNeighbour = buildGeometryBuffers(input, tex, { occlude: true, borders: { xPos: eastPlanes.west } });

    const bareFaces = faceCount(bare);
    const culledFaces = faceCount(withNeighbour);
    // A generated overworld column has plenty of solid stone at the seam, so the neighbour must cull
    // some border faces — and never add any.
    expect(culledFaces).toBeLessThan(bareFaces);
    src.dispose();
  });
});
