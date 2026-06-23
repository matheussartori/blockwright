// "Export to mod": writes a generated structure into the active workspace's data pack —
// the `.nbt` in the version-correct structure folder, plus the worldgen JSON that makes
// Minecraft actually spawn it. This is the orchestrator: it owns the live plan + the write,
// and switches between the three states (no workspace / the config+preview form / success).
// The config column (ExportConfig) reports a draft; main computes the file list + problems
// (planWorkspaceExport) so the preview and the writes can't drift.
import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { api } from '../../api';
import { useActiveDoc, useApp, useT } from '../../hooks/useStores';
import { store } from '../../state/store';
import { ExportConfig, type ExportDraft } from './ExportConfig';
import { ExportPreview } from './ExportPreview';
import { ExportEmpty, ExportSuccess } from './ExportStates';
import type { WorkspaceExportPlan, WorkspaceExportResult } from '@/shared/types';

export function ExportModal() {
  const t = useT();
  const target = useApp((s) => s.exportTarget);
  const workspace = useApp((s) => s.workspace);
  const open = target !== null;
  // The structure being exported is the active doc (export is triggered from it) — used to
  // proportion the terrain preview and to warn if it carries jigsaw connectors.
  const structure = useActiveDoc()?.structure ?? null;
  const structureSize = structure?.size ?? [9, 7, 9];
  const hasJigsaws = (structure?.jigsaws.length ?? 0) > 0;

  const [draft, setDraft] = useState<ExportDraft | null>(null);
  const [plan, setPlan] = useState<WorkspaceExportPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WorkspaceExportResult | null>(null);

  // A fresh target clears the prior run's plan/result (the form remounts via `key`).
  useEffect(() => {
    setPlan(null);
    setResult(null);
  }, [target]);

  // Ask main for the live plan (files + problems) as the draft changes. Last-write-wins.
  useEffect(() => {
    if (!open || !target || !workspace || !draft) return;
    let stale = false;
    void api
      .planWorkspaceExport({ sourcePath: target.path, name: draft.resourceName, worldgen: draft.worldgen })
      .then((p) => {
        if (!stale) setPlan(p);
      });
    return () => {
      stale = true;
    };
  }, [open, target, workspace, draft]);

  const close = () => store.getState().setExportTarget(null);
  const errors = plan?.issues.filter((i) => i.level === 'error') ?? [];
  const canExport = !!workspace && !!target && !!draft && errors.length === 0 && !busy;

  const doExport = async () => {
    if (!target || !draft || !canExport) return;
    setBusy(true);
    const res = await api.exportToWorkspace({ sourcePath: target.path, name: draft.resourceName, worldgen: draft.worldgen });
    setBusy(false);
    setResult(res);
    // The new file should show on the welcome screen's workspace list immediately.
    if (res.ok) void api.listWorkspaceStructures().then((paths) => store.getState().setWorkspaceStructures(paths));
  };

  const footer = result?.ok ? (
    <>
      {result.revealPath && (
        <button className="btn ghost no-drag" onClick={() => void api.revealPath(result.revealPath!)}>
          {t('export.reveal')}
        </button>
      )}
      <button className="btn primary no-drag" onClick={close}>
        {t('export.close')}
      </button>
    </>
  ) : (
    <>
      <button className="btn ghost no-drag" onClick={close}>
        {t('export.cancel')}
      </button>
      <button className="btn primary no-drag" disabled={!canExport} onClick={() => void doExport()}>
        {busy ? t('export.confirmBusy') : t('export.confirm')}
      </button>
    </>
  );

  return (
    <Modal open={open} onClose={close} title={t('export.title')} className="modal-lg export-modal" footer={workspace ? footer : undefined}>
      {!workspace ? (
        <ExportEmpty t={t} />
      ) : result?.ok ? (
        <ExportSuccess result={result} workspaceName={workspace.name} namespace={workspace.namespace} t={t} />
      ) : (
        <div className="export-grid">
          <ExportConfig
            key={target?.path}
            workspaceName={workspace.name}
            namespace={workspace.namespace}
            defaultName={target?.name ?? ''}
            structureSize={structureSize}
            onChange={setDraft}
            t={t}
          />
          <ExportPreview
            plan={plan}
            namespace={workspace.namespace}
            result={result}
            jigsawWarning={hasJigsaws && (draft?.worldgen.generate ?? false)}
            t={t}
          />
        </div>
      )}
    </Modal>
  );
}
