// The export dialog's right column: a live tree of the exact files the export will write
// (each flagged new/replace), and a checks footer pinned to the bottom — errors that block
// the write, warnings that inform, or an all-clear "ready". Pure view over the plan main
// computed; overwrite warnings are omitted here since each file already carries a badge.
import { Boxes, CheckCircle2, FileBox, FileJson, FolderTree, TriangleAlert, XCircle } from 'lucide-react';
import { ExportFileRow } from './ExportFileRow';
import { splitIssues } from '@/shared/domain/worldgen';
import type { MessageKey, TFunction } from '@/shared/i18n';
import type { WorkspaceExportPlan, WorkspaceExportResult } from '@/shared/types';

interface ExportPreviewProps {
  plan: WorkspaceExportPlan | null;
  namespace: string;
  result: WorkspaceExportResult | null;
  /** The source structure carries jigsaw connectors — the single-piece pool won't follow them. */
  jigsawWarning: boolean;
  /** >0 when the structure exceeds the size limit and is cut into this many jigsaw pieces. */
  splitPieces: number;
  t: TFunction;
}

export function ExportPreview({ plan, namespace, result, jigsawWarning, splitPieces, t }: ExportPreviewProps) {
  const { errors, warnings } = splitIssues(plan?.issues ?? []);
  const files = plan?.files ?? [];
  const issueText = (code: string, detail?: string) =>
    t(`export.issue.${code}` as MessageKey, detail ? { detail } : undefined);

  return (
    <div className="export-preview">
      {splitPieces > 0 && (
        <div className="export-split-banner">
          <Boxes size={16} strokeWidth={1.8} aria-hidden />
          <span>{t('export.splitBanner', { count: splitPieces })}</span>
        </div>
      )}

      <div className="export-preview-head">
        <FolderTree size={15} strokeWidth={1.9} aria-hidden />
        <span>{t('export.filesLabel')}</span>
      </div>

      <ul className="export-file-tree">
        {files.map((f) => (
          <ExportFileRow
            key={f.rel}
            rel={f.rel}
            namespace={namespace}
            icon={
              f.kind === 'nbt' || f.kind === 'piece' ? (
                <FileBox size={16} strokeWidth={1.7} aria-hidden />
              ) : (
                <FileJson size={16} strokeWidth={1.7} aria-hidden />
              )
            }
            badge={
              <span className={`export-file-badge${f.exists ? ' replace' : ''}`}>
                {f.exists ? t('export.fileReplace') : t('export.fileNew')}
              </span>
            }
          />
        ))}
      </ul>

      <div className="export-checks">
        {errors.map((iss, i) => (
          <p key={`e${i}`} className="export-issue error">
            <XCircle size={14} strokeWidth={2} aria-hidden />
            <span>{issueText(iss.code, iss.detail)}</span>
          </p>
        ))}
        {warnings.map((iss, i) => (
          <p key={`w${i}`} className="export-issue warning">
            <TriangleAlert size={14} strokeWidth={2} aria-hidden />
            <span>{issueText(iss.code, iss.detail)}</span>
          </p>
        ))}
        {jigsawWarning && (
          <p className="export-issue warning">
            <TriangleAlert size={14} strokeWidth={2} aria-hidden />
            <span>{t('export.jigsawWarning')}</span>
          </p>
        )}
        {result && !result.ok && (
          <p className="export-issue error">
            <XCircle size={14} strokeWidth={2} aria-hidden />
            <span>{t('export.failed', { detail: result.detail ?? '' })}</span>
          </p>
        )}
        {errors.length === 0 && files.length > 0 && (
          <p className="export-issue ok">
            <CheckCircle2 size={14} strokeWidth={2} aria-hidden />
            <span>{t('export.ready', { count: files.length })}</span>
          </p>
        )}
      </div>
    </div>
  );
}
