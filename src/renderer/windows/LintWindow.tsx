// The structure Lint panel: run the per-file linter (main, over IPC) against the
// open structure and list the findings — air-vs-void surprises, blocks the target
// MC version doesn't know, orphaned palette entries, empty data markers. Clicking
// a positional finding focuses that cell in the viewer (Viewer.focusBlock). Works
// with or without a workspace: the target version falls back to the content pack's.
// Rendered as a tab in the docked sidebar (or a FloatingWindow when torn off).
import { useEffect, useState } from 'react';
import { TriangleAlert, XCircle } from 'lucide-react';
import type { LintFinding } from '@/shared/types';
import type { MessageKey } from '@/shared/i18n';
import { api } from '../api';
import { useViewer } from '../viewer/ViewerProvider';
import { useApp, useActiveDoc, useT } from '../hooks/useStores';

export function LintContent() {
  const t = useT();
  const doc = useActiveDoc();
  const structure = doc?.structure ?? null;
  const workspace = useApp((s) => s.workspace);
  const contentVersion = useApp((s) => s.contentVersion);
  const viewer = useViewer();

  const version = workspace ? workspace.minecraftVersion : contentVersion;
  const [findings, setFindings] = useState<LintFinding[] | null>(null);

  // Re-lint whenever the on-screen file changes (a new tab, an edit committed to
  // a new version — structure identity changes either way) or the target moves.
  useEffect(() => {
    setFindings(null);
    if (!structure) return;
    let stale = false;
    void api.lintStructure(structure.path, version ?? null).then((report) => {
      if (!stale) setFindings(report.findings);
    });
    return () => {
      stale = true;
    };
  }, [structure, version]);

  if (!structure) return null;

  const reveal = (f: LintFinding) => {
    if (f.pos && viewer) viewer.focusBlock(f.pos);
  };

  return (
    <>
      {version && (
        <p className="bw-note">{t('lint.target', { version })}</p>
      )}
      {findings === null ? (
        <p className="bw-note">{t('lint.running')}</p>
      ) : findings.length === 0 ? (
        <div className="bw-ok">{t('lint.allClear')}</div>
      ) : (
        <ul className="lint-list">
          {findings.map((f, i) => (
            <li
              key={i}
              className={`lint-row${f.pos ? ' clickable' : ''}`}
              title={f.pos ? t('lint.reveal') : undefined}
              onClick={() => reveal(f)}
            >
              {f.level === 'error' ? (
                <XCircle size={14} className="lint-icon error" />
              ) : (
                <TriangleAlert size={14} className="lint-icon warning" />
              )}
              <span>{t(`lint.issue.${f.code}` as MessageKey, { detail: f.detail ?? '' })}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
