import { describe, expect, it } from 'vitest';
import { paramFields, resolveParams, type ParamSpec } from '../params';

const spec: ParamSpec = {
  floors: { kind: 'int', default: 1, min: 1, max: 4, label: 'Floors' },
  decay: { kind: 'unit', default: 0, label: 'Decay' },
  attic: { kind: 'enum', default: 'none', values: ['none', 'loft'], labels: { none: 'None', loft: 'Loft' }, label: 'Attic' },
  roof: { kind: 'enum', default: 'gable', values: ['gable', 'hip'], module: 'roof' },
};

describe('resolveParams', () => {
  it('applies defaults when a param is absent', () => {
    expect(resolveParams(spec, {})).toEqual({ floors: 1, decay: 0, attic: 'none', roof: 'gable' });
  });

  it('clamps an int to its bounds and truncates', () => {
    expect(resolveParams(spec, { floors: 9 }).floors).toBe(4);
    expect(resolveParams(spec, { floors: 0 }).floors).toBe(1);
    expect(resolveParams(spec, { floors: 2.9 }).floors).toBe(2);
  });

  it('falls back to default for a non-numeric int', () => {
    expect(resolveParams(spec, { floors: 'lots' }).floors).toBe(1);
  });

  it('clamps a unit param to [0, 1]', () => {
    expect(resolveParams(spec, { decay: 2 }).decay).toBe(1);
    expect(resolveParams(spec, { decay: -1 }).decay).toBe(0);
    expect(resolveParams(spec, { decay: 0.5 }).decay).toBe(0.5);
  });

  it('accepts only valid enum values, else the default', () => {
    expect(resolveParams(spec, { attic: 'loft' }).attic).toBe('loft');
    expect(resolveParams(spec, { attic: 'penthouse' }).attic).toBe('none');
  });

  it('ignores keys not in the spec (theme ids, role overrides)', () => {
    const out = resolveParams(spec, { decoration: 'cozy', 'minecraft:wall': 'x' });
    expect(out).not.toHaveProperty('decoration');
    expect(out).not.toHaveProperty('minecraft:wall');
  });
});

describe('paramFields', () => {
  it('projects int and enum params into Details controls', () => {
    const fields = paramFields(spec);
    const floors = fields.find((f) => f.name === 'floors');
    expect(floors).toMatchObject({ kind: 'int', label: 'Floors', default: 1, min: 1, max: 4 });
    const attic = fields.find((f) => f.name === 'attic');
    expect(attic).toMatchObject({ kind: 'enum', label: 'Attic' });
    expect(attic && 'options' in attic && attic.options).toEqual([
      { value: 'none', label: 'None' },
      { value: 'loft', label: 'Loft' },
    ]);
  });

  it('omits unit params (they belong to the decoration)', () => {
    expect(paramFields(spec).some((f) => f.name === 'decay')).toBe(false);
  });

  it('omits module-marked params (surfaced as their own category select)', () => {
    expect(paramFields(spec).some((f) => f.name === 'roof')).toBe(false);
  });

  it('falls back to the param name when no label is set', () => {
    const fields = paramFields({ width: { kind: 'int', default: 5, min: 1, max: 9 } });
    expect(fields[0].label).toBe('width');
  });
});
