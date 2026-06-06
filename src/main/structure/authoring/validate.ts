// Validate the authoring JSON against the hard rules, throwing a human-readable
// message on the first violation so the AI loop gets actionable feedback.
import type { FloorRole } from '@/shared/types';
import { isKnownStructure, knownStructureNames } from '../domain';
import { type AuthoringOp, type AuthoringStructure, OP_NAMES } from './types';

const FLOOR_ROLES: readonly FloorRole[] = ['basement', 'ground', 'upper', 'roof'];

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
  ops.forEach((o, i) => {
    const op = o as AuthoringOp;
    if (!o || !(OP_NAMES as readonly string[]).includes(op.op)) {
      throw new Error(`ops[${i}].op must be one of ${OP_NAMES.join(', ')}`);
    }
    if (op.op === 'block') {
      checkState(op.state, `ops[${i}].state`);
      checkPos(op.pos, `ops[${i}].pos`);
      return;
    }
    if (op.op === 'template') {
      // Template ops carry a structure-type name + bounding box (no palette index —
      // the type interns its own entries on expand). The box must sit inside `size`.
      if (!isKnownStructure(op.name)) {
        throw new Error(`ops[${i}].name "${op.name}" is not a known structure type (${knownStructureNames().join(', ')})`);
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

  const floors = s.floors;
  if (floors !== undefined) {
    if (!Array.isArray(floors)) throw new Error('floors must be an array');
    floors.forEach((f, i) => {
      if (!f || typeof f !== 'object') throw new Error(`floors[${i}] must be an object`);
      if (!(FLOOR_ROLES as readonly string[]).includes(f.role)) {
        throw new Error(`floors[${i}].role must be one of ${FLOOR_ROLES.join(', ')}`);
      }
      const okBound = (n: unknown): boolean => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < size[1];
      if (!okBound(f.from) || !okBound(f.to)) {
        throw new Error(`floors[${i}] from/to must be integers within the height (0..${size[1] - 1})`);
      }
      if (f.from > f.to) throw new Error(`floors[${i}].from must be <= floors[${i}].to`);
    });
  }
}
