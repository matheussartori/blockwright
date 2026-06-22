// The export dialog's two terminal states: no workspace open (an invitation to open one),
// and a successful write (a confirmation + the files that landed). The mid-state (the
// config + preview form) lives in ExportModal.
import { CheckCircle2, FolderTree } from 'lucide-react';
import { api } from '../../api';
import { ExportFileRow } from './ExportFileRow';
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
  t: TFunction;
}

export function ExportSuccess({ result, workspaceName, namespace, t }: ExportSuccessProps) {
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
    </div>
  );
}
