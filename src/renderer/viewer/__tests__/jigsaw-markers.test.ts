import { describe, expect, it } from 'vitest';
import type { JigsawConnector } from '@/shared/types';
import { rootPlacement } from '@/shared/jigsaw';
import {
  buildConnectorMarkers,
  MAX_MARKERS,
  POOL_PALETTE,
  poolColors,
} from '../jigsaw-markers';

function connector(over: Partial<JigsawConnector> = {}): JigsawConnector {
  return {
    pos: [1, 2, 3],
    name: 'ns:in',
    target: 'ns:out',
    pool: 'ns:rooms',
    finalState: 'minecraft:air',
    joint: 'aligned',
    orientation: 'south_up',
    selectionPriority: 0,
    placementPriority: 0,
    ...over,
  };
}

describe('poolColors', () => {
  it('assigns deterministic colors by sorted distinct pool id', () => {
    const a = poolColors(['ns:b', 'ns:a', 'ns:b']);
    const b = poolColors(['ns:a', 'ns:b']);
    expect(a).toEqual(b);
    expect(a.get('ns:a')).toBe(POOL_PALETTE[0]);
    expect(a.get('ns:b')).toBe(POOL_PALETTE[1]);
  });

  it('cycles the palette past its length', () => {
    const pools = Array.from({ length: POOL_PALETTE.length + 1 }, (_, i) => `ns:p${String(i).padStart(2, '0')}`);
    const map = poolColors(pools);
    expect(map.get(pools[POOL_PALETTE.length])).toBe(POOL_PALETTE[0]);
  });
});

describe('buildConnectorMarkers', () => {
  it('places a root marker at the cell center facing the orientation front', () => {
    const [m] = buildConnectorMarkers([
      { id: 'root', jigsaws: [connector()], placement: rootPlacement() },
    ]);
    expect(m.key).toBe('root:0');
    expect(m.center).toEqual([1.5, 2.5, 3.5]);
    expect(m.front).toBe('south');
    expect(m.pool).toBe('ns:rooms');
  });

  it('rotates markers with the piece placement (assembled pieces)', () => {
    // quarterTurns 1 maps (x,y,z) → (z,y,-x); south (0,0,1) rotates to east (1,0,0).
    const [m] = buildConnectorMarkers([
      {
        id: 'p1',
        jigsaws: [connector({ pos: [0, 0, 0] })],
        placement: { offset: [10, 0, 20], quarterTurns: 1 },
      },
    ]);
    expect(m.key).toBe('p1:0');
    expect(m.center).toEqual([10.5, 0.5, 19.5]);
    expect(m.front).toBe('east');
  });

  it('colors the same pool identically across pieces', () => {
    const markers = buildConnectorMarkers([
      { id: 'root', jigsaws: [connector({ pool: 'ns:a' })], placement: rootPlacement() },
      { id: 'p1', jigsaws: [connector({ pool: 'ns:a' })], placement: { offset: [5, 0, 0], quarterTurns: 2 } },
    ]);
    expect(markers[0].color).toBe(markers[1].color);
  });

  it('caps the marker count', () => {
    const many = Array.from({ length: MAX_MARKERS + 40 }, (_, i) => connector({ pos: [i, 0, 0] }));
    const markers = buildConnectorMarkers([{ id: 'root', jigsaws: many, placement: rootPlacement() }]);
    expect(markers).toHaveLength(MAX_MARKERS);
  });
});
