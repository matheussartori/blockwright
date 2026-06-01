// Bottom-left prompt offering to load the mod workspace a loose `.nbt` belongs
// to (so its textures resolve). Shown only when no workspace is active.
import { useApp } from '../hooks/useStores';

export function WorkspaceSuggest({
  onAccept,
  onDismiss,
}: {
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const suggest = useApp((s) => s.suggest);
  if (!suggest) return null;
  const { workspace } = suggest;
  return (
    <div className="workspace-suggest" title={`${workspace.namespace} · ${workspace.root}`}>
      <span className="ws-dot" />
      <div className="suggest-text">
        <span className="suggest-label">Part of mod</span>
        <span className="suggest-name">{workspace.name}</span>
      </div>
      <button className="btn sm primary" onClick={onAccept}>
        Load workspace
      </button>
      <button className="suggest-dismiss" title="Dismiss" onClick={onDismiss}>
        ✕
      </button>
    </div>
  );
}
