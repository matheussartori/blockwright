import { describe, expect, it } from 'vitest';
import { auditGateFeedback, type AuditVerdict } from '../audit-gate';

const clean: AuditVerdict = { reported: true, failed: [], bySelf: false };
const base = { rounds: 3, maxRounds: 8, nextPhaseIndex: 2 };

describe('auditGateFeedback', () => {
  it('stops at the hard round cap regardless of pass/verdict', () => {
    const g = auditGateFeedback({ ...base, onAudit: false, atCap: true, verdict: clean });
    expect(g.stop).toBe(true);
    expect(g.text).toMatch(/final allowed revision/);
  });

  it('briefs the next pass (no stop) on a non-audit pass', () => {
    const g = auditGateFeedback({ ...base, onAudit: false, atCap: false, verdict: clean });
    expect(g.stop).toBe(false);
    expect(g.text).toMatch(/now the next pass/);
  });

  it('demands the checklist (no stop) when the audit pass has no verdict yet', () => {
    const g = auditGateFeedback({ ...base, onAudit: true, atCap: false, verdict: { reported: false, failed: [], bySelf: true } });
    expect(g.stop).toBe(false);
    expect(g.text).toMatch(/AUDIT pass/);
  });

  it('keeps going (no stop) while the audit lists open issues', () => {
    const g = auditGateFeedback({
      ...base, onAudit: true, atCap: false,
      verdict: { reported: true, bySelf: false, failed: [{ label: 'Roof', note: 'floating slab' }] },
    });
    expect(g.stop).toBe(false);
    expect(g.text).toMatch(/INDEPENDENT reviewer flagged/);
    expect(g.text).toMatch(/Roof: floating slab/);
  });

  it('stops when the audit verdict is clean', () => {
    expect(auditGateFeedback({ ...base, onAudit: true, atCap: false, verdict: clean }).stop).toBe(true);
    const self = auditGateFeedback({ ...base, onAudit: true, atCap: false, verdict: { reported: true, failed: [], bySelf: true } });
    expect(self.stop).toBe(true);
    expect(self.text).toMatch(/Audit clean/);
  });
});
