// The start page, shown whenever no tab is active. The hero is a real PROMPT —
// describe a build right here (the example suggestions fill the field, still
// editable) and Generate carries it into the build planner. The prompt card is
// the ONLY boxed element on the page: the open actions below are quiet
// borderless rows sharing the recents' anatomy (icon + label + muted detail),
// and the pack status + guide link fold into one hairline footer. The full
// explorer (workspace structures + all recents) lives in the Project panel —
// this page is the quick launcher, not the browser.
import { useEffect, useState } from 'react';
import { BookOpen, FileBox, FolderOpen, Globe, LayoutGrid, Sparkles } from 'lucide-react';
import type { MessageKey } from '@/shared/i18n';
import type { Workspace } from '@/shared/types';
import { api } from '../api';
import { basename, dirname } from '../ui/path';
import { useApp, useT } from '../hooks/useStores';
import { store } from '../state/store';
import { Logo } from './ui/Logo';

/** The example prompts surfaced on the landing — clicking one fills the prompt. */
const EXAMPLES: MessageKey[] = ['gen.example1', 'gen.example2', 'gen.example3'];

function StartRow({
  icon,
  title,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button className="start-row" title={sub} onClick={onClick}>
      {icon}
      <span className="start-row-title">{title}</span>
      <span className="start-row-sub">{sub}</span>
    </button>
  );
}

