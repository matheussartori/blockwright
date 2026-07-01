// The left activity rail — the workbench's fixed navigation spine. The app mark
// on top is Home (the start page); below it the primary surfaces (Project panel,
// New build, Block Catalog, Module Gallery); pinned to the bottom the utility
// trio (Console, Guide, Settings). The active surface is marked with a small
// accent "voxel" pip beside its icon. Everything here only *reveals* existing
// surfaces — all functionality stays where it already lives (stores + modals).
import type { ComponentType, ReactNode } from 'react';
import { Boxes, BookOpen, FolderTree, House, LayoutGrid, Settings, Sparkles, Terminal } from 'lucide-react';
import { store } from '../state/store';
import { documentsStore } from '../state/documents';
import { windowsStore } from '../state/windows';
import { useDocuments, useT, useWindows } from '../hooks/useStores';
import { Tooltip } from './ui/Tooltip';

function RailButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip label={label} placement="right">
      <button
        type="button"
        className={`rail-btn${active ? ' active' : ''}`}
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
      >
        {children}
        <span className="rail-pip" aria-hidden />
      </button>
    </Tooltip>
  );
}

function RailIcon({ icon: Icon }: { icon: ComponentType<{ size?: number; strokeWidth?: number }> }) {
  return <Icon size={19} strokeWidth={1.7} />;
}

export function ActivityBar({ onNewBuild }: { onNewBuild: () => void }) {
  const t = useT();
  const activeId = useDocuments((s) => s.activeId);
  const projectVisible = useWindows((s) => s.projectVisible);
  const consoleVisible = useWindows((s) => s.console.visible);

  return (
    <nav className="activity-rail" aria-label={t('rail.aria')}>
      <div className="rail-group">
        <RailButton
          label={t('tab.home')}
          active={activeId === null}
          onClick={() => documentsStore.getState().goHome()}
        >
          <RailIcon icon={House} />
        </RailButton>
        <RailButton
          label={t('project.title')}
          active={projectVisible}
          onClick={() => windowsStore.getState().setProjectVisible(!projectVisible)}
        >
          <RailIcon icon={FolderTree} />
        </RailButton>
        <RailButton label={t('rail.newBuild')} onClick={onNewBuild}>
          <RailIcon icon={Sparkles} />
        </RailButton>
        <RailButton label={t('menu.blockCatalog')} onClick={() => store.getState().setCatalogOpen(true)}>
          <RailIcon icon={LayoutGrid} />
        </RailButton>
        <RailButton label={t('menu.moduleGallery')} onClick={() => store.getState().setModulesOpen(true)}>
          <RailIcon icon={Boxes} />
        </RailButton>
      </div>

      <div className="rail-spacer" />

      <div className="rail-group">
        <RailButton
          label={t('menu.console')}
          active={consoleVisible}
          onClick={() => windowsStore.getState().setVisible('console', !consoleVisible)}
        >
          <RailIcon icon={Terminal} />
        </RailButton>
        <RailButton label={t('menu.guide')} onClick={() => store.getState().setGuideOpen(true)}>
          <RailIcon icon={BookOpen} />
        </RailButton>
        <RailButton label={t('settings.title')} onClick={() => store.getState().setSettingsOpen(true)}>
          <RailIcon icon={Settings} />
        </RailButton>
      </div>
    </nav>
  );
}
