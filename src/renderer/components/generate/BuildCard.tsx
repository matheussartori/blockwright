// The presentable build card shown in the chat in place of the raw "[Build details]"
// prompt text. On a USER message it previews what was requested (structure + chips +
// per-floor rooms). On the ASSISTANT message of a finished build it's the COMPLETE
// card: the request PLUS the result (version/size/blocks) and a Reveal action for the
// saved library file — so the user can jump straight to the build's folder on disk.
import { api } from '../../api';
import { dirname } from '../../ui/path';
import type { MessageKey } from '@/shared/i18n';
import type { BuildBrief } from '@/shared/types';

export function BuildCard({ build, t }: { build: BuildBrief; t: (key: MessageKey) => string }) {
  const chips: { label: string; value: string }[] = [];
  if (build.decoration) chips.push({ label: t('gen.fieldDecoration'), value: build.decoration });
  if (build.roof) chips.push({ label: t('gen.fieldRoof'), value: build.roof });
  if (build.basement) chips.push({ label: t('gen.fieldBasement'), value: build.basement });
  if (build.attic) chips.push({ label: t('gen.fieldAttic'), value: build.attic });
  if (build.size) chips.push({ label: t('gen.statSize'), value: build.size.join('×') });
  if (build.blockCount != null) chips.push({ label: t('gen.statBlocks'), value: build.blockCount.toLocaleString() });
  const title = build.structure ?? t('gen.cardStructure');
  return (
    <div className="gen-build-card">
      <div className="gen-build-card-head">
        <span className="gen-build-card-icon" aria-hidden>🏠</span>
        <span className="gen-build-card-title">{title}</span>
        {build.version != null && <span className="gen-build-card-version">v{build.version}</span>}
      </div>
      {build.prompt && <div className="gen-build-card-prompt">{build.prompt}</div>}
      {chips.length > 0 && (
        <div className="gen-build-card-chips">
          {chips.map((c) => (
            <span key={c.label} className="gen-build-chip">
              <span className="gen-build-chip-label">{c.label}</span>
              <span className="gen-build-chip-value">{c.value}</span>
            </span>
          ))}
        </div>
      )}
      {build.floors && build.floors.some((f) => f.rooms.length > 0) && (
        <ul className="gen-build-floors">
          {build.floors.map((f, i) => (
            <li key={i} className="gen-build-floor">
              <span className="gen-build-floor-name">{f.name}</span>
              <span className="gen-build-floor-rooms">
                {f.rooms.length ? f.rooms.join(' · ') : t('gen.roomEmpty')}
              </span>
            </li>
          ))}
        </ul>
      )}
      {build.libraryPath && (
        <div className="gen-build-card-actions">
          {/* This tab IS the saved build now (the project file is open here), so there's
              no "Open" — only Reveal, to find the folder + its versions/generation.log. */}
          <button
            className="btn sm ghost no-drag"
            onClick={() => void api.revealPath(dirname(build.libraryPath!))}
            title={t('gen.revealBuildTitle')}
          >
            {t('gen.revealBuild')}
          </button>
        </div>
      )}
    </div>
  );
}
