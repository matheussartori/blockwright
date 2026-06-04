// Settings ▸ About: app/Minecraft versions + credits. The single "About" surface —
// the native macOS About menu item routes here too (no separate Electron panel).
import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useApp } from '../../hooks/useStores';
import { Logo } from '../ui/Logo';

export function AboutTab() {
  const contentVersion = useApp((s) => s.contentVersion);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    void api.getAppVersion().then(setAppVersion);
  }, []);

  return (
    <section className="settings-group about">
      <Logo size={72} className="about-logo" />
      <div className="about-name">Blockwright</div>
      {appVersion && <div className="about-version">Version {appVersion}</div>}
      <p className="about-tagline">Build, view, and AI-generate Minecraft structures in 3D.</p>

      <dl className="about-meta">
        <div>
          <dt>App version</dt>
          <dd className="stat-num">{appVersion ?? '—'}</dd>
        </div>
        <div>
          <dt>Target Minecraft</dt>
          <dd className="stat-num">{contentVersion ?? '—'}</dd>
        </div>
        <div>
          <dt>Renderer</dt>
          <dd className="stat-num">Three.js</dd>
        </div>
      </dl>

      <div className="about-credits">
        <p>
          Crafted by <strong>Matheus Sartori</strong>. AI generation runs on the provider you choose in
          Settings ▸ AI — your Claude or ChatGPT subscription, or an Anthropic, OpenAI, or Gemini API key.
        </p>
        <p className="about-built">
          Built with Electron, Vite, React &amp; Three.js. Structure parsing by prismarine-nbt.
        </p>
      </div>
    </section>
  );
}
