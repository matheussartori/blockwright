// The export dialog's two terminal states: no workspace open (an invitation to open one),
// and a successful write (a confirmation + the files that landed). The mid-state (the
// config + preview form) lives in ExportModal.
import { CheckCircle2, FolderTree } from 'lucide-react';
import { api } from '../../api';
import { ExportFileRow } from './ExportFileRow';
import { CommandChip } from '../ui/CommandChip';
import type { TFunction } from '@/shared/i18n';
import type { WorkspaceExportResult } from '@/shared/types';

export function ExportEmpty({ t }: { t: TFunction }) {
  return (
    <div className="export-empty">
      <FolderTree size={32} strokeWidth={1.5} aria-hidden />
      <h3>{t('export.noWorkspaceTitle')}</h3>
      <p>{t('export.noWorkspaceBody', { ns: '<namespace>' })}</p>
      <button className="btn primary no-drag" onClick={() => void api.openWorkspace()}>
        {t('export.openWorkspace')}
      </button>
    </div>
  );
}

interface ExportSuccessProps {
  result: WorkspaceExportResult;
  workspaceName: string;
  namespace: string;
  /** The exported resource name — builds the in-game `/place` test command. */
  resourceName?: string;
  /** Whether worldgen JSON was written (a structure DEF exists to `/place`). */
  worldgen?: boolean;
  t: TFunction;
}

export function ExportSuccess({ result, workspaceName, namespace, resourceName, worldgen, t }: ExportSuccessProps) {
  // The one-paste test loop: with worldgen files the structure DEF is placeable
  // (`/place structure`); a plain `.nbt` drop still places as a raw template.
  const command = resourceName
    ? worldgen
      ? `/place structure ${namespace}:${resourceName}`
      : `/place template ${namespace}:${resourceName}`
    : null;
  return (
    <div className="export-success">
      <CheckCircle2 size={32} strokeWidth={1.6} aria-hidden />
      <h3>{t('export.successTitle', { workspace: workspaceName })}</h3>
      <p>{t('export.successBody', { count: result.written.length })}</p>
      <ul className="export-file-tree">
        {result.written.map((rel) => (
          <ExportFileRow
            key={rel}
            rel={rel}
            namespace={namespace}
            icon={<CheckCircle2 size={15} strokeWidth={1.9} aria-hidden className="export-file-ok" />}
          />
        ))}
      </ul>
      {command && <CommandChip command={command} hint={t('export.placeHint')} />}
    </div>
  );
}
