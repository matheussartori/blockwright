// The STRUCTURE-TYPE CONTRACT + cross-type INVARIANT matrix — the standardization net.
// Every house archetype must satisfy the same contract (declared metadata, authoritative
// floors for a storeyed type, a registered paired decoration) and every type × roof ×
// basement combination must produce a real shell: covered to the sky, dense enough to be
// a building, with every requested module actually built (no silent skips). A future
// type that ships roofless geometry, forgets a slot, or hardcodes around the kit fails
// HERE before it ever reaches a user.
import { describe, expect, it } from 'vitest';
import { structureModules, structureTypeIds } from '../structure-types';
import { getDecoration } from '../decorations';
import { getRoof } from '../roofs';
import { resolveBlocks } from '../../authoring/ops';
import { moduleAppliesTo } from '@/shared/domain/applies-to';
import type { AuthoringStructure } from '../../authoring/types';

describe('structure-type CONTRACT (every registered type, no exceptions)', () => {
  it('declares the full module metadata: group, knowledge guide, preview, defaults, params', () => {
    for (const t of structureModules()) {
      expect(t.group, `${t.id}.group`).toBeTruthy();
      expect(t.knowledge, `${t.id}.knowledge`).toMatch(/^nbt\/modules\/structure\//);
      expect(t.preview, `${t.id}.preview`).toBeTruthy();
      expect(Object.keys(t.defaults).length, `${t.id}.defaults`).toBeGreaterThan(5);
      expect(t.params, `${t.id}.params`).toBeTruthy();
    }
  });

  it('every STOREYED type (a `floors` param) declares authoritative floors()', () => {
    for (const t of structureModules()) {
      if (!('floors' in t.params)) continue;
      expect(typeof t.floors, `${t.id} must implement floors() — the viewer bands, the metadata `
        + `sidecar and the room plan all depend on the authoritative planes`).toBe('function');
    }
  });

  it('a declared pairedDecoration resolves to a registered decoration', () => {
    for (const t of structureModules()) {
      if (t.pairedDecoration) {
        expect(getDecoration(t.pairedDecoration), `${t.id}.pairedDecoration`).toBeTruthy();
      }
    }
  });

  it('every value of a type`s roof param resolves to a registered roof module that applies to it', () => {
    for (const t of structureModules()) {
      const def = t.params.roof;
      if (!def || def.kind !== 'enum') continue;
      for (const v of def.values) {
        if (v === 'auto') continue; // classic's seeded pick resolves to gable/hip at build
        const mod = getRoof(v);
        expect(mod, `${t.id} roof option "${v}" must be a registered roof module`).toBeTruthy();
        expect(
          moduleAppliesTo(mod!.appliesTo, t.id, t.group),
          `roof "${v}" must declare appliesTo for ${t.id} (it is one of the type's own options)`,
        ).toBe(true);
      }
    }
  });
});

/** Expand a type×params combination to concrete blocks (via a self-interning template). */
function expand(name: string, size: [number, number, number], params: Record<string, unknown>) {
  const authoring: AuthoringStructure = {
    DataVersion: 3955,
    size,
    palette: [{ Name: 'minecraft:air' }],
    ops: [{ op: 'template', name, from: [0, 0, 0], to: [size[0] - 1, size[1] - 1, size[2] - 1], params }],
  };
  const resolved = resolveBlocks(authoring);
  const warnings = resolved.warnings;
  const solid = new Set<string>();
  for (const b of resolved.blocks) {
    const nm = resolved.palette[b.state]?.Name ?? '';
    if (nm && nm !== 'minecraft:air') solid.add(b.pos.join(','));
  }
  return { solid, warnings };
}

/** Interior columns (inset 1 from the box rim) with NO solid above the ground course —
 *  i.e. nothing over your head anywhere in that column (no slab, deck or roof). A real
 *  house has 0. (Roof-surface continuity — the truncated-ridge slot — is asserted at the
 *  source in the roof op's own truncation-deck test, since a stepped silhouette like the
 *  modern villa legitimately covers different columns at different heights.) */
function uncoveredColumns(solid: Set<string>, size: [number, number, number]): number {
  const [W, H, D] = size;
  let open = 0;
  for (let x = 1; x < W - 1; x++) {
    for (let z = 1; z < D - 1; z++) {
      let covered = false;
      for (let y = 2; y < H && !covered; y++) covered = solid.has(`${x},${y},${z}`);
      if (!covered) open++;
    }
  }
  return open;
}

describe('cross-type INVARIANTS: every house × roof × basement ships a real, covered shell', () => {
  const SIZES: [number, number, number][] = [
    [15, 14, 13],
    [21, 18, 17],
  ];

  it('never roofless, never shell-less, never a silently dropped pick', () => {
    for (const id of structureTypeIds()) {
      const t = structureModules().find((m) => m.id === id)!;
      const roofDef = t.params.roof;
      const roofValues = roofDef?.kind === 'enum' ? roofDef.values.filter((v) => v !== 'auto') : [undefined];
      for (const size of SIZES) {
        for (const roof of roofValues) {
          for (const basement of [undefined, 'crypt']) {
            const params: Record<string, unknown> = { floors: 2, seed: 7 };
            if (roof) params.roof = roof;
            if (basement) params.basement = basement;
            const label = `${id} ${size.join('×')} roof=${roof ?? '-'} basement=${basement ?? '-'}`;
            const { solid, warnings } = expand(id, size, params);
            // 1. A real shell: at least floor + walls + cap worth of blocks ("sem casco" guard).
            expect(solid.size, `${label}: shell density`).toBeGreaterThan(size[0] * size[2] * 1.5);
            // 2. Covered to the sky: no interior column without anything overhead
            //    ("sem telhado" guard).
            expect(uncoveredColumns(solid, size), `${label}: open-to-sky columns`).toBe(0);
            // 3. Module respect: nothing the params requested was silently skipped.
            expect(warnings, `${label}: module-respect warnings`).toEqual([]);
          }
        }
      }
    }
  });

  it('a TRUNCATED pitch never leaves an open ridge slot (the roof op decks the clamp height)', () => {
    // A pitched roof whose box is too short for the slopes to meet: the remaining ridge
    // opening must be decked at the clamp height for BOTH styles and both ridge axes.
    for (const style of ['gable', 'hip'] as const) {
      const resolved = resolveBlocks({
        DataVersion: 3955,
        size: [15, 4, 13],
        palette: [
          { Name: 'minecraft:air' },
          { Name: 'minecraft:oak_stairs', Properties: { facing: 'north', half: 'bottom' } },
          { Name: 'minecraft:oak_planks' },
        ],
        // Only 4 cells of rise over a 15×13 eave — far short of the ~7 a full pitch needs.
        ops: [{ op: 'roof', from: [0, 0, 0], to: [14, 3, 12], state: 1, style, fill: 2 }],
      });
      const solid = new Set(resolved.blocks
        .filter((b) => resolved.palette[b.state]?.Name !== 'minecraft:air')
        .map((b) => b.pos.join(',')));
      let open = 0;
      for (let x = 0; x < 15; x++) {
        for (let z = 0; z < 13; z++) {
          if (![0, 1, 2, 3].some((y) => solid.has(`${x},${y},${z}`))) open++;
        }
      }
      expect(open, `${style}: open cells through the truncated roof`).toBe(0);
    }
  });

  it('digs a MULTI-LEVEL, ENLARGED basement for every type — stacked, ladder-linked, no warnings', () => {
    for (const id of structureTypeIds()) {
      // A tall box so two 6-deep levels + the house fit; a basement footprint WIDER than
      // the house, so the undercroft is excavated beyond the walls and the house centred.
      const size: [number, number, number] = [25, 26, 17];
      const params: Record<string, unknown> = {
        floors: 2,
        seed: 5,
        basement: 'cellar',
        basementHeights: [6, 6],
        basementArea: { w: 23, d: 15 },
        shellSize: { w: 13, d: 11 },
      };
      const authoring: AuthoringStructure = {
        DataVersion: 3955,
        size,
        palette: [{ Name: 'minecraft:air' }],
        ops: [{ op: 'template', name: id, from: [0, 0, 0], to: [size[0] - 1, size[1] - 1, size[2] - 1], params }],
      };
      const resolved = resolveBlocks(authoring);
      const label = `${id} multi-level enlarged basement`;
      // Nothing the params asked for was silently dropped.
      expect(resolved.warnings, `${label}: warnings`).toEqual([]);
      // ONE continuous descent ladder links the deepest level UP to the ground floor (not a
      // stray run that stops mid-way) — the climb reaches the house. Depth 12 + 1 ceiling
      // layer (footprint > house) → groundY = 13.
      const ladderYs = resolved.blocks
        .filter((b) => /:ladder$/.test(resolved.palette[b.state]?.Name ?? ''))
        .map((b) => b.pos[1]);
      expect(ladderYs.length, `${label}: descent ladder`).toBeGreaterThan(0);
      expect(Math.min(...ladderYs), `${label}: ladder starts at the bottom level`).toBeLessThanOrEqual(2);
      expect(Math.max(...ladderYs), `${label}: ladder reaches the ground floor`).toBeGreaterThanOrEqual(13);
      const solid = new Set(
        resolved.blocks
          .filter((b) => resolved.palette[b.state]?.Name && resolved.palette[b.state]?.Name !== 'minecraft:air')
          .map((b) => b.pos.join(',')),
      );
      // The basement is excavated WIDER than the centred house: there's solid stone out at
      // the basement's own edge (x just inside the 23-wide footprint), below grade.
      let belowGradeWide = false;
      const edgeX = Math.floor((size[0] - 23) / 2) + 1; // just inside the basement footprint
      for (let y = 1; y < 12 && !belowGradeWide; y++) {
        for (let z = 2; z < 15 && !belowGradeWide; z++) {
          if (solid.has(`${edgeX},${y},${z}`)) belowGradeWide = true;
        }
      }
      expect(belowGradeWide, `${label}: basement wider than house`).toBe(true);
      // A DEDICATED ceiling deck (the extra layer): the vault top at groundY-1 (y=12) is solid
      // across the footprint, distinct from the ground plane at groundY (y=13) above it, so
      // re-blocking the ceiling never touches the yard/terrain fused on top.
      expect(solid.has(`${edgeX},12,8`), `${label}: dedicated vault ceiling deck`).toBe(true);
    }
  });

  it('a pick that genuinely cannot fit WARNS instead of vanishing (the old silent-skip defect)', () => {
    // A box too short to bury a crypt below the gothic manor → the central composer
    // refuses it loudly, with actionable text.
    const { warnings } = expand('manor', [15, 9, 13], { floors: 1, basement: 'crypt', seed: 1 });
    expect(warnings.join(' ')).toMatch(/basement|crypt/i);
  });
});
