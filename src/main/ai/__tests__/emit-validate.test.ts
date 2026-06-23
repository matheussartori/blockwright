import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AuthoringStructure } from '../../structure/authoring';
import { validateEmit } from '../emit-validate';

// The unknown-block gate resolves ids against the on-disk content pack; point it at a
// committed test fixture (the repo's real `content/` is user-supplied + gitignored, so
// it's absent in CI). The fixture only carries the blockstate files these tests need —
// `isKnownBlock` is an existence check, so their content is nominal. Lazily read by
// contentDir(), so setting it before the tests run suffices.
process.env.BW_CONTENT ??= path.join(__dirname, 'fixtures', 'content-pack');

describe('validateEmit', () => {
  it('accepts a structurally valid build of real blocks', () => {
    const ok: AuthoringStructure = {
      size: [1, 1, 1],
      palette: [{ Name: 'minecraft:air' }, { Name: 'minecraft:stone' }],
      ops: [{ op: 'block', pos: [0, 0, 0], state: 1 }],
    };
    expect(validateEmit(ok)).toBeNull();
  });

  it('rejects a structurally invalid build with a corrective message', () => {
    const bad = { size: [0, 0, 0], palette: [{ Name: 'minecraft:air' }], ops: [] } as unknown as AuthoringStructure;
    const r = validateEmit(bad);
    expect(r?.reason).toMatch(/was invalid/);
    expect(r?.feedback).toMatch(/Re-emit a corrected structure/);
  });

  it('rejects minecraft:light (invisible, command-only)', () => {
    const r = validateEmit({
      size: [1, 1, 1],
      palette: [{ Name: 'minecraft:air' }, { Name: 'minecraft:light' }],
      ops: [{ op: 'block', pos: [0, 0, 0], state: 1 }],
    });
    expect(r?.reason).toBe('Uses minecraft:light');
    expect(r?.feedback).toMatch(/Do not use "minecraft:light"/);
  });

  it('rejects unknown/misspelled block ids', () => {
    const r = validateEmit({
      size: [1, 1, 1],
      palette: [{ Name: 'minecraft:air' }, { Name: 'minecraft:not_a_real_block_xyz' }],
      ops: [{ op: 'block', pos: [0, 0, 0], state: 1 }],
    });
    expect(r?.reason).toMatch(/Unknown block ID/);
    expect(r?.reason).toContain('minecraft:not_a_real_block_xyz');
  });

  it('does NOT flag blocks in an unverifiable namespace (no assets to check) — so a pack-less first run still generates', () => {
    const r = validateEmit({
      size: [1, 1, 1],
      palette: [{ Name: 'minecraft:air' }, { Name: 'unknownmod:some_block' }],
      ops: [{ op: 'block', pos: [0, 0, 0], state: 1 }],
    });
    expect(r).toBeNull();
  });

  it('runs the gates in order: validity is reported before the block-id check', () => {
    // A structure that is BOTH invalid and uses an unknown block reports the
    // structural failure first (so the model fixes the shape before the ids).
    const bad = { size: [1, 1], palette: [{ Name: 'minecraft:bogus' }], ops: [] } as unknown as AuthoringStructure;
    expect(validateEmit(bad)?.reason).toMatch(/was invalid/);
  });
});
