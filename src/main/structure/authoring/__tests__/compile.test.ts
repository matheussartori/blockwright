import { describe, expect, it } from 'vitest';
import { compileStructureReport } from '../compile';
import type { AuthoringStructure } from '../types';

describe('compileStructureReport — pipeline wiring', () => {
  it('produces a gzipped buffer and runs the placement pass', () => {
    const s: AuthoringStructure = {
      size: [3, 5, 3],
      palette: [{ Name: 'minecraft:stone' }, { Name: 'minecraft:lantern' }],
      ops: [
        { op: 'fill', from: [0, 0, 0], to: [2, 0, 2], state: 0 }, // floor
        { op: 'block', pos: [1, 3, 1], state: 1 },                // lantern floating above the floor
      ],
    };
    const { buffer, report } = compileStructureReport(s);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer[0]).toBe(0x1f); // gzip magic byte
    expect(report.fixes.join(' ')).toMatch(/lantern/);
    // The report exposes the FINAL post-pass result, so callers never re-expand ops:
    // the floating lantern was removed, so no lantern survives in the final blocks.
    expect(report.blocks.length).toBeGreaterThan(0);
    expect(report.blocks.some((b) => report.palette[b.state]?.Name === 'minecraft:lantern')).toBe(false);
  });

  it('warns when the selected basement cannot fit the build box (instead of dropping it silently)', () => {
    // H=9 → a 4-block vault leaves only 5 above (< 6): the crypt is skipped with a warning.
    const s: AuthoringStructure = {
      size: [13, 9, 11],
      palette: [{ Name: 'minecraft:air' }],
      ops: [{ op: 'template', name: 'modern', from: [0, 0, 0], to: [12, 8, 10], params: { basement: 'crypt' } }],
    };
    const { report } = compileStructureReport(s, { structureType: 'modern' });
    expect(report.warnings.join(' ')).toMatch(/basement/i);
    expect(report.warnings.join(' ')).toMatch(/too short/i);
  });

  it('warns about an unknown basement module id', () => {
    const s: AuthoringStructure = {
      size: [13, 12, 11],
      palette: [{ Name: 'minecraft:air' }],
      ops: [{ op: 'template', name: 'modern', from: [0, 0, 0], to: [12, 11, 10], params: { basement: 'dungeon' } }],
    };
    const { report } = compileStructureReport(s, { structureType: 'modern' });
    expect(report.warnings.join(' ')).toMatch(/unknown basement/i);
  });
});
