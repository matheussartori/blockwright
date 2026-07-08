// Contracts for exporting a generated structure into a mod workspace: a `.nbt` plus
// the worldgen JSON that makes Minecraft actually spawn it. The dialog asks main to
// PLAN (a live preview of the files + any problems) as the user edits, then to WRITE.
import type { PlannedFileSpec, ValidationIssue, WorldgenOptions } from '../domain/worldgen';

/** What the export dialog asks main to plan or perform. */
export interface WorkspaceExportRequest {
  /** Absolute path of the `.nbt` being exported (the build's library file, or open doc). */
  sourcePath: string;
  /** The resource name without the namespace, already sanitized by the dialog. */
  name: string;
  worldgen: WorldgenOptions;
  /** The structure's [w, h, d] — used to decide if it exceeds the size limit (→ jigsaw split). */
  size: [number, number, number];
  /** The effective per-axis cell limit (the user's setting resolved for the workspace version). */
  nbtLimit: number;
}

/** A planned file plus whether it already exists on disk (→ an overwrite warning). */
export interface PlannedFile extends PlannedFileSpec {
  exists: boolean;
}

/** The live preview main returns for the dialog: the target workspace, the files that
 *  will be written, and the problems to surface (errors block, warnings inform). */
export interface WorkspaceExportPlan {
  /** The active workspace, or null when none is open (an error the dialog explains). */
  workspace: { name: string; namespace: string; version: string | null } | null;
  files: PlannedFile[];
  issues: ValidationIssue[];
}

/** The outcome of writing the files. */
export interface WorkspaceExportResult {
  ok: boolean;
  /** Workspace-relative paths written, for the success summary. */
  written: string[];
  /** Folder to reveal in the OS file manager (the structure folder). */
  revealPath?: string;
  /** A stable code for a hard failure, localized by the renderer. */
  errorCode?: 'no_workspace' | 'source_missing' | 'write_failed' | 'invalid';
  /** Raw detail for diagnostics. */
  detail?: string;
}

/** The Materials panel's export ask: the renderer serializes BOTH formats (the
 *  rollup is pure renderer math) and main writes whichever extension the user
 *  picks in the Save dialog; `format` orders the dialog's filters. */
export interface MaterialsExportRequest {
  /** Suggested file stem (the structure's name), extension appended from `format`. */
  suggestedName: string;
  format: MaterialsFormat;
  csv: string;
  json: string;
}

export type MaterialsFormat = 'csv' | 'json';

/** One Worldgen Doctor finding: a stable `code` the renderer localizes (with a fix-it
 *  explanation), the workspace-relative file it concerns, and optional raw detail. */
export interface DoctorFinding {
  level: 'error' | 'warning';
  code: string;
  file: string;
  detail?: string;
}

/** The Worldgen Doctor's whole-workspace check-up result. */
export interface WorkspaceDoctorReport {
  /** The scanned workspace's name, or null when none is active. */
  workspace: string | null;
  /** How many files were scanned (for the "all clear" summary). */
  checkedFiles: number;
  findings: DoctorFinding[];
}

/** The outcome of one Doctor fix-it (folder rename / spawn_overrides / format re-stamp). */
export type DoctorFixResult = { ok: true; detail?: string } | { ok: false; error: string };

/** One datapack-upgrader entry: something it CHANGED, or a LOSS it could not map
 *  (a newer DataVersion, an unknown block id). Codes localize as `upgrade.entry.<code>`. */
export interface UpgradeEntry {
  kind: 'changed' | 'loss';
  code: string;
  /** Workspace-relative path the entry concerns. */
  file: string;
  detail?: string;
}

/** The datapack upgrader's loss report (Part III): every change + everything it
 *  couldn't map, over the active workspace at its target Minecraft version. */
export interface WorkspaceUpgradeReport {
  workspace: string | null;
  /** The target MC version the pack was upgraded to (null = no workspace/version). */
  target: string | null;
  /** Structure `.nbt`s examined. */
  checkedFiles: number;
  entries: UpgradeEntry[];
}
