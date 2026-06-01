// Bottom-left badge naming the active mod workspace (hidden when none / when the
// detected-workspace suggestion is showing in the same corner).
import { useApp } from '../hooks/useStores';

export function WorkspaceBadge() {
  const workspace = useApp((s) => s.workspace);
  const suggest = useApp((s) => s.suggest);
  if (!workspace || suggest) return null;
  return (
    <div className="workspace-badge" title={`${workspace.namespace} · ${workspace.root}`}>
      <span className="ws-dot" />
      <span className="ws-label">Workspace</span>
      <span className="ws-name">{workspace.name}</span>
    </div>
  );
}
