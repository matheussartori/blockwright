// The "x,y,z" cell-key format — the one string contract shared by the editor ops, the editor
// store, and the viewer's selection overlay. Kept dependency-free (no Three, no store) so any
// layer can import it without coupling, and the format has a single source of truth.
export type Cell = [number, number, number];

export const cellKey = (p: readonly number[]): string => `${p[0]},${p[1]},${p[2]}`;

export const parseCell = (k: string): Cell => {
  const [x, y, z] = k.split(',').map(Number);
  return [x, y, z];
};
