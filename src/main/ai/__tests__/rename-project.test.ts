import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renameProject, sanitizeProjectName } from '../rename-project';

describe('sanitizeProjectName', () => {
  it('keeps readable case + spaces', () => {
    expect(sanitizeProjectName('My Cool Castle')).toBe('My Cool Castle');
  });
  it('strips filesystem-illegal characters', () => {
    expect(sanitizeProjectName('a/b:c*d?"e<f>g|h\\i')).toBe('a b c d e f g h i');
  });
  it('collapses whitespace and trims trailing dots/spaces', () => {
    expect(sanitizeProjectName('  spaced   out . ')).toBe('spaced out');
  });
  it('caps length at 64', () => {
    expect(sanitizeProjectName('x'.repeat(100))).toHaveLength(64);
  });
});

describe('renameProject', () => {
  let root: string;

  // Build a realistic library project: <root>/old-slug-ab12/ with the latest
  // <stem>.nbt, a versions/ dir and a generation.log.
  function makeProject(stem: string): string {
    const dir = path.join(root, stem);
    fs.mkdirSync(path.join(dir, 'versions'), { recursive: true });
    fs.writeFileSync(path.join(dir, `${stem}.nbt`), 'nbt');
    fs.writeFileSync(path.join(dir, 'versions', 'v1.nbt'), 'v1');
    fs.writeFileSync(path.join(dir, 'generation.log'), 'log');
    return path.join(dir, `${stem}.nbt`);
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-rename-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('renames the folder and the latest .nbt, keeping versions + log', () => {
    const file = makeProject('cozy-oak-cottage-ab12');
    const result = renameProject(file, 'Lakeside Manor');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(path.basename(result.dir)).toBe('Lakeside Manor');
    expect(path.basename(result.file)).toBe('Lakeside Manor.nbt');
    expect(fs.existsSync(result.file)).toBe(true);
    expect(fs.existsSync(path.join(result.dir, 'versions', 'v1.nbt'))).toBe(true);
    expect(fs.existsSync(path.join(result.dir, 'generation.log'))).toBe(true);
    // The old folder is gone.
    expect(fs.existsSync(path.dirname(file))).toBe(false);
  });

  it('refuses a folder that is not a Blockwright project', () => {
    const loose = path.join(root, 'random');
    fs.mkdirSync(loose, { recursive: true });
    fs.writeFileSync(path.join(loose, 'thing.nbt'), 'nbt'); // no versions/ or log
    const result = renameProject(path.join(loose, 'thing.nbt'), 'Whatever');
    expect(result.ok).toBe(false);
    // The folder is untouched.
    expect(fs.existsSync(path.join(loose, 'thing.nbt'))).toBe(true);
  });

  it('refuses an empty name', () => {
    const file = makeProject('a-build-cd34');
    expect(renameProject(file, '   ').ok).toBe(false);
  });

  it('refuses when the target name already exists', () => {
    const file = makeProject('a-build-ef56');
    fs.mkdirSync(path.join(root, 'Taken'), { recursive: true });
    const result = renameProject(file, 'Taken');
    expect(result.ok).toBe(false);
    // The original project survives the rejected rename.
    expect(fs.existsSync(file)).toBe(true);
  });
});
