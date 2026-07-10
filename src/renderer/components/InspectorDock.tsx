// The docked right-hand inspector sidebar and its floating counterparts. Each
// panel (Info / Jigsaw) lives here as a tab by default and can be torn off into
// a FloatingWindow; both render the exact same content component. Availability
// is passed in from App (Info = a structure is open, Jigsaw = it has jigsaws).
import type { ComponentType, FC } from 'react';
import { ChevronsLeft, ChevronsRight, Globe, History, Info, Package, PictureInPicture2, Puzzle, ShieldCheck, Sparkles } from 'lucide-react';
import type { MessageKey } from '@/shared/i18n';
import { windowsStore, type PanelId } from '../state/windows';
import { startColDrag } from '../ui/resize';
import { useT, useWindows } from '../hooks/useStores';
import { FloatingWindow } from './FloatingWindow';
import { InspectorContent } from '../windows/InspectorWindow';
import { MaterialsContent } from '../windows/MaterialsWindow';
import { JigsawContent } from '../windows/JigsawWindow';
import { LintContent } from '../windows/LintWindow';
import { WorldgenContent } from '../windows/WorldgenWindow';
import { VersionsContent } from '../windows/VersionsWindow';
import { GenerateContent } from './NewStructurePanel';

type Availability = Record<PanelId, boolean>;

type PanelIcon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

const PANELS: Record<PanelId, { title: MessageKey; icon: PanelIcon; Content: FC }> = {
  inspector: { title: 'panel.info', icon: Info, Content: InspectorContent },
  materials: { title: 'panel.materials', icon: Package, Content: MaterialsContent },
  jigsaw: { title: 'panel.jigsaw', icon: Puzzle, Content: JigsawContent },
  lint: { title: 'panel.lint', icon: ShieldCheck, Content: LintContent },
  worldgen: { title: 'panel.worldgen', icon: Globe, Content: WorldgenContent },
  versions: { title: 'panel.versions', icon: History, Content: VersionsContent },
  generate: { title: 'panel.generate', icon: Sparkles, Content: GenerateContent },
};

const PANEL_IDS: PanelId[] = ['inspector', 'materials', 'jigsaw', 'worldgen', 'lint', 'versions', 'generate'];

/** The chat panel manages its own layout (pinned composer), so its container
 *  drops the default padding/scroll the static panels rely on. */
const FLUSH: Record<PanelId, boolean> = { inspector: false, materials: false, jigsaw: false, lint: false, worldgen: false, versions: false, generate: true };

export function InspectorDock({ availability }: { availability: Availability }) {
  const t = useT();
  const inspector = useWindows((s) => s.inspector);
  const materials = useWindows((s) => s.materials);
  const jigsaw = useWindows((s) => s.jigsaw);
  const lint = useWindows((s) => s.lint);
  const worldgen = useWindows((s) => s.worldgen);
  const versions = useWindows((s) => s.versions);
  const generate = useWindows((s) => s.generate);
  const activeTab = useWindows((s) => s.activeTab);
  const collapsed = useWindows((s) => s.sidebarCollapsed);
  const width = useWindows((s) => s.rightWidth);

  const state: Record<PanelId, typeof inspector> = { inspector, materials, jigsaw, lint, worldgen, versions, generate };
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
          <ChevronsLeft size={15} strokeWidth={1.8} aria-hidden />
        </button>
      </aside>
    );
  }

  const { Content } = PANELS[active];

  return (
    <aside className="inspector-dock" style={{ width }}>
      <div
        className="col-resize start"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          startColDrag(e, windowsStore.getState().rightWidth, -1, (w) =>
            windowsStore.getState().setRightWidth(w),
          );
        }}
      />
      <div className="dock-head">
        <div className="dock-tabs" role="tablist">
          {tabs.map((id) => {
            const Icon = PANELS[id].icon;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={id === active}
                className={`dock-tab${id === active ? ' active' : ''}`}
                onClick={() => windowsStore.getState().setActiveTab(id)}
              >
                <Icon size={13} strokeWidth={1.8} aria-hidden />
                {t(PANELS[id].title)}
              </button>
            );
          })}
        </div>
        <div className="dock-actions">
          <button
            type="button"
            className="dock-btn"
            title={t('panel.detach')}
            aria-label={t('panel.detachAria')}
            onClick={() => windowsStore.getState().setFloating(active, true)}
          >
            <PictureInPicture2 size={14} strokeWidth={1.8} aria-hidden />
          </button>
          <button
            type="button"
            className="dock-btn"
            title={t('panel.collapseSidebar')}
            aria-label={t('panel.collapseSidebar')}
            onClick={() => windowsStore.getState().setSidebarCollapsed(true)}
          >
            <ChevronsRight size={14} strokeWidth={1.8} aria-hidden />
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
