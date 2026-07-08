// The presentable build card shown in the chat in place of the raw "[Build details]"
// prompt text. On a USER message it previews what was requested; on the ASSISTANT message
// of a finished build it's the COMPLETE card — the request PLUS the result (version/size/
// blocks) and a Reveal action for the saved library file. It reads as a compact build
// MANIFEST: an identity header, the quoted request, a quantitative stats strip, a spec
// grid of every module pick (incl. the mod-block preference), the per-floor plan, the
// auto-fixes note, and the export/reveal actions — so every informed field is visible.
import { Fragment } from 'react';
import { Boxes, Wrench } from 'lucide-react';
import { api } from '../../api';
import { basename, dirname } from '../../ui/path';
import { store } from '../../state/store';
import { windowsStore } from '../../state/windows';
import { sanitizeResourceName } from '@/shared/domain/worldgen';
import { MODULE_SLOTS } from '@/shared/domain/module-slots';
import type { MessageKey } from '@/shared/i18n';
import type { BuildBrief, ModBlockScope } from '@/shared/types';

// The mod-block scope (off/mix/prefer) → its localized label, so the card re-localizes a
// persisted brief instead of freezing the language at build time.
const SCOPE_LABEL: Record<ModBlockScope, MessageKey> = {
  off: 'catalog.scopeOff',
  mix: 'catalog.scopeMix',
  prefer: 'catalog.scopePrefer',
};

export function BuildCard({ build, t }: { build: BuildBrief; t: (key: MessageKey) => string }) {
  // The quantitative headline facts — shown big, in mono, as a stat strip.
  const stats: { value: string; label: string; title?: string }[] = [];
  if (build.size) stats.push({ value: build.size.join('×'), label: t('gen.statSize'), title: t('gen.statSizeTitle') });
  if (build.floors && build.floors.length > 0) {
    stats.push({ value: String(build.floors.length), label: t('gen.statFloors'), title: t('gen.statFloorsTitle') });
  }
  if (build.blockCount != null) {
    stats.push({ value: build.blockCount.toLocaleString(), label: t('gen.statBlocks'), title: t('gen.statBlocksTitle') });
  }

  // The qualitative module picks as a label→value spec grid — generic over MODULE_SLOTS
  // (decoration/roof/basement/attic/surroundings), plus the mod-block preference when a
  // mod workspace drove the build. A new slot category appears here for free.
  const specs: { key: string; value: string }[] = [];
  for (const slot of MODULE_SLOTS) {
    const value = build[slot.key];
    if (value) specs.push({ key: t(slot.fieldLabel), value });
  }
  if (build.modBlocks) specs.push({ key: t('gen.cardModBlocks'), value: t(SCOPE_LABEL[build.modBlocks]) });

  const title = build.structure ?? t('gen.cardStructure');
  return (
    <div className="gen-build-card">
      <div className="gen-build-card-head">
        <span className="gen-build-card-icon" aria-hidden>
          <Boxes size={17} strokeWidth={1.9} />
        </span>
        <span className="gen-build-card-titles">
          {/* The structure FAMILY (House / Tower …) above the type, so a "Classic" is never
              ambiguous between a house and a tower. */}
          {build.group && <span className="gen-build-card-group">{build.group}</span>}
          <span className="gen-build-card-title">{title}</span>
        </span>
        {build.version != null && <span className="gen-build-card-version">v{build.version}</span>}
      </div>

      {/* The user's request, quoted — only on the assistant result card (the user message
          shows its own text bubble above). */}
      {build.prompt && <div className="gen-build-card-prompt">{build.prompt}</div>}

      {stats.length > 0 && (
        <div className="gen-build-stats">
          {stats.map((s) => (
            <div key={s.label} className="gen-build-stat" title={s.title}>
              <span className="gen-build-stat-value">{s.value}</span>
              <span className="gen-build-stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {specs.length > 0 && (
        <dl className="gen-build-specs">
          {specs.map((s) => (
            <Fragment key={s.key}>
              <dt className="gen-build-spec-key">{s.key}</dt>
              <dd className="gen-build-spec-val">{s.value}</dd>
            </Fragment>
          ))}
        </dl>
      )}

      {/* The per-floor plan — shown whenever the structure is storeyed (not only when rooms
          were assigned), each storey's height pill making the floor sizing visible. */}
      {build.floors && build.floors.length > 0 && (
        <ul className="gen-build-floors">
          {build.floors.map((f, i) => (
            <li key={i} className="gen-build-floor">
              <span className="gen-build-floor-name">{f.name}</span>
              {f.height != null && (
                <span className="gen-build-floor-height" title={t('gen.cardFloorHeightTitle')}>↕{f.height}</span>
              )}
              <span className={`gen-build-floor-rooms${f.rooms.length ? '' : ' empty'}`}>
                {f.rooms.length ? f.rooms.join(' · ') : t('gen.roomEmpty')}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Auto-repairs the compile pipeline applied (stairwells, doors, shell restore…) —
          surfaced so the fixes aren't silent; the full list is on hover. */}
      {build.fixes && build.fixes.length > 0 && (
        <div className="gen-build-fixes" title={build.fixes.join('\n')}>
          <Wrench size={13} strokeWidth={1.9} aria-hidden />
          <span>
            {build.fixes.length} {t('gen.autoFixes')}
          </span>
        </div>
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
          {/* The Bill of Materials for this build (the tab's open structure). */}
          <button
            className="btn sm ghost no-drag"
            onClick={() => windowsStore.getState().openPanel('materials')}
            title={t('gen.materialsTitle')}
          >
            {t('gen.materials')}
          </button>
        </div>
      )}
    </div>
  );
}