export function Welcome({
  onOpen,
  onLoad,
  onActivateWorkspace,
  onGenerate,
  onExample,
  onOpenWorld,
}: {
  onOpen: () => void;
  onLoad: (path: string) => void;
  onActivateWorkspace: (ws: Workspace) => void;
  onGenerate: () => void;
  /** Start a fresh build pre-filled with the given example prompt. */
  onExample: (text: string) => void;
  /** Open a Minecraft world (no arg = folder picker; a root = a recent world). */
  onOpenWorld: (root?: string) => void;
}) {
  const t = useT();
  const recents = useApp((s) => s.recents);
  const recentWorkspaces = useApp((s) => s.recentWorkspaces);
  const recentWorlds = useApp((s) => s.recentWorlds);

  const [hasPack, setHasPack] = useState<boolean | null>(null);
  const [prompt, setPrompt] = useState('');

  // A typed description rides into the build planner (same path the example
  // chips used to take); an empty submit just opens the blank planner.
  const submit = () => {
    const text = prompt.trim();
    if (text) onExample(text);
    else onGenerate();
  };

  // Probe the content pack once for the empty-state hint.
  useEffect(() => {
    void api.hasTexture('minecraft/block/stone').then(setHasPack);
  }, []);

  // Let the user point Blockwright at their own Minecraft extraction (not shipped).
  const chooseContentPack = async () => {
    const picked = await api.chooseContentDir();
    if (picked) setHasPack(await api.hasTexture('minecraft/block/stone'));
  };

  const hasRecents = recents.length > 0 || recentWorkspaces.length > 0 || recentWorlds.length > 0;

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="welcome-content">
          <header className="welcome-hero">
            <Logo size={52} className="welcome-mark" />
            <div className="welcome-hero-text">
              <h1>Blockwright</h1>
              <p className="welcome-tagline">{t('welcome.tagline')}</p>
            </div>
          </header>

          <div className="welcome-grid">
            <section className="welcome-start">
              <div className="prompt-card">
                <textarea
                  className="prompt-input"
                  rows={2}
                  value={prompt}
                  placeholder={t('welcome.promptPlaceholder')}
                  spellCheck={false}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                />
                <div className="prompt-foot">
                  <button className="btn primary prompt-go" onClick={submit}>
                    <Sparkles size={14} strokeWidth={1.8} aria-hidden />
                    {t('welcome.generateCta')}
                  </button>
                </div>
              </div>
              <div className="prompt-suggest">
                {EXAMPLES.map((ex) => (
                  <button key={ex} className="prompt-suggest-item" title={t(ex)} onClick={() => setPrompt(t(ex))}>
                    {t(ex)}
                  </button>
                ))}
              </div>

              <div className="start-heading">{t('welcome.openHeading')}</div>
              <div className="start-list">
                <StartRow
                  icon={<FileBox size={15} strokeWidth={1.8} aria-hidden />}
                  title={t('welcome.openTitle')}
                  sub={t('welcome.openSub')}
                  onClick={onOpen}
                />
                <StartRow
                  icon={<FolderOpen size={15} strokeWidth={1.8} aria-hidden />}
                  title={t('welcome.workspaceTitle')}
                  sub={t('welcome.workspaceSub')}
                  onClick={() => void api.openWorkspace()}
                />
                <StartRow
                  icon={<Globe size={15} strokeWidth={1.8} aria-hidden />}
                  title={t('welcome.worldTitle')}
                  sub={t('welcome.worldSub')}
                  onClick={() => onOpenWorld()}
                />
                <StartRow
                  icon={<LayoutGrid size={15} strokeWidth={1.8} aria-hidden />}
                  title={t('welcome.catalogTitle')}
                  sub={t('welcome.catalogSub')}
                  onClick={() => store.getState().setCatalogOpen(true)}
                />
              </div>

              <footer className="welcome-foot">
                {hasPack !== null ? (
                  <span className={`welcome-pack${hasPack ? '' : ' info'}`}>
                    <span className="welcome-pack-dot" />
                    {hasPack ? t('welcome.packDetected') : t('welcome.packMissing')}
                    {!hasPack && (
                      <button className="welcome-pack-action no-drag" onClick={() => void chooseContentPack()}>
                        {t('welcome.packChoose')}
                      </button>
                    )}
                  </span>
                ) : (
                  <span />
                )}
                <button className="welcome-guide-link" onClick={() => store.getState().setGuideOpen(true)}>
                  <BookOpen size={13} strokeWidth={1.8} aria-hidden />
                  {t('welcome.guideLink')}
                </button>
              </footer>
            </section>

            {hasRecents && (
              <aside className="welcome-side">
                {recents.length > 0 && (
                  <section className="side-list">
                    <div className="side-head">
                      <span className="side-title">{t('welcome.recentFiles')}</span>
                      <button className="link" onClick={() => void api.clearRecents()}>
                        {t('common.clear')}
                      </button>
                    </div>
                    <ul className="side-body">
                      {recents.slice(0, 6).map((p) => (
                        <li key={p} className="recent-row" title={p} onClick={() => onLoad(p)}>
                          <FileBox size={14} strokeWidth={1.7} aria-hidden />
                          <span className="recent-name">{basename(p)}</span>
                          <span className="recent-path">{dirname(p)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {recentWorkspaces.length > 0 && (
                  <section className="side-list">
                    <div className="side-head">
                      <span className="side-title">{t('welcome.recentWorkspaces')}</span>
                      <button className="link" onClick={() => void api.clearRecentWorkspaces()}>
                        {t('common.clear')}
                      </button>
                    </div>
                    <ul className="side-body">
                      {recentWorkspaces.slice(0, 4).map((ws) => (
                        <li
                          key={`${ws.namespace}:${ws.root}`}
                          className="recent-row"
                          title={`${ws.namespace} · ${ws.root}`}
                          onClick={() => onActivateWorkspace(ws)}
                        >
                          <FolderOpen size={14} strokeWidth={1.7} aria-hidden />
                          <span className="recent-name">{ws.name}</span>
                          <span className="recent-path">{ws.namespace}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {recentWorlds.length > 0 && (
                  <section className="side-list">
                    <div className="side-head">
                      <span className="side-title">{t('welcome.recentWorlds')}</span>
                      <button className="link" onClick={() => void api.clearRecentWorlds()}>
                        {t('common.clear')}
                      </button>
                    </div>
                    <ul className="side-body">
                      {recentWorlds.slice(0, 4).map((w) => (
                        <li key={w.root} className="recent-row" title={w.root} onClick={() => onOpenWorld(w.root)}>
                          <Globe size={14} strokeWidth={1.7} aria-hidden />
                          <span className="recent-name">{w.name}</span>
                          <span className="recent-path">{dirname(w.root)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </aside>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
