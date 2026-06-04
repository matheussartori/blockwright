// Public API of the authoring compile pipeline (JSON ↔ Minecraft `.nbt`).
export type {
  AuthoringStructure,
  AuthoringOp,
  AuthoringPaletteEntry,
  AuthoringBlock,
  AuthoringEntity,
} from './types';

export { compileStructure, compileStructureReport, writeStructureFile, type CompileReport } from './compile';
export { resolveBlocks } from './ops';
export { validateAuthoring } from './validate';
export { readAuthoring } from './nbt-decode';
