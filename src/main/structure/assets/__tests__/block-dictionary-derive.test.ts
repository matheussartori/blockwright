import { describe, expect, it } from 'vitest';
import {
  MAX_INJECTED,
  formatModBlockSection,
  guessRole,
  humanize,
  propsFromState,
  type GuideEntry,
} from '../block-dictionary-derive';

describe('humanize', () => {
  it('title-cases an underscored id', () => {
    expect(humanize('ashen_brick')).toBe('Ashen Brick');
    expect(humanize('cursed_lantern')).toBe('Cursed Lantern');
  });
});

describe('guessRole', () => {
  it('infers a role from the id suffix/keywords', () => {
    expect(guessRole('ashen_stairs')).toBe('roof');
    expect(guessRole('bone_glass_pane')).toBe('window');
    expect(guessRole('cursed_lantern')).toBe('light');
    expect(guessRole('blood_brick')).toBe('wall');
  });
  it('returns null when nothing matches', () => {
    expect(guessRole('mysterious_widget')).toBeNull();
  });
});

describe('propsFromState', () => {
  it('collects props from variant keys', () => {
    const props = propsFromState({
      variants: { 'facing=north,half=bottom': {}, 'facing=south,half=top': {} },
    });
    expect(new Set(props.facing)).toEqual(new Set(['north', 'south']));
    expect(new Set(props.half)).toEqual(new Set(['bottom', 'top']));
  });
  it('collects props from multipart when-clauses incl. OR and a|b values', () => {
    const props = propsFromState({
      multipart: [{ when: { OR: [{ north: 'true' }, { facing: 'east|west' }] } }],
    });
    expect(props.north).toEqual(['true']);
    expect(new Set(props.facing)).toEqual(new Set(['east', 'west']));
  });
  it('is empty for a null state', () => {
    expect(propsFromState(null)).toEqual({});
  });
});

describe('formatModBlockSection', () => {
  const entry = (id: string, extra: Partial<GuideEntry> = {}): GuideEntry => ({ id, props: {}, ...extra });

  it('returns empty when scope is off', () => {
    expect(formatModBlockSection('mymod', 'off', [entry('mymod:a')])).toBe('');
  });
  it('returns empty when there are no entries', () => {
    expect(formatModBlockSection('mymod', 'mix', [])).toBe('');
  });
  it('renders id, role, description and props', () => {
    const out = formatModBlockSection('mymod', 'mix', [
      entry('mymod:blood_brick', { role: 'wall', description: 'glows faintly', props: { facing: ['north', 'south'] } }),
    ]);
    expect(out).toContain('namespace `mymod`');
    expect(out).toContain('- `mymod:blood_brick` (role: wall) — glows faintly [props: facing=north|south]');
  });
  it('uses a stronger steer for "prefer"', () => {
    expect(formatModBlockSection('mymod', 'prefer', [entry('mymod:a')])).toContain('PREFER these mod blocks');
    expect(formatModBlockSection('mymod', 'mix', [entry('mymod:a')])).toContain('available ALONGSIDE vanilla');
  });
  it('sorts annotated blocks first and caps the set', () => {
    const many: GuideEntry[] = Array.from({ length: MAX_INJECTED + 5 }, (_, i) => entry(`mymod:plain_${String(i).padStart(3, '0')}`));
    many.push(entry('mymod:zzz_special', { description: 'the one that matters' }));
    const out = formatModBlockSection('mymod', 'mix', many);
    // The annotated one survives the cap despite sorting last alphabetically.
    expect(out).toContain('mymod:zzz_special');
    expect(out).toContain('more not shown.');
  });
});
