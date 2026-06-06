import { describe, expect, it } from 'vitest';
import type { ModuleMeta } from '../modules';
import { createRegistry } from '../registry';

const mod = (id: string, over: Partial<ModuleMeta> = {}): ModuleMeta => ({
  id,
  label: id.toUpperCase(),
  category: 'structure',
  description: '',
  ...over,
});

describe('createRegistry', () => {
  it('looks modules up by id', () => {
    const r = createRegistry([mod('a'), mod('b')]);
    expect(r.get('a')?.label).toBe('A');
    expect(r.get('missing')).toBeUndefined();
  });

  it('reports membership and ids in insertion order', () => {
    const r = createRegistry([mod('a'), mod('b')]);
    expect(r.has('a')).toBe(true);
    expect(r.has('z')).toBe(false);
    expect(r.ids()).toEqual(['a', 'b']);
  });

  it('returns every raw module via all()', () => {
    const r = createRegistry([mod('a'), mod('b')]);
    expect(r.all().map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('projects modules to renderer summaries via list()', () => {
    const r = createRegistry([
      mod('a', { preview: { size: [1, 1, 1] }, appliesTo: ['house'] }),
      mod('b'),
    ]);
    expect(r.list()).toEqual([
      { id: 'a', label: 'A', category: 'structure', description: '', hasPreview: true, appliesTo: ['house'] },
      { id: 'b', label: 'B', category: 'structure', description: '', hasPreview: false, appliesTo: undefined },
    ]);
  });

  it('lets a later duplicate id win (last registration overrides)', () => {
    const r = createRegistry([mod('a', { label: 'first' }), mod('a', { label: 'second' })]);
    expect(r.get('a')?.label).toBe('second');
    expect(r.ids()).toEqual(['a']);
  });
});
