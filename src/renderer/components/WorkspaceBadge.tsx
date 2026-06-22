// Bottom badge naming the active mod workspace (hidden when none / when the
// detected-workspace suggestion is showing in the same corner). Sits bottom-LEFT over
// the viewer, but moves bottom-RIGHT on the Generate surface, where the planner's config
// column lives on the left and the badge would otherwise cover it (`side='right'`).
import { useApp, useT } from '../hooks/useStores';

export function WorkspaceBadge({ side = 'left' }: { side?: 'left' | 'right' }) {
  const t = useT();
  const workspace = useApp((s) => s.workspace);
  const suggest = useApp((s) => s.suggest);
  if (!workspace || suggest) return null;
  return (
    <div className={`workspace-badge${side === 'right' ? ' right' : ''}`} title={`${workspace.namespace} · ${workspace.root}`}>
      <span className="ws-dot" />
      <span className="ws-label">{t('workspace.label')}</span>
      <span className="ws-name">{workspace.name}</span>
    </div>
  );
}
