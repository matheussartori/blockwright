import { describe, expect, it } from 'vitest';
import { TokenMeter } from '../token-meter';

describe('TokenMeter', () => {
  it('accumulates input tokens across turns', () => {
    const m = new TokenMeter();
    m.startTurn();
    m.addInput(100);
    m.endTurn();
    m.startTurn();
    m.addInput(50);
    expect(m.inputTokens).toBe(150);
  });

  it('blends the current turn output from the max of chars/4 and thinking', () => {
    const m = new TokenMeter();
    m.startTurn();
    m.setThinking(80);
    expect(m.displayedOutput()).toBe(80); // thinking dominates so far
    m.addOutputChars(400); // 400/4 = 100 > 80
    expect(m.displayedOutput()).toBe(100);
  });

  it('keeps the running output estimate monotonic within a turn', () => {
    const m = new TokenMeter();
    m.startTurn();
    m.setOutputTokens(120);
    m.addOutputChars(40); // 10 — must not lower the estimate
    expect(m.displayedOutput()).toBe(120);
  });

  it('commits the turn output and resets the per-turn counters on endTurn', () => {
    const m = new TokenMeter();
    m.startTurn();
    m.setOutputTokens(120);
    m.endTurn();
    expect(m.displayedOutput()).toBe(120); // committed
    m.startTurn();
    expect(m.displayedOutput()).toBe(120); // fresh turn adds nothing yet
    m.setOutputTokens(30);
    expect(m.displayedOutput()).toBe(150); // committed + current
  });

  it('folds external usage (the critic) into the totals', () => {
    const m = new TokenMeter();
    m.startTurn();
    m.addInput(200);
    m.setOutputTokens(100);
    m.endTurn();
    m.addExternal(40, 25);
    expect(m.totals()).toEqual({ tokensIn: 240, tokensOut: 125 });
  });
});
