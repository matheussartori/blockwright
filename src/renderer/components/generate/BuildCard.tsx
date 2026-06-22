// The presentable build card shown in the chat in place of the raw "[Build details]"
// prompt text. On a USER message it previews what was requested (structure + chips +
// per-floor rooms). On the ASSISTANT message of a finished build it's the COMPLETE
// card: the request PLUS the result (version/size/blocks) and a Reveal action for the
// saved library file — so the user can jump straight to the build's folder on disk.
import { api } from '../../api';
import { basename, dirname } from '../../ui/path';
import { store } from '../../state/store';
import { sanitizeResourceName } from '@/shared/domain/worldgen';
import { MODULE_SLOTS } from '@/shared/domain/module-slots';
import type { MessageKey } from '@/shared/i18n';
import type { BuildBrief } from '@/shared/types';

export function BuildCard({ build, t }: { build: BuildBrief; t: (key: MessageKey) => string }) {
  const chips: { label: string; value: string; title?: string }[] = [];
  // One chip per picked slot (decoration/roof/basement/attic), in registry order.
  for (const slot of MODULE_SLOTS) {
    const value = build[slot.key];
    if (value) chips.push({ label: t(slot.fieldLabel), value });
  }
  // The storey count, so a build's floors read at a glance even before the per-floor list.
  if (build.floors && build.floors.length > 0) {
    chips.push({ label: t('gen.statFloors'), value: String(build.floors.length), title: t('gen.statFloorsTitle') });
  }
  if (build.size) chips.push({ label: t('gen.statSize'), value: build.size.join('×'), title: t('gen.statSizeTitle') });
  if (build.blockCount != null) {
    chips.push({ label: t('gen.statBlocks'), value: build.blockCount.toLocaleString(), title: t('gen.statBlocksTitle') });
  }
  const title = build.structure ?? t('gen.cardStructure');
  return (
    <div className="gen-build-card">
      <div className="gen-build-card-head">
        <span className="gen-build-card-icon" aria-hidden>🏠</span>
        <span className="gen-build-card-titles">
          {/* The structure FAMILY (House / Tower …) above the type, so a "Classic" is never
              ambiguous between a house and a tower. */}
          {build.group && <span className="gen-build-card-group">{build.group}</span>}
          <span className="gen-build-card-title">{title}</span>
        </span>
        {build.version != null && <span className="gen-build-card-version">v{build.version}</span>}
      </div>
      {build.prompt && <div className="gen-build-card-prompt">{build.prompt}</div>}
      {chips.length > 0 && (
        <div className="gen-build-card-chips">
          {chips.map((c) => (
            <span key={c.label} className="gen-build-chip" title={c.title}>
              <span className="gen-build-chip-label">{c.label}</span>
              <span className="gen-build-chip-value">{c.value}</span>
            </span>
          ))}
        </div>
      )}
      {/* The per-floor breakdown — shown whenever the structure is storeyed (not only when
          rooms were assigned), with each storey's height so the floor sizing is visible. */}
      {build.floors && build.floors.length > 0 && (
        <ul className="gen-build-floors">
          {build.floors.map((f, i) => (
            <li key={i} className="gen-build-floor">
              <span className="gen-build-floor-name">{f.name}</span>
              {f.height != null && (
                <span className="gen-build-floor-height" title={t('gen.cardFloorHeightTitle')}>↕{f.height}</span>
              )}
              <span className="gen-build-floor-rooms">
                {f.rooms.length ? f.rooms.join(' · ') : t('gen.roomEmpty')}
              </span>
            </li>
          ))}
        </ul>
      )}
      {build.libraryPath && (
        <div className="gen-build-card-actions">
          {/* The headline action for a mod dev: drop this build straight into the active
              workspace's data pack (the .nbt + its worldgen JSON), via the export dialog. */}
          <button
            className="btn sm primary no-drag"
            onClick={() =>
              store.getState().setExportTarget({
                path: build.libraryPath!,
                name: sanitizeResourceName(basename(build.libraryPath!).replace(/\.nbt$/i, '')),
              })
            }
            title={t('gen.exportBuildTitle')}
          >
            {t('gen.exportBuild')}
          </button>
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
