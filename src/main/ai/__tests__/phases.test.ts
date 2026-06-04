import { describe, expect, it } from 'vitest';
import {
  advancePhase, AUDIT_CHECKS, auditChecklistText, isLastPhase, PHASES, phaseAt, phaseBriefing,
  phaseIndexOf, phaseOverview, summarizeAudit,
} from '../phases';

describe('PHASES', () => {
  it('is the expected ordered design sequence', () => {
    expect(PHASES.map((p) => p.id)).toEqual([
      'massing', 'roof', 'facade', 'interior', 'circulation', 'audit',
    ]);
  });

  it('starts with a full massing pass and patches the rest', () => {
    expect(PHASES[0].mode).toBe('full');
    expect(PHASES.slice(1).every((p) => p.mode === 'patch')).toBe(true);
  });
});

describe('advancePhase / isLastPhase', () => {
  it('advances one pass at a time and clamps at the terminal audit pass', () => {
    expect(advancePhase(0)).toBe(1);
    expect(advancePhase(PHASES.length - 1)).toBe(PHASES.length - 1);
    expect(advancePhase(999)).toBe(PHASES.length - 1);
  });

  it('flags only the last pass as terminal', () => {
    expect(isLastPhase(0)).toBe(false);
    expect(isLastPhase(PHASES.length - 1)).toBe(true);
    expect(isLastPhase(999)).toBe(true);
  });
});

describe('phaseAt / phaseIndexOf', () => {
  it('clamps out-of-range indices', () => {
    expect(phaseAt(-5).id).toBe('massing');
    expect(phaseAt(999).id).toBe('audit');
  });

  it('resolves ids and rejects unknown/undefined', () => {
    expect(phaseIndexOf('facade')).toBe(2);
    expect(phaseIndexOf('nope')).toBe(-1);
    expect(phaseIndexOf(undefined)).toBe(-1);
  });
});

describe('phaseBriefing / phaseOverview', () => {
  it('briefs every pass with its label and mode', () => {
    PHASES.forEach((p, i) => {
      const brief = phaseBriefing(i);
      expect(brief).toContain(p.label.toUpperCase());
      expect(brief).toContain(`"${p.mode}"`);
      expect(brief.length).toBeGreaterThan(40);
    });
  });

  it('overview names every pass', () => {
    const ov = phaseOverview();
    for (const p of PHASES) expect(ov).toContain(p.label);
  });
});

describe('summarizeAudit', () => {
  it('treats a missing/empty checklist as not reported and not ok', () => {
    expect(summarizeAudit(undefined)).toEqual({ reported: false, allOk: false, failed: [] });
    expect(summarizeAudit([])).toEqual({ reported: false, allOk: false, failed: [] });
  });

  it('passes when every item is ok', () => {
    const r = summarizeAudit(AUDIT_CHECKS.map((c) => ({ check: c.id, ok: true })));
    expect(r.reported).toBe(true);
    expect(r.allOk).toBe(true);
    expect(r.failed).toHaveLength(0);
  });

  it('collects failing items with their label and note', () => {
    const r = summarizeAudit([
      { check: 'roof', ok: false, note: 'floating slab' },
      { check: 'facade', ok: true },
      { check: 'circulation', ok: false },
    ]);
    expect(r.reported).toBe(true);
    expect(r.allOk).toBe(false);
    expect(r.failed.map((f) => f.id).sort()).toEqual(['circulation', 'roof']);
    expect(r.failed.find((f) => f.id === 'roof')?.label).toBe('Roof');
    expect(r.failed.find((f) => f.id === 'roof')?.note).toBe('floating slab');
  });
});

describe('auditChecklistText', () => {
  it('lists every audit check', () => {
    const text = auditChecklistText();
    for (const c of AUDIT_CHECKS) expect(text).toContain(c.label);
  });
});
