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
  });
});
