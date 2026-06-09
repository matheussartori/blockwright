// The Build Planner's config column — a PROGRESSIVE dynamic form. It's optional guidance
// (a build can come from a free-form prompt alone), so nothing shows until the one
// decision everything else hangs off of: which STRUCTURE to build. Step 1 is just the
// structure chooser (chips, grouped by family). Once a structure is picked, the options it
// UNLOCKS cascade in — decoration, roof + basement (filtered to what fits via `appliesTo`),
// the structure's tunable params, the build size, and the per-floor room stack (capped by
// the structure's own `maxRoomsPerFloor`). So the binding "choose a structure → see what it
// pulls in" is visible, not a wall of greyed selects. A pure view: the parent owns
// `BuildDetails` and passes the reducers in (generation/details.ts).
import { store } from '../../state/store';
import { moduleAppliesTo } from '@/shared/domain/applies-to';
import {
  type BuildDetails,
  effectiveSize,
  floorCount,
  maxRoomsForStructure,
} from '../../generation/brief';
import type { DetailField, SizeBox } from '../../generation/details';
import { Chip, ChipRow, ChipSelect, type ChipOption } from './chips';
import { FloorStack } from './FloorStack';
import type { MessageKey } from '@/shared/i18n';
import type { GenerationCatalog, GenerationModule } from '@/shared/types';

type T = (key: MessageKey) => string;

interface Props {
  details: BuildDetails;
  catalog: GenerationCatalog | null;
  busy: boolean;
  t: T;
  onField: (key: DetailField, value: string) => void;
  onParam: (name: string, value: string | number) => void;
  onSize: (axis: keyof SizeBox, value: number, base: SizeBox) => void;
  onAddRoom: (floor: number, id: string) => void;
  onRemoveRoom: (floor: number, index: number) => void;
}

