// Public API of the composable generation domain: structure types × decoration
// themes, crossed by `composeStructure` (what the authoring `template` op expands).
export {
  composeStructure,
  composeBlockNames,
  isKnownStructure,
  knownStructureNames,
  type Intern,
} from './compose';
export { getStructureType, isStructureType, structureTypeIds, type StructureType } from './structure-types';
export { getTheme, themeIds, DEFAULT_THEME, type DecorationTheme } from './themes';
export { ROLES, isRole, type Role } from './roles';
