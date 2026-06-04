import { describe, expect, it } from 'vitest';
import { criticSystemPrompt, parseCritique } from '../critic';

describe('parseCritique', () => {
  it('parses a clean JSON array of failing items', () => {
    const r = parseCritique('[{"check":"roof","note":"floating slab over the ridge"},{"check":"facade","note":"window jammed left"}]');
    expect(r.failed.map((f) => f.check)).toEqual(['roof', 'facade']);
    expect(r.failed[0].note).toBe('floating slab over the ridge');
  });

  it('tolerates code fences and surrounding prose', () => {
    const r = parseCritique('Here are the issues:\n```json\n[{"check":"circulation","note":"stair in front of door"}]\n```\nThat is all.');
    expect(r.failed).toEqual([{ check: 'circulation', note: 'stair in front of door' }]);
  });

  it('treats an empty array as a clean pass', () => {
    expect(parseCritique('[]').failed).toEqual([]);
  });

  it('returns no findings for garbage / non-JSON', () => {
    expect(parseCritique('the build looks great!').failed).toEqual([]);
    expect(parseCritique('').failed).toEqual([]);
  });

  it('drops unknown check ids and malformed entries', () => {
    const r = parseCritique('[{"check":"roof","note":"ok"},{"check":"nonsense","note":"x"},42,null,{"note":"no check"}]');
    expect(r.failed).toEqual([{ check: 'roof', note: 'ok' }]);
  });
});

describe('criticSystemPrompt', () => {
  it('is adversarial and JSON-only', () => {
    const p = criticSystemPrompt();
    expect(p).toMatch(/INDEPENDENT/);
    expect(p).toMatch(/did NOT build/);
    expect(p).toMatch(/JSON array/);
  });
});
