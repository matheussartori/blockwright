// The docked right-hand inspector sidebar and its floating counterparts. Each
// panel (Info / Jigsaw) lives here as a tab by default and can be torn off into
// a FloatingWindow; both render the exact same content component. Availability
// is passed in from App (Info = a structure is open, Jigsaw = it has jigsaws).
import type { FC } from 'react';
import type { MessageKey } from '@/shared/i18n';
import { windowsStore, type PanelId } from '../state/windows';
import { useT, useWindows } from '../hooks/useStores';
import { FloatingWindow } from './FloatingWindow';
import { InspectorContent } from '../windows/InspectorWindow';
import { JigsawContent } from '../windows/JigsawWindow';
import { VersionsContent } from '../windows/VersionsWindow';
import { GenerateContent } from './NewStructurePanel';

type Availability = Record<PanelId, boolean>;

const PANELS: Record<PanelId, { title: MessageKey; Content: FC }> = {
  inspector: { title: 'panel.info', Content: InspectorContent },
  jigsaw: { title: 'panel.jigsaw', Content: JigsawContent },
  versions: { title: 'panel.versions', Content: VersionsContent },
  generate: { title: 'panel.generate', Content: GenerateContent },
};

const PANEL_IDS: PanelId[] = ['inspector', 'jigsaw', 'versions', 'generate'];

/** The chat panel manages its own layout (pinned composer), so its container
 *  drops the default padding/scroll the static panels rely on. */
const FLUSH: Record<PanelId, boolean> = { inspector: false, jigsaw: false, versions: false, generate: true };

export function InspectorDock({ availability }: { availability: Availability }) {
  const t = useT();
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
          title={t('panel.expandSidebar')}
          aria-label={t('panel.expandSidebar')}
          onClick={() => windowsStore.getState().setSidebarCollapsed(false)}
        >
          ‹
        </button>
      </aside>
    );
  }

  const { Content } = PANELS[active];

  return (
    <aside className="inspector-dock">
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
              {t(PANELS[id].title)}
            </button>
          ))}
        </div>
        <div className="dock-actions">
          <button
            type="button"
            className="dock-btn"
            title={t('panel.detach')}
            aria-label={t('panel.detachAria')}
            onClick={() => windowsStore.getState().setFloating(active, true)}
          >
            ⤢
          </button>
          <button
            type="button"
            className="dock-btn"
            title={t('panel.collapseSidebar')}
            aria-label={t('panel.collapseSidebar')}
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
  const t = useT();
  const floating = useWindows((s) => s[id].floating);
  if (!floating) return null;
  const { title, Content } = PANELS[id];
  return (
    <FloatingWindow
      id={id}
      title={t(title)}
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
