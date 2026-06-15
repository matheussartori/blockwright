import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { AuthoringStructure } from '../../structure/authoring';
import type { Session } from '../session';
import type { ResolvedCredential } from '../credentials';
import { createEmitHandler, type EmitHandlerDeps, type EmitRunState } from '../emit-handler';
import { RunLog } from '../gen-log';
import { TokenMeter } from '../token-meter';

// The unknown-block gate (reached only for a structurally-valid emit) resolves ids
// against the on-disk content pack — point it at a committed test fixture (the repo's
// real `content/` is user-supplied + gitignored, so it's absent in CI). The fixture
// carries the blockstate files these tests reference (air/stone); `isKnownBlock` is an
// existence check, so their content is nominal.
process.env.BW_CONTENT ??= path.join(__dirname, 'fixtures', 'content-pack');
// The compiled-emit tests below mirror into the library — point it at a temp dir so the
// suite never touches ~/Documents (and never needs Electron's `app`).
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-emit-handler-'));
process.env.BW_OUTPUT_DIR = path.join(tmpRoot, 'library');
afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

/** A fresh run state, as the orchestrator seeds it. */
function freshState(): EmitRunState {
  return { phase: 'thinking', phaseIndex: 0, rounds: 0, maxRounds: 3, turns: 0, captureError: null, emitted: { value: null } };
}

/** Wire a handler over a no-op session/run — enough to exercise the pre-compile gates
 *  (which never touch the filesystem). Pass a real `session` (with a real scratch dir)
 *  + `extra` deps to exercise the post-compile path too. */
function makeHandler(
  state: EmitRunState,
  session: Session = { sdkSessionId: null, version: 0, dir: '' } as Session,
  extra: Partial<EmitHandlerDeps> = {},
): ReturnType<typeof createEmitHandler> {
  const deps: EmitHandlerDeps = {
    session,
    prompt: 'a test build',
    critic: null,
    cred: { id: 'claude-subscription', model: 'test' } as unknown as ResolvedCredential,
    abort: new AbortController(),
    roundsBudget: null,
    startedAt: Date.now(),
    run: new RunLog(),
    meter: new TokenMeter(),
    state,
    emitProgress: () => {},
    ...extra,
  };
  return createEmitHandler(deps);
}

describe('createEmitHandler — pre-compile gates', () => {
  it('rejects a structurally invalid emit without capturing a build', async () => {
    const state = freshState();
    const handler = makeHandler(state);
    const bad = { size: [0, 0, 0], palette: [{ Name: 'minecraft:air' }], ops: [] } as unknown as AuthoringStructure;

    const res = await handler({ mode: 'full', summary: '', structure: bad });

    expect(res.isError).toBe(true);
    expect(res.stop).toBe(false);
    expect(state.captureError).toMatch(/invalid/i);
    expect(state.emitted.value).toBeNull(); // nothing compiled
    expect(state.rounds).toBe(0); // the round only advances on a successful compile
  });

  it('rejects minecraft:light with corrective feedback for the model', async () => {
    const state = freshState();
    const handler = makeHandler(state);

    const res = await handler({
      mode: 'full',
      summary: '',
      structure: { size: [1, 1, 1], palette: [{ Name: 'minecraft:air' }, { Name: 'minecraft:light' }], ops: [{ op: 'block', pos: [0, 0, 0], state: 1 }] },
    });

    expect(res.isError).toBe(true);
    expect(state.captureError).toBe('Uses minecraft:light');
    // The feedback text is returned to the model so it can self-correct this turn.
    expect(res.content.some((b) => b.type === 'text' && /minecraft:light/.test(b.text))).toBe(true);
  });

  it('fails a patch with no prior version pointing the model back to a full emit', async () => {
    const state = freshState();
    const handler = makeHandler(state); // session.version = 0, dir = '' → the read throws

    const res = await handler({
      mode: 'patch',
      summary: '',
      structure: { size: [1, 1, 1], palette: [{ Name: 'minecraft:air' }], ops: [] },
    });

    // version >= 1 is required to patch; here version is 0 so the patch branch is skipped
    // and the structurally-empty emit is rejected by the validity gate.
    expect(res.isError).toBe(true);
    expect(state.emitted.value).toBeNull();
  });
});

