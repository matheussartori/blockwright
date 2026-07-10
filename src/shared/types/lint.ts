// Structure-linter contracts: the per-file findings main's `structure/lint.ts`
// produces and the renderer's Lint panel displays (and the Doctor re-reports as
// workspace findings). Type-only — the rules live in main.

/** Every finding code the linter can emit. Each has a `lint.issue.<code>` string
 *  (en + pt-BR) and, when it reaches the Doctor, a matching `doctor.issue.<code>`. */
export type LintCode =
  | 'suspect_air'
  | 'block_out_of_range'
  | 'orphan_palette'
  | 'bad_data_marker';

export interface LintFinding {
  level: 'error' | 'warning';
  code: LintCode;
  /** Interpolated into the localized message (a block id, a count…). */
  detail?: string;
  /** Structure-local cell to reveal in the viewer (absent = not positional). */
  pos?: [number, number, number];
}

export interface LintReport {
  findings: LintFinding[];
}
