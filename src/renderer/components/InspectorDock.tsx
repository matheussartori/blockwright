// The docked right-hand inspector sidebar and its floating counterparts. Each
// panel (Info / Jigsaw) lives here as a tab by default and can be torn off into
// a FloatingWindow; both render the exact same content component. Availability
// is passed in from App (Info = a structure is open, Jigsaw = it has jigsaws).
import type { FC } from 'react';
import { windowsStore, type PanelId } from '../state/windows';
import { useWindows } from '../hooks/useStores';
import { FloatingWindow } from './FloatingWindow';
import { InspectorContent } from '../windows/InspectorWindow';
import { JigsawContent } from '../windows/JigsawWindow';
import { VersionsContent } from '../windows/VersionsWindow';
import { GenerateContent } from './NewStructurePanel';

type Availability = Record<PanelId, boolean>;

const PANELS: Record<PanelId, { title: string; Content: FC }> = {
  inspector: { title: 'Info', Content: InspectorContent },
  jigsaw: { title: 'Jigsaw', Content: JigsawContent },
  versions: { title: 'Versions', Content: VersionsContent },
  generate: { title: 'Generate ✨', Content: GenerateContent },
};

const PANEL_IDS: PanelId[] = ['inspector', 'jigsaw', 'versions', 'generate'];

/** The chat panel manages its own layout (pinned composer), so its container
 *  drops the default padding/scroll the static panels rely on. */
const FLUSH: Record<PanelId, boolean> = { inspector: false, jigsaw: false, versions: false, generate: true };

export function InspectorDock({ availability }: { availability: Availability }) {
  const inspector = useWindows((s) => s.inspector);
  const jigsaw = useWindows((s) => s.jigsaw);
  const versions = useWindows((s) => s.versions);
  const generate = useWindows((s) => s.generate);
  const activeTab = useWindows((s) => s.activeTab);
  const collapsed = useWindows((s) => s.sidebarCollapsed);

  const state: Record<PanelId, typeof inspector> = { inspector, jigsaw, versions, generate };
  // Tabs are the panels that are shown, docked (not floating), and available.
  const tabs = PANEL_IDS.filter(
    (id) => availability[id] && state[id].visible && !state[id].floating,
  );
  if (tabs.length === 0) return null;

  const active = tabs.includes(activeTab) ? activeTab : tabs[0];

  if (collapsed) {
    return (
      <aside className="inspector-dock collapsed">
        <button
          type="button"
          className="dock-rail-btn"
          title="Expand sidebar"
          aria-label="Expand sidebar"
          onClick={() => windowsStore.getState().setSidebarCollapsed(false)}
        >
          ‹
        </button>
      </aside>
    );
  }

  const { Content } = PANELS[active];

  return (
    <aside className={`inspector-dock${active === 'generate' ? ' wide' : ''}`}>
      <div className="dock-head">
        <div className="dock-tabs" role="tablist">
          {tabs.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={id === active}
              className={`dock-tab${id === active ? ' active' : ''}`}
              onClick={() => windowsStore.getState().setActiveTab(id)}
            >
              {PANELS[id].title}
            </button>
          ))}
        </div>
        <div className="dock-actions">
          <button
            type="button"
            className="dock-btn"
            title="Detach into a floating window"
            aria-label="Detach panel"
            onClick={() => windowsStore.getState().setFloating(active, true)}
          >
            ⤢
          </button>
          <button
            type="button"
            className="dock-btn"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            onClick={() => windowsStore.getState().setSidebarCollapsed(true)}
          >
            ›
          </button>
        </div>
      </div>
      <div className={`dock-body${FLUSH[active] ? ' flush' : ''}`}>
        <Content />
      </div>
    </aside>
  );
}

/** A single panel rendered as a floating window when it's been torn off. */
function FloatingPanel({ id, available }: { id: PanelId; available: boolean }) {
  const floating = useWindows((s) => s[id].floating);
  if (!floating) return null;
  const { title, Content } = PANELS[id];
  return (
    <FloatingWindow
      id={id}
      title={title}
      available={available}
      flush={FLUSH[id]}
      className={id === 'generate' ? 'gen-window' : undefined}
    >
      <Content />
    </FloatingWindow>
  );
}

/** The torn-off panels (each renders only while floating + visible + available). */
export function FloatingPanels({ availability }: { availability: Availability }) {
  return (
    <>
      {PANEL_IDS.map((id) => (
        <FloatingPanel key={id} id={id} available={availability[id]} />
      ))}
    </>
  );
}
