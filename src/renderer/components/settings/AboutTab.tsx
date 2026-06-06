// Settings ▸ About: app/Minecraft versions + credits. The single "About" surface —
// the native macOS About menu item routes here too (no separate Electron panel).
import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useApp, useT } from '../../hooks/useStores';
import { Logo } from '../ui/Logo';

export function AboutTab() {
  const t = useT();
  const contentVersion = useApp((s) => s.contentVersion);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    void api.getAppVersion().then(setAppVersion);
  }, []);

  return (
    <section className="settings-group about">
      <Logo size={72} className="about-logo" />
      <div className="about-name">Blockwright</div>
      {appVersion && <div className="about-version">{t('about.version', { version: appVersion })}</div>}
      <p className="about-tagline">{t('about.tagline')}</p>

      <dl className="about-meta">
        <div>
          <dt>{t('about.appVersion')}</dt>
          <dd className="stat-num">{appVersion ?? '—'}</dd>
        </div>
        <div>
          <dt>{t('about.targetMinecraft')}</dt>
          <dd className="stat-num">{contentVersion ?? '—'}</dd>
        </div>
        <div>
          <dt>{t('about.renderer')}</dt>
          <dd className="stat-num">Three.js</dd>
        </div>
      </dl>

      <div className="about-credits">
        <p>
          {t('about.craftedBy')} <strong>Matheus Sartori</strong>{t('about.creditsRest')}
        </p>
        <p className="about-built">{t('about.built')}</p>
      </div>
    </section>
  );
}
