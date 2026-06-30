import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildShellSeed } from '../shell-seed';
import { getStructureType, structureTypeIds } from '../../structure/domain';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-shell-seed-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('buildShellSeed', () => {
  it('every seedShell archetype seeds a shell AND locks it (no unlocked seeds — the sakura "skeleton" defect)', async () => {
    const seeded = structureTypeIds().filter((id) => getStructureType(id)?.seedShell);
    // EVERY house type seeds now — the classic included (its variety is in the shell's
    // own seed, not in free-form).
    expect(seeded).toEqual(expect.arrayContaining(['cottage', 'villa', 'farmhouse', 'raised-cottage', 'manor', 'church']));
    for (const id of seeded) {
      const shell = await buildShellSeed(
        { structureType: id, size: [15, 14, 13] },
        path.join(tmp, id),
      );
      expect(shell.preamble, id).toContain('STARTING SHELL');
      // The compiled shell's solid cells are protected on EVERY emit — a furniture-only
      // emit can no longer delete the exterior.
      expect(shell.lockCells?.length ?? 0, `${id} must lock its shell`).toBeGreaterThan(100);
    }
  });

  it('no structure selected → no seed (free-form is the no-pick path)', async () => {
    const shell = await buildShellSeed({ size: [11, 13, 9] }, path.join(tmp, 'no-pick'));
    expect(shell.preamble).toBe('');
    expect(shell.lockCells).toBeUndefined();
  });

  it('threads the per-floor heights into the compiled shell', async () => {
    // Same type + box, different floor heights → a different shell (the ladder moved the decks).
    const a = await buildShellSeed({ structureType: 'farmhouse', size: [17, 16, 13], floorHeights: [7, 4] }, path.join(tmp, 'fh-a'));
    const b = await buildShellSeed({ structureType: 'farmhouse', size: [17, 16, 13], floorHeights: [4, 7] }, path.join(tmp, 'fh-b'));
    expect(a.preamble).not.toBe(b.preamble);
  });
});
