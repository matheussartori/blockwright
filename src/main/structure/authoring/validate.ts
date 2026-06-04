// Validate the authoring JSON against the hard rules, throwing a human-readable
// message on the first violation so the AI loop gets actionable feedback.
import { isTemplateName, TEMPLATE_NAMES } from '../templates';
import type { AuthoringOp, AuthoringStructure } from './types';

export function validateAuthoring(s: AuthoringStructure): void {
  if (!s || typeof s !== 'object') throw new Error('structure is not an object');
  const size = s.size;
  if (!Array.isArray(size) || size.length !== 3 || size.some((n) => typeof n !== 'number' || n <= 0)) {
    throw new Error('size must be three positive integers [sx, sy, sz]');
  }
  const palette = s.palette ?? [];
  if (!Array.isArray(palette) || palette.length === 0) throw new Error('palette must be a non-empty array');
  palette.forEach((p, i) => {
    if (!p || typeof p.Name !== 'string') throw new Error(`palette[${i}] is missing a string Name`);
  });

  // A position triple within bounds.
  const checkPos = (pos: unknown, label: string): void => {
    if (!Array.isArray(pos) || pos.length !== 3) throw new Error(`${label} must be [x, y, z]`);
    pos.forEach((c, axis) => {
      if (typeof c !== 'number' || !Number.isInteger(c) || c < 0 || c >= size[axis]) {
        throw new Error(`${label}[${axis}] = ${c} is out of bounds (0..${size[axis] - 1})`);
      }
    });
  };
  const checkState = (state: unknown, label: string): void => {
    if (typeof state !== 'number' || state < 0 || state >= palette.length) {
      throw new Error(`${label} ${state} is out of palette range (0..${palette.length - 1})`);
    }
  };

  const ops = s.ops ?? [];
  if (!Array.isArray(ops)) throw new Error('ops must be an array');
  const OP_KINDS = ['fill', 'hollow', 'walls', 'line', 'block', 'mirror', 'rotate', 'repeat', 'roof', 'stairs', 'template'];
  ops.forEach((o, i) => {
    const op = o as AuthoringOp;
    if (!o || !OP_KINDS.includes(op.op)) {
      throw new Error(`ops[${i}].op must be one of ${OP_KINDS.join(', ')}`);
    }
    if (op.op === 'block') {
      checkState(op.state, `ops[${i}].state`);
      checkPos(op.pos, `ops[${i}].pos`);
      return;
    }
    if (op.op === 'template') {
      // Template ops carry a name + bounding box (no palette index — the template
      // interns its own entries on expand). The box must sit inside `size`.
      if (!isTemplateName(op.name)) {
        throw new Error(`ops[${i}].name "${op.name}" is not a known template (${TEMPLATE_NAMES.join(', ')})`);
      }
      checkPos(op.from, `ops[${i}].from`);
      checkPos(op.to, `ops[${i}].to`);
      if (op.params !== undefined && (typeof op.params !== 'object' || op.params === null || Array.isArray(op.params))) {
        throw new Error(`ops[${i}].params must be an object`);
      }
      return;
    }
    // All remaining ops take a from/to box.
    checkPos(op.from, `ops[${i}].from`);
    checkPos(op.to, `ops[${i}].to`);
    if (op.op === 'fill' || op.op === 'hollow' || op.op === 'walls' || op.op === 'line' || op.op === 'roof' || op.op === 'stairs') {
      checkState(op.state, `ops[${i}].state`);
    }
    if (op.op === 'roof' && op.fill !== undefined) checkState(op.fill, `ops[${i}].fill`);
    if (op.op === 'stairs') {
      if (op.fill !== undefined) checkState(op.fill, `ops[${i}].fill`);
      if (op.clear !== undefined) checkState(op.clear, `ops[${i}].clear`);
      if (op.from[1] === op.to[1]) throw new Error(`ops[${i}] stairs must change height (from.y !== to.y) — a flat row is not a staircase`);
    }
    if (op.op === 'mirror' && op.axis !== 'x' && op.axis !== 'z') {
      throw new Error(`ops[${i}].axis must be "x" or "z"`);
    }
    if (op.op === 'rotate') {
      if (!Number.isInteger(op.turns)) throw new Error(`ops[${i}].turns must be an integer (1, 2 or 3 quarter-turns)`);
      if (op.pivot !== undefined) {
        if (!Array.isArray(op.pivot) || op.pivot.length !== 2) throw new Error(`ops[${i}].pivot must be [x, z]`);
        if (op.pivot[0] < 0 || op.pivot[0] >= size[0] || op.pivot[1] < 0 || op.pivot[1] >= size[2]) {
          throw new Error(`ops[${i}].pivot is out of bounds`);
        }
      }
    }
    if (op.op === 'repeat') {
      if (op.axis !== 'x' && op.axis !== 'y' && op.axis !== 'z') throw new Error(`ops[${i}].axis must be "x", "y" or "z"`);
      if (!Number.isInteger(op.step) || op.step === 0) throw new Error(`ops[${i}].step must be a non-zero integer`);
      if (!Number.isInteger(op.count) || op.count < 1) throw new Error(`ops[${i}].count must be a positive integer`);
    }
  });

  const blocks = s.blocks ?? [];
  if (!Array.isArray(blocks)) throw new Error('blocks must be an array');
  blocks.forEach((b, i) => {
    checkState(b.state, `blocks[${i}].state`);
    checkPos(b.pos, `blocks[${i}].pos`);
  });

  if (ops.length === 0 && blocks.length === 0) {
    throw new Error('place at least one block via "ops" (preferred) or "blocks"');
  }
}
