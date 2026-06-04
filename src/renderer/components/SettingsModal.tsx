// The Settings dialog: a tabbed panel (Appearance / Viewer / AI / About) built on
// the shared Modal primitive, with a left nav like the OS settings apps. Each tab is
// its own component in ./settings; this shell owns only the nav + tab dispatch. Tabs
// mutate `settingsStore`; applying values to the viewer/theme happens in one place
// (App's effect / state/theme.ts) so settings take effect whether or not this is open.
import { useEffect, useState } from 'react';
import { store } from '../state/store';
import { settingsStore } from '../state/settings';
import { useApp } from '../hooks/useStores';
import { Modal } from './ui/Modal';
import { AppearanceTab } from './settings/AppearanceTab';
import { ViewerTab } from './settings/ViewerTab';
import { AiTab } from './settings/AiTab';
import { AboutTab } from './settings/AboutTab';

type TabId = 'appearance' | 'viewer' | 'ai' | 'about';
const TABS: { id: TabId; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'viewer', label: 'Viewer' },
  { id: 'ai', label: 'AI' },
  { id: 'about', label: 'About' },
];

const TAB_IDS = TABS.map((t) => t.id);

export function SettingsModal() {
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
      title="Settings"
      className="modal-lg settings"
      bodyClassName="settings-body"
      footer={
        <button className="link" onClick={() => settingsStore.getState().reset()}>
          Reset to defaults
        </button>
      }
    >
      <nav className="settings-nav" role="tablist" aria-label="Settings sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`settings-nav-item${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="settings-pane">
        {tab === 'appearance' && <AppearanceTab />}
        {tab === 'viewer' && <ViewerTab />}
        {tab === 'ai' && <AiTab />}
        {tab === 'about' && <AboutTab />}
      </div>
    </Modal>
  );
}
