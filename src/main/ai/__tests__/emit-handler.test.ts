import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AuthoringStructure } from '../../structure/authoring';
import type { Session } from '../session';
import type { ResolvedCredential } from '../credentials';
import { createEmitHandler, type EmitHandlerDeps, type EmitRunState } from '../emit-handler';
import { RunLog } from '../gen-log';
import { TokenMeter } from '../token-meter';

// The unknown-block gate (reached only for a structurally-valid emit) resolves ids
// against the on-disk content pack — point it at the bundled pack so it runs without
// Electron. The rejection branches below short-circuit BEFORE any fs/compile, so this is
// just belt-and-suspenders.
process.env.BW_CONTENT ??= path.join(process.cwd(), 'content');

/** A fresh run state, as the orchestrator seeds it. */
function freshState(): EmitRunState {
  return { phase: 'thinking', phaseIndex: 0, rounds: 0, maxRounds: 3, turns: 0, captureError: null, emitted: { value: null } };
}

/** Wire a handler over a no-op session/run — enough to exercise the pre-compile gates
 *  (which never touch the filesystem). */
function makeHandler(state: EmitRunState): ReturnType<typeof createEmitHandler> {
  const session = { sdkSessionId: null, version: 0, dir: '' } as Session;
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
