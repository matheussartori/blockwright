// Bottom-left prompt offering to load the mod workspace a loose `.nbt` — or an
// opened Minecraft world (a mod's dev run save) — belongs to, so its textures
// resolve. Shown only when no workspace is active.
import { useApp, useT } from '../hooks/useStores';

export function WorkspaceSuggest({
  onAccept,
  onDismiss,
}: {
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const suggest = useApp((s) => s.suggest);
  if (!suggest) return null;
  const { workspace } = suggest;
  return (
    <div className="workspace-suggest" title={`${workspace.namespace} · ${workspace.root}`}>
      <span className="ws-dot" />
      <div className="suggest-text">
        <span className="suggest-label">
          {t(suggest.kind === 'world' ? 'workspace.worldOfMod' : 'workspace.partOfMod')}
        </span>
        <span className="suggest-name">{workspace.name}</span>
      </div>
      <button className="btn sm primary" onClick={onAccept}>
        {t('workspace.loadWorkspace')}
      </button>
      <button className="suggest-dismiss" title={t('common.dismiss')} onClick={onDismiss}>
        ✕
      </button>
    </div>
  );
}