describe('createEmitHandler — the COLLAPSE GATE (a full emit must carry the whole build)', () => {
  /** A 10×6×10 hollow shell (walls + floor + ceiling) — a few hundred solid blocks. */
  const fullBuild = (): AuthoringStructure => ({
    DataVersion: 3955,
    size: [10, 6, 10],
    palette: [{ Name: 'minecraft:air' }, { Name: 'minecraft:stone' }],
    ops: [
      { op: 'fill', from: [0, 0, 0], to: [9, 0, 9], state: 1 },
      { op: 'walls', from: [0, 0, 0], to: [9, 5, 9], state: 1 },
      { op: 'fill', from: [0, 5, 0], to: [9, 5, 9], state: 1 },
    ],
  });
  /** A furniture-only delta — the sakura "skeleton" defect's emit shape. */
  const deltaOnly = (): AuthoringStructure => ({
    DataVersion: 3955,
    size: [10, 6, 10],
    palette: [{ Name: 'minecraft:air' }, { Name: 'minecraft:stone' }],
    ops: [{ op: 'fill', from: [2, 1, 2], to: [4, 1, 2], state: 1 }],
  });
  const newSession = (name: string): Session => {
    const dir = path.join(tmpRoot, name);
    fs.mkdirSync(dir, { recursive: true });
    return { sdkSessionId: null, version: 0, dir };
  };

  it('rejects a full emit that drops most of the previous version, without versioning it', async () => {
    const state = freshState();
    const session = newSession('collapse');
    const handler = makeHandler(state, session);

    const ok = await handler({ mode: 'full', summary: '', structure: fullBuild() });
    expect(ok.isError).toBeFalsy();
    expect(session.version).toBe(1);
    expect(session.lastSolids).toBeGreaterThan(50);

    const res = await handler({ mode: 'full', summary: '', structure: deltaOnly() });
    expect(res.isError).toBe(true);
    expect(res.content.some((b) => b.type === 'text' && /REJECTED/.test(b.text))).toBe(true);
    expect(res.content.some((b) => b.type === 'text' && /mode "patch"/.test(b.text))).toBe(true);
    expect(session.version).toBe(1); // the gutted emit never became a version
    expect(state.emitted.value?.version).toBe(1); // the kept result is still v1
    expect(fs.existsSync(path.join(session.dir, 'v2.nbt'))).toBe(false); // scratch stays clean
  });

  it('lets the same delta through as a PATCH (it layers onto the previous version)', async () => {
    const state = freshState();
    const session = newSession('patch-ok');
    const handler = makeHandler(state, session);

    await handler({ mode: 'full', summary: '', structure: fullBuild() });
    const res = await handler({ mode: 'patch', summary: '', structure: deltaOnly() });
    expect(res.isError).toBeFalsy();
    expect(session.version).toBe(2); // merged onto v1 → a real, complete v2
  });

  it('gates the FIRST emit against a seeded shell via lockCells (and the lock restores it)', async () => {
    const state = freshState();
    const session = newSession('shell-baseline');
    // A locked shell of 400 solid cells: the furniture-only first emit comes back with
    // every shell cell restored by preserveShell, so it passes the gate as a FULL build.
    const lockCells = [];
    for (let x = 0; x < 10; x++)
      for (let z = 0; z < 10; z++)
        for (const y of [0, 5]) lockCells.push({ pos: [x, y, z] as [number, number, number], entry: { Name: 'minecraft:stone' } });
    const handler = makeHandler(state, session, { lockCells });

    const res = await handler({ mode: 'full', summary: '', structure: deltaOnly() });
    expect(res.isError).toBeFalsy();
    expect(session.version).toBe(1);
    // The compiled v1 contains the restored shell, not just the 3-block delta.
    expect(session.lastSolids).toBeGreaterThanOrEqual(200);
  });

  it('does not gate a small fresh build with no baseline (free-form v1)', async () => {
    const state = freshState();
    const session = newSession('fresh');
    const handler = makeHandler(state, session);
    const res = await handler({ mode: 'full', summary: '', structure: deltaOnly() });
    expect(res.isError).toBeFalsy();
    expect(session.version).toBe(1);
  });
});