export function DetailsSection({ details, catalog, busy, t, onField, onParam, onSize, onAddRoom, onRemoveRoom }: Props) {
  const selStruct = catalog?.structure.find((m) => m.id === details.structureType);
  const galleryLink = (
    <button className="link gen-gallery-link" onClick={() => store.getState().setModulesOpen(true)} disabled={busy}>
      {t('gen.detailsGalleryLink')}
    </button>
  );

  // STEP 1 — no structure yet: just the structure chooser. Everything else hangs off
  // this pick, so showing it alone keeps the first decision clear.
  if (!details.structureType) {
    const groups = catalog?.groups ?? [];
    const all = catalog?.structure ?? [];
    const inGroup = (g: string) => all.filter((m) => m.group === g);
    const ungrouped = all.filter((m) => !m.group || !groups.some((g) => g.id === m.group));
    return (
      <div className="gen-details">
        <div className="gen-pick-head">
          <span className="gen-pick-title">{t('gen.detailsStartTitle')}</span>
          <span className="gen-pick-hint">{t('gen.detailsStartHint')}</span>
        </div>
        {groups.map((g) => {
          const items = inGroup(g.id);
          return items.length ? (
            <ChipRow key={g.id} label={g.label}>
              {items.map((m) => (
                <Chip key={m.id} on={false} busy={busy} onPick={() => onField('structureType', m.id)}>
                  {m.label}
                </Chip>
              ))}
            </ChipRow>
          ) : null;
        })}
        {ungrouped.length > 0 && (
          <ChipRow label={groups.length ? t('gen.fieldStructure') : undefined}>
            {ungrouped.map((m) => (
              <Chip key={m.id} on={false} busy={busy} onPick={() => onField('structureType', m.id)}>
                {m.label}
              </Chip>
            ))}
          </ChipRow>
        )}
        <p className="gen-details-foot">{galleryLink}</p>
      </div>
    );
  }

  // STEP 2 — a structure is chosen: cascade in everything it unlocks. Roof / basement /
  // room options are filtered by the chosen structure's `appliesTo` (the SAME pure
  // predicate main uses to gate knowledge guides, so the two can't drift).
  const fits = (m: GenerationModule): boolean =>
    moduleAppliesTo(m.appliesTo, details.structureType || undefined, selStruct?.group);
  const nFloors = floorCount(selStruct, details.params);
  const roomOptions: ChipOption[] = (catalog?.room ?? []).filter(fits).map((m) => ({ id: m.id, label: m.label }));
  const roofs = (catalog?.roof ?? []).filter(fits);
  const basements = (catalog?.basement ?? []).filter(fits);
  const decorations = catalog?.decoration ?? [];

  const opts = (modules: GenerationModule[]): ChipOption[] =>
    modules.map((m) => ({ id: m.id, label: m.label }));

  return (
    // `key` re-mounts the cascade on a structure change, so the reveal animation replays.
    <div className="gen-details" key={details.structureType}>
      <div className="gen-config-head">
        <span className="gen-config-eyebrow">{t('gen.fieldStructure')}</span>
        <button
          className="gen-struct-pill"
          title={t('gen.detailsChangeTitle')}
          disabled={busy}
          onClick={() => onField('structureType', '')}
        >
          <span className="gen-struct-name">{selStruct?.label ?? details.structureType}</span>
          <span className="gen-struct-change">{t('gen.detailsChange')}</span>
        </button>
      </div>

      <ChipSelect
        label={t('gen.fieldDecoration')}
        value={details.decoration}
        neutral={{ id: '', label: t('gen.optDefault') }}
        options={opts(decorations)}
        busy={busy}
        onPick={(id) => onField('decoration', id)}
      />
      <ChipSelect
        label={t('gen.fieldRoof')}
        value={details.roof}
        neutral={{ id: '', label: t('gen.optAuto') }}
        options={opts(roofs)}
        busy={busy}
        onPick={(id) => onField('roof', id)}
      />
      <ChipSelect
        label={t('gen.fieldBasement')}
        value={details.basement}
        neutral={{ id: '', label: t('gen.optNone') }}
        options={opts(basements)}
        busy={busy}
        onPick={(id) => onField('basement', id)}
      />

      {(selStruct?.params ?? []).map((p) =>
        p.kind === 'int' ? (
          <div className="gen-chip-group" key={p.name}>
            <span className="gen-chip-label">{p.label}</span>
            <div className="gen-stepper">
              <input
                type="number"
                min={p.min}
                max={p.max}
                value={Number(details.params[p.name] ?? p.default)}
                disabled={busy}
                onChange={(e) => {
                  const n = Math.trunc(Number(e.target.value));
                  onParam(p.name, Math.max(p.min, Math.min(p.max, Number.isFinite(n) ? n : p.default)));
                }}
              />
              <span className="gen-stepper-range">{p.min}–{p.max}</span>
            </div>
          </div>
        ) : (
          <ChipSelect
            key={p.name}
            label={p.label}
            value={String(details.params[p.name] ?? p.default)}
            options={p.options.map((o) => ({ id: o.value, label: o.label }))}
            busy={busy}
            onPick={(id) => onParam(p.name, id)}
          />
        ),
      )}

      <div className="gen-chip-group">
        <span className="gen-chip-label">
          {t('gen.sizeLabel')}
          {details.size ? '' : t('gen.autoSuffix')}
        </span>
        <div className="gen-size">
          {(['w', 'd', 'h'] as const).map((axis) => {
            const sz = effectiveSize(details, selStruct);
            const label = axis === 'w' ? t('gen.width') : axis === 'd' ? t('gen.depth') : t('gen.height');
            return (
              <label key={axis} className="gen-size-axis">
                <span>{label[0]}</span>
                <input
                  type="number"
                  min={3}
                  max={64}
                  value={sz[axis]}
                  disabled={busy}
                  title={label}
                  onChange={(e) => onSize(axis, Math.trunc(Number(e.target.value)) || sz[axis], sz)}
                />
              </label>
            );
          })}
        </div>
      </div>

      {nFloors > 0 && roomOptions.length > 0 && (
        <FloorStack
          nFloors={nFloors}
          rooms={details.rooms}
          options={roomOptions}
          max={maxRoomsForStructure(selStruct)}
          busy={busy}
          t={t}
          onAdd={onAddRoom}
          onRemove={onRemoveRoom}
        />
      )}

      <p className="gen-details-foot">{galleryLink}</p>
    </div>
  );
}
