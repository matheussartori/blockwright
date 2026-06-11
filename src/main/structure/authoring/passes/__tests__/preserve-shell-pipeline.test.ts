// Full-pipeline guard for the gothic shell lock: a gutted emit (the AI deleted the
// ground floor) must come out with its floor restored AND survive every later pass
// (placement/stairwell/air-fill), proving `preserveShell` + the rest compose correctly.
import { it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveBlocks } from '../../ops';
import { compileStructure, writeStructureFile, readAuthoring } from '../../index';
import type { ShellLockCell } from '../types';

it('the gothic shell lock restores a gutted floor through the full compile pipeline', async () => {
  const W = 20, H = 16, D = 14;
  const resolved = resolveBlocks({
    DataVersion: 3955,
    size: [W, H, D],
    palette: [{ Name: 'minecraft:air' }],
    ops: [{ op: 'template', name: 'gothic', from: [0, 0, 0], to: [W - 1, H - 1, D - 1], params: { decoration: 'gothic', floors: 2 } }],
  });
  const lockCells: ShellLockCell[] = resolved.blocks
    .filter((b) => resolved.palette[b.state]?.Name !== 'minecraft:air')
    .map((b) => ({ pos: b.pos, entry: resolved.palette[b.state] }));

  // The "model emit": kept the upper floors + furniture, deleted y = 0 (the real defect).
  const gutted = { DataVersion: 3955, size: [W, H, D] as [number, number, number], palette: resolved.palette, blocks: resolved.blocks.filter((b) => b.pos[1] !== 0) };
  const groundSolid = (s: { blocks?: { state: number; pos: [number, number, number] }[]; palette?: { Name: string }[] }) =>
    (s.blocks ?? []).filter((b) => b.pos[1] === 0 && s.palette![b.state].Name !== 'minecraft:air').length;

  // Without the lock the deleted floor stays gone …
  const noLockFile = path.join(tmpdir(), 'bw-gothic-nolock.nbt');
  writeFileSync(noLockFile, compileStructure(gutted, { structureType: 'gothic' }));
  expect(groundSolid(await readAuthoring(noLockFile))).toBeLessThan(W * D * 0.2);

  // … with the lock it is rebuilt and survives the rest of the pipeline.
  const lockFile = path.join(tmpdir(), 'bw-gothic-lock.nbt');
  await writeStructureFile(gutted, lockFile, { structureType: 'gothic', lockCells });
  expect(groundSolid(await readAuthoring(lockFile))).toBeGreaterThan(W * D * 0.5);
});
