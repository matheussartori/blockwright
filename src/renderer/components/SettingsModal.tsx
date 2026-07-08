// The Settings dialog: a tabbed panel (Appearance / Viewer / AI / Library / About) built on
// the shared Modal primitive, with a left nav like the OS settings apps. Each tab is
// its own component in ./settings; this shell owns only the nav + tab dispatch. Tabs
// mutate `settingsStore`; applying values to the viewer/theme happens in one place
// (App's effect / state/theme.ts) so settings take effect whether or not this is open.
import { useEffect, useState, type ComponentType } from 'react';
import { Box, FolderOpen, Globe, Info, Palette, Sparkles } from 'lucide-react';
import { store } from '../state/store';
import { settingsStore } from '../state/settings';
import type { MessageKey } from '@/shared/i18n';
import { useApp, useT } from '../hooks/useStores';
import { Modal } from './ui/Modal';
import { AppearanceTab } from './settings/AppearanceTab';
import { ViewerTab } from './settings/ViewerTab';
import { AiTab } from './settings/AiTab';
import { LibraryTab } from './settings/LibraryTab';
import { WorldTab } from './settings/WorldTab';
import { AboutTab } from './settings/AboutTab';

type TabId = 'appearance' | 'viewer' | 'world' | 'ai' | 'library' | 'about';
const TABS: { id: TabId; label: MessageKey; Icon: ComponentType<{ size?: number }> }[] = [
  { id: 'appearance', label: 'settings.tab.appearance', Icon: Palette },
  { id: 'viewer', label: 'settings.tab.viewer', Icon: Box },
  { id: 'world', label: 'settings.tab.world', Icon: Globe },
  { id: 'ai', label: 'settings.tab.ai', Icon: Sparkles },
  { id: 'library', label: 'settings.tab.library', Icon: FolderOpen },
  { id: 'about', label: 'settings.tab.about', Icon: Info },
];

const TAB_IDS = TABS.map((t) => t.id);

export function SettingsModal() {
  const t = useT();
  const open = useApp((s) => s.settingsOpen);
  const section = useApp((s) => s.settingsSection);
  const [tab, setTab] = useState<TabId>('appearance');
  const close = () => store.getState().setSettingsOpen(false);

  // When opened to a specific section (e.g. the native About menu), jump to that
  // tab and clear the request so a later open lands on the user's last tab.
  useEffect(() => {
    if (section && (TAB_IDS as string[]).includes(section)) {
      setTab(section as TabId);
      store.getState().setSettingsSection(null);
    }
  }, [section]);

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('settings.title')}
      className="modal-lg settings"
      bodyClassName="settings-body"
      footer={
        <button className="link" onClick={() => settingsStore.getState().reset()}>
          {t('settings.resetDefaults')}
        </button>
      }
    >
      <nav className="settings-nav" role="tablist" aria-label={t('settings.sections')}>
        {TABS.map((tab2) => (
          <button
            key={tab2.id}
            role="tab"
            aria-selected={tab === tab2.id}
            className={`settings-nav-item${tab === tab2.id ? ' active' : ''}`}
            onClick={() => setTab(tab2.id)}
          >
            <tab2.Icon size={15} aria-hidden />
            {t(tab2.label)}
          </button>
        ))}
      </nav>
      <div className="settings-pane">
        {tab === 'appearance' && <AppearanceTab />}
        {tab === 'viewer' && <ViewerTab />}
        {tab === 'world' && <WorldTab />}
        {tab === 'ai' && <AiTab />}
        {tab === 'library' && <LibraryTab />}
        {tab === 'about' && <AboutTab />}
      </div>
    </Modal>
  );
}
