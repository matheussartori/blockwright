// "Plain" — the same materials as the type's kit, but intact: decay forced to 0 and
// no weathering. It exists to prove the type↔theme decoupling: the SAME structure
// type, composed with `plain` instead of `abandoned`, yields a clean build with no
// holes or moss, without the type knowing anything about it.
import type { DecorationTheme } from './types';

export const plain: DecorationTheme = {
  id: 'plain',
  label: 'Plain',
  blocks: {},
  decay: 0,
};
