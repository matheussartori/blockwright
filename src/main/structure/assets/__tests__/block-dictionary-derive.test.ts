import { describe, expect, it } from 'vitest';
import {
  MAX_INJECTED,
  buildRolePalette,
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

describe('buildRolePalette', () => {
  it('maps annotated roles, first candidate per role winning', () => {
    const map = buildRolePalette([
      { id: 'm:a', role: 'wall' },
      { id: 'm:b', role: 'wall' }, // loses — a came first
      { id: 'm:c', role: 'floor' },
    ]);
    expect(map).toEqual({ wall: 'm:a', floor: 'm:c' });
  });

  it('prefer fills unannotated roles from the heuristic guess, never overriding an annotation', () => {
    const map = buildRolePalette([
      { id: 'm:planks', guessed: 'wall' },
      { id: 'm:special', role: 'wall' }, // the annotation wins for wall…
      { id: 'm:stairs', guessed: 'roof' }, // …and a guess fills roof
    ]);
    expect(map.wall).toBe('m:special');
    expect(map.roof).toBe('m:stairs');
  });

  it('mix (annotatedOnly) ignores heuristic guesses entirely', () => {
    const map = buildRolePalette([{ id: 'm:planks', guessed: 'wall' }, { id: 'm:x', role: 'floor' }], true);
    expect(map).toEqual({ floor: 'm:x' });
  });
});

describe('formatModBlockSection', () => {
  const entry = (id: string, extra: Partial<GuideEntry> = {}): GuideEntry => ({ id, props: {}, ...extra });

  it('renders the primary role→block palette when one is supplied', () => {
    const out = formatModBlockSection('mymod', 'prefer', [entry('mymod:a', { role: 'wall' })], { wall: 'mymod:a', roof: 'mymod:b' });
    expect(out).toContain('PRIMARY PALETTE');
    expect(out).toContain('- wall: `mymod:a`');
    expect(out).toContain('- roof: `mymod:b`');
    expect(out).toContain('starting shell is ALREADY built'); // the prefer-only note
  });

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
