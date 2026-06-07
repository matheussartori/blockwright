// Live token accounting for a generation run. Input tokens accumulate across turns
// (including cached context). Output is the committed total from finished turns plus
// the CURRENT turn's running estimate — which during extended thinking comes from the
// thinking-token count, and during tool output from a chars/4 estimate (since the API
// only reports the real output count at turn end). The displayed output blends the
// two so the live counter always moves.
//
// Pure number-keeping, extracted from generate.ts so the blend logic is unit-tested;
// the orchestrator owns phase/turn labels, logging and the progress emit cadence and
// just drives this from the driver's streaming callbacks.

/** Snapshot of the run's token totals, attached to every generation result branch. */
export interface TokenTotals {
  tokensIn: number;
  tokensOut: number;
}

export class TokenMeter {
  private input = 0;
  private committed = 0;
  private current = 0;
  private thinking = 0;

  /** Begin a new turn: reset the per-turn running counters. */
  startTurn(): void {
    this.current = 0;
    this.thinking = 0;
  }

  /** Add prompt (input) tokens for the current turn (includes cached context). */
  addInput(tokens: number): void {
    this.input += tokens;
  }

  /** Update the current turn's thinking-token count (the live output estimate while
   *  the model is in extended thinking). */
  setThinking(tokens: number): void {
    this.thinking = tokens;
  }

  /** Update the current turn's output estimate from the streamed tool-JSON length
   *  (chars/4); monotonic within the turn. */
  addOutputChars(totalChars: number): void {
    this.current = Math.max(this.current, Math.round(totalChars / 4));
  }

  /** Update the current turn's output from a reported token count; monotonic. */
  setOutputTokens(tokens: number): void {
    this.current = Math.max(this.current, tokens);
  }

  /** Commit the current turn's output into the running total and reset the per-turn
   *  counters (the turn's final blended output is locked in). */
  endTurn(): void {
    this.committed += Math.max(this.current, this.thinking);
    this.current = 0;
    this.thinking = 0;
  }

  /** Fold an out-of-band call's usage (e.g. the independent critic) into the totals. */
  addExternal(tokensIn: number, tokensOut: number): void {
    this.input += tokensIn;
    this.committed += tokensOut;
  }

  /** The prompt (input) token total so far. */
  get inputTokens(): number {
    return this.input;
  }

  /** The output to display: committed turns plus the current turn's running estimate
   *  (thinking estimate during thinking, chars/4 during building). */
  displayedOutput(): number {
    return this.committed + Math.max(this.current, this.thinking);
  }

  /** The current totals, for the result footer (time + tokens). */
  totals(): TokenTotals {
    return { tokensIn: this.input, tokensOut: this.displayedOutput() };
  }
}
