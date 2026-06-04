// The design-pass / audit gate: given where the model is in the pass sequence and
// the audit verdict for this round, decide the feedback to send back and whether the
// driver must stop. Kept PURE (no I/O — the orchestrator does the critic call,
// screenshot capture and content assembly) so the gate logic is unit-tested.
import { auditChecklistText, phaseAt, phaseBriefing } from './phases';

/** The audit verdict the orchestrator gathered this round (from the independent
 *  critic when available, else the model's self-reported checklist). */
export interface AuditVerdict {
  /** A usable verdict was produced (clean or with failures). */
  reported: boolean;
  /** The failing checklist items (empty = clean). */
  failed: { label: string; note: string }[];
  /** True when the verdict is the model's own self-report (no independent critic). */
  bySelf: boolean;
}

export interface GateInput {
  /** The pass just emitted was the final (audit) pass. */
  onAudit: boolean;
  /** The hard round cap was reached — force a stop regardless of the verdict. */
  atCap: boolean;
  rounds: number;
  maxRounds: number;
  /** The pass to brief next (already advanced + clamped at audit). */
  nextPhaseIndex: number;
  verdict: AuditVerdict;
}

/** Decide the feedback message + whether the driver must stop. The audit pass is
 *  gated: the run only stops once the verdict is clean (or the cap is hit); every
 *  earlier pass briefs the next one. */
export function auditGateFeedback({ onAudit, atCap, rounds, maxRounds, nextPhaseIndex, verdict }: GateInput): {
  text: string;
  stop: boolean;
} {
  if (atCap) {
    return {
      text: `This is the final allowed revision (round ${rounds}/${maxRounds}). Do NOT call emit_structure again — finish now.`,
      stop: true,
    };
  }
  if (onAudit && !verdict.reported) {
    return {
      text:
        'AUDIT pass. Evaluate the build against EACH checklist item below and report your verdict in the ' +
        '"audit" field (one { check, ok, note } per item, judged against the screenshots). Patch anything you ' +
        `mark not ok, then re-emit and re-report.\n${auditChecklistText()}`,
      stop: false,
    };
  }
  if (onAudit && verdict.failed.length > 0) {
    const lines = verdict.failed.map((f) => `• ${f.label}${f.note ? `: ${f.note}` : ''}`).join('\n');
    const who = verdict.bySelf ? 'Your audit lists' : 'An INDEPENDENT reviewer flagged';
    return {
      text: `${who} ${verdict.failed.length} open issue(s). Fix EACH with a "patch", then re-emit — do not stop while any item is open:\n${lines}`,
      stop: false,
    };
  }
  if (onAudit) {
    return {
      text: verdict.bySelf
        ? 'Audit clean — every check passes. Finalize the build; do not call emit_structure again.'
        : 'An independent reviewer approved the build — every check passes. Finalize; do not call emit_structure again.',
      stop: true,
    };
  }
  return {
    text:
      `Good — now the next pass. ${phaseBriefing(nextPhaseIndex)} Apply ONLY this pass (keep everything else ` +
      `that already works), then call emit_structure with phase="${phaseAt(nextPhaseIndex).id}". Fix any glaring ` +
      'problem from an earlier pass at the same time if you spot one.',
    stop: false,
  };
}
