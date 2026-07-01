// The Build Planner's config column — a PROGRESSIVE dynamic form. It's optional guidance
// (a build can come from a free-form prompt alone), so nothing shows until the one
// decision everything else hangs off of: which STRUCTURE to build. Step 1 is just the
// structure chooser (chips, grouped by family). Once a structure is picked, the options it
// UNLOCKS cascade in — decoration, roof + basement (filtered to what fits via `appliesTo`),
// the structure's tunable params, the build size, and the per-floor room stack (capped by
// the structure's own `maxRoomsPerFloor`). So the binding "choose a structure → see what it
// pulls in" is visible, not a wall of greyed selects. A pure view: the parent owns
// `BuildDetails` and passes the reducers in (generation/details.ts).
import { useState } from 'react';
import { store } from '../../state/store';
import { moduleAppliesTo } from '@/shared/domain/applies-to';
import { modulesConflict } from '@/shared/domain/conflicts';
import { MODULE_SLOTS } from '@/shared/domain/module-slots';
import {
  type BuildDetails,
  MAX_BASEMENT_LEVELS,
  MAX_STOREY_H,
  MIN_FLOOR_H,
  basementAreaOf,
  basementHeightsOf,
  effectiveSize,
  floorCount,
  maxRoomsForStructure,
  previewOverheads,
  surroundRing,
} from '../../generation/brief';
import { type BandKey, type DetailField, type SizeBox, SIZE_MAX, SIZE_MIN } from '../../generation/details';
import {
  type SurroundSizing,
  SURROUND_MARGIN_MAX,
  SURROUND_MARGIN_MIN,
  SURROUND_MARGIN_STEP,
} from '@/shared/domain/surroundings';
import type { ChipOption } from './chips';
import { Select, type SelectOption } from '../ui/Select';
import { Stepper } from '../ui/Stepper';
import { LinkToggle, SizePanel, SizeRow } from './size-controls';
import { FloorStack } from './FloorStack';
import { ATTIC_COLOR, BASEMENT_COLOR } from './BuildScalePreview';
import type { TFunction } from '@/shared/i18n';
import type { GenerationCatalog, GenerationModule } from '@/shared/types';

type T = TFunction;

interface Props {
  details: BuildDetails;
  catalog: GenerationCatalog | null;
  busy: boolean;
  t: T;
  onField: (key: DetailField, value: string) => void;
  onParam: (name: string, value: string | number) => void;
  onSize: (axis: keyof SizeBox, value: number, base: SizeBox) => void;
  onFloorHeight: (index: number, value: number, linked: boolean) => void;
  onBandHeight: (band: BandKey, value: number) => void;
  onSurroundSize: (sizing: SurroundSizing | null) => void;
  onBasementLevels: (n: number) => void;
  onBasementLevelHeight: (index: number, value: number, linked: boolean) => void;
  onBasementArea: (axis: 'w' | 'd', value: number, base: { w: number; d: number }) => void;
  onAddRoom: (floor: number, id: string) => void;
  onRemoveRoom: (floor: number, index: number) => void;
}

export function DetailsSection({
  details,
  catalog,
  busy,
  t,
  onField,
  onParam,
  onSize,
  onFloorHeight,
  onBandHeight,
  onSurroundSize,
  onBasementLevels,
  onBasementLevelHeight,
  onBasementArea,
  onAddRoom,
  onRemoveRoom,
}: Props) {
  // Whether the per-floor height inputs move together (the chain affordance). Local —
  // it's an editing convenience, not part of the build model; resets when the cascade
  // re-mounts on a structure change (see the `key` below).
  const [linked, setLinked] = useState(true);
  const selStruct = catalog?.structure.find((m) => m.id === details.structureType);
  // Resolve a module's `group` id (a structure family OR a room program group) to its
  // label, so both the structure picker and the room picker can header by family.
  const groupLabel = (gid?: string) => catalog?.groups?.find((g) => g.id === gid)?.label;
  const galleryLink = (
    <button className="link gen-gallery-link" onClick={() => store.getState().setModulesOpen(true)} disabled={busy}>
      {t('gen.detailsGalleryLink')}
    </button>
  );

  // STEP 1 — no structure yet: just the structure chooser. Everything else hangs off
  // this pick, so showing it alone keeps the first decision clear. The choices carry a
  // short description (the module's own summary), shown under each option in the dropdown,
  // and their FAMILY (the structure group, e.g. "House") — the menu headers each group
  // and a search result keeps the group name on the row.
  if (!details.structureType) {
    const structOptions: SelectOption[] = (catalog?.structure ?? []).map((m) => ({
      value: m.id,
      label: m.label,
      description: m.description,
      group: groupLabel(m.group),
    }));
    return (
      <div className="gen-details">
        <div className="gen-pick-head">
          <span className="gen-pick-title">{t('gen.detailsStartTitle')}</span>
          <span className="gen-pick-hint">{t('gen.detailsStartHint')}</span>
        </div>
        <div className="gen-chip-group">
          <span className="gen-chip-label">{t('gen.fieldStructure')}</span>
          <Select
            value=""
            placeholder={t('gen.structurePlaceholder')}
            options={structOptions}
            onChange={(id) => onField('structureType', id)}
            disabled={busy}
            ariaLabel={t('gen.fieldStructure')}
            searchable
            searchPlaceholder={t('gen.selectSearch')}
            noResultsLabel={t('gen.selectNoResults')}
          />
        </div>
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
  const roomOptions: ChipOption[] = (catalog?.room ?? [])
    .filter(fits)
    .map((m) => ({ id: m.id, label: m.label, description: m.description, group: groupLabel(m.group) }));

  // The currently-selected module in each slot, so a conflicting OPTION in another slot
  // (e.g. an attic when the flat roof is picked) can be greyed with a reason — the SAME
  // `modulesConflict` the gallery uses, now generic across every slot pair.
  const selectedModules = MODULE_SLOTS
    .map((slot) => (catalog?.[slot.key] ?? []).find((m) => m.id === details[slot.key]))
    .filter((m): m is GenerationModule => !!m);
  const conflictReason = (opt: GenerationModule): string | undefined => {
    const clash = selectedModules.find((m) => m.id !== opt.id && modulesConflict(m, opt));
    return clash ? t('modules.conflictWith', { label: clash.label }) : undefined;
  };

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

      {/* One dropdown per single-select module slot, in registry order. A filtered slot with
          nothing applicable to this structure is hidden (e.g. an attic on a cabin). */}
      {MODULE_SLOTS.map((slot) => {
        const all = catalog?.[slot.key] ?? [];
        const options = slot.filtered ? all.filter(fits) : all;
        if (slot.filtered && options.length === 0) return null;
        const selectOpts: SelectOption[] = [
          { value: '', label: t(slot.neutral) },
          ...options.map((m) => {
            const reason = conflictReason(m);
            return { value: m.id, label: m.label, description: m.description, disabled: !!reason, title: reason };
          }),
        ];
        return (
          <div className="gen-chip-group" key={slot.key}>
            <span className="gen-chip-label">{t(slot.fieldLabel)}</span>
            <Select
              value={details[slot.key]}
              options={selectOpts}
              onChange={(id) => onField(slot.key, id)}
              disabled={busy}
              ariaLabel={t(slot.fieldLabel)}
            />
          </div>
        );
      })}

      {(selStruct?.params ?? []).map((p) =>
        p.kind === 'int' ? (
          <div className="gen-chip-group gen-chip-row" key={p.name}>
            <span className="gen-chip-label">{p.label}</span>
            <Stepper
              value={Number(details.params[p.name] ?? p.default)}
              min={p.min}
              max={p.max}
              disabled={busy}
              ariaLabel={p.label}
              onChange={(n) => onParam(p.name, n)}
            />
          </div>
        ) : (
          <div className="gen-chip-group" key={p.name}>
            <span className="gen-chip-label">{p.label}</span>
            <Select
              value={String(details.params[p.name] ?? p.default)}
              options={p.options.map((o) => ({ value: o.value, label: o.label }))}
              onChange={(id) => onParam(p.name, id)}
              disabled={busy}
              ariaLabel={p.label}
            />
          </div>
        ),
      )}

      <SizeSection
        details={details}
        sz={effectiveSize(details, selStruct)}
        overheads={previewOverheads(details, selStruct)}
        linked={linked}
        setLinked={setLinked}
        busy={busy}
        t={t}
        onSize={onSize}
        onFloorHeight={onFloorHeight}
        onBandHeight={onBandHeight}
      />

      {!!details.basement && details.basement !== 'none' && (
        <BasementSection
          details={details}
          struct={selStruct}
          busy={busy}
          t={t}
          onBasementLevels={onBasementLevels}
          onBasementLevelHeight={onBasementLevelHeight}
          onBasementArea={onBasementArea}
        />
      )}

      {!!details.surroundings && details.surroundings !== 'none' && (
        <YardSizeSection ring={surroundRing(details, selStruct)} busy={busy} t={t} onSurroundSize={onSurroundSize} />
      )}

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

/** The build-size controls: the house FOOTPRINT box plus the per-storey height stack. Two
 *  boxed sub-panels with comfortable +/- {@link Stepper}s (no more tiny native spinner
 *  arrows): a Footprint card (W × D, plus H for a non-storeyed type) and — for a storeyed
 *  structure — a Stories card with one stepper per above-ground floor (a chain toggle moves
 *  them together) topped by an Attic row when picked (the attic owns the whole attic + roof
 *  zone), with the total height read out as the derived sum. The basement is sized in its own
 *  {@link BasementSection} below. */
function SizeSection({
  details,
  sz,
  overheads,
  linked,
  setLinked,
  busy,
  t,
  onSize,
  onFloorHeight,
  onBandHeight,
}: {
  details: BuildDetails;
  sz: SizeBox;
  overheads: { basement: number; attic: number; roof: number };
  linked: boolean;
  setLinked: (v: boolean) => void;
  busy: boolean;
  t: T;
  onSize: (axis: keyof SizeBox, value: number, base: SizeBox) => void;
  onFloorHeight: (index: number, value: number, linked: boolean) => void;
  onBandHeight: (band: BandKey, value: number) => void;
}) {
  const heights = details.floorHeights;
  const perFloor = !!heights && heights.length > 0;
  const footprintAxes: (keyof SizeBox)[] = perFloor ? ['w', 'd'] : ['w', 'd', 'h'];
  const axisLabel = (a: keyof SizeBox) => (a === 'w' ? t('gen.width') : a === 'd' ? t('gen.depth') : t('gen.height'));

  return (
    <SizePanel
      label={
        <>
          {t('gen.sizeLabel')}
          {details.size || perFloor ? '' : t('gen.autoSuffix')}
        </>
      }
    >
      {/* Footprint card — the house W × D (and H for a non-storeyed type). */}
      <div className="gen-size-card">
        <span className="gen-size-card-head">{t('gen.footprintLabel')}</span>
        {footprintAxes.map((axis) => (
          <SizeRow
            key={axis}
            tag={axisLabel(axis)}
            ariaLabel={axisLabel(axis)}
            value={sz[axis]}
            min={SIZE_MIN}
            max={SIZE_MAX}
            busy={busy}
            onChange={(n) => onSize(axis, n, sz)}
          />
        ))}
      </div>

      {/* Stories card — per-floor heights (above ground) + the attic band, with the chain. */}
      {perFloor && heights && (
        <div className="gen-size-card">
          <div className="gen-size-card-headrow">
            <span className="gen-size-card-head">{t('gen.storiesLabel')}</span>
            <LinkToggle linked={linked} setLinked={setLinked} busy={busy} t={t} />
          </div>
          {heights.map((h, i) => (
            <SizeRow
              key={i}
              tag={<>{t('gen.roomFloor')} {i + 1}</>}
              ariaLabel={`${t('gen.roomFloor')} ${i + 1}`}
              value={h}
              min={MIN_FLOOR_H}
              max={MAX_STOREY_H}
              busy={busy}
              onChange={(n) => onFloorHeight(i, n, linked)}
            />
          ))}
          {details.attic && (
            <SizeRow
              tag={
                <>
                  <span className="planner-legend-dot" style={{ background: ATTIC_COLOR }} />
                  {t('gen.fieldAttic')}
                </>
              }
              ariaLabel={t('gen.fieldAttic')}
              value={overheads.attic}
              min={MIN_FLOOR_H}
              max={MAX_STOREY_H}
              busy={busy}
              onChange={(n) => onBandHeight('attic', n)}
            />
          )}
          <div className="gen-size-total">
            <span>{t('gen.totalHeightLabel')}</span>
            <span className="gen-size-total-val">{sz.h}</span>
          </div>
        </div>
      )}
    </SizePanel>
  );
}

/** The basement-size controls (shown only when a basement module is picked): a card with a
 *  LEVELS stepper (how many storeys to dig, 1..{@link MAX_BASEMENT_LEVELS}), one per-level
 *  HEIGHT stepper (B1 = the level just under the ground, deeper levels below; a chain toggle
 *  links them), and a FOOTPRINT W × D pair (the basement's own area — enlarging it past the
 *  house grows the compiled box and excavates the undercroft beyond the house walls). */
function BasementSection({
  details,
  struct,
  busy,
  t,
  onBasementLevels,
  onBasementLevelHeight,
  onBasementArea,
}: {
  details: BuildDetails;
  struct: GenerationModule | undefined;
  busy: boolean;
  t: T;
  onBasementLevels: (n: number) => void;
  onBasementLevelHeight: (index: number, value: number, linked: boolean) => void;
  onBasementArea: (axis: 'w' | 'd', value: number, base: { w: number; d: number }) => void;
}) {
  const [linked, setLinked] = useState(true);
  const levels = basementHeightsOf(details);
  const area = basementAreaOf(details, struct) ?? { w: SIZE_MIN, d: SIZE_MIN };

  return (
    <SizePanel
      label={
        <>
          <span className="planner-legend-dot" style={{ background: BASEMENT_COLOR }} />
          {t('gen.fieldBasement')}
        </>
      }
    >
      <div className="gen-size-card">
        <SizeRow
          tag={t('gen.basementLevels')}
          ariaLabel={t('gen.basementLevels')}
          value={levels.length}
          min={1}
          max={MAX_BASEMENT_LEVELS}
          busy={busy}
          onChange={onBasementLevels}
        />
        <div className="gen-size-card-headrow gen-size-card-subhead">
          <span className="gen-size-card-head">{t('gen.height')}</span>
          {levels.length > 1 && <LinkToggle linked={linked} setLinked={setLinked} busy={busy} t={t} />}
        </div>
        {levels.map((h, i) => (
          <SizeRow
            key={i}
            tag={t('gen.basementLevelTag').replace('{n}', String(i + 1))}
            ariaLabel={t('gen.basementLevelTag').replace('{n}', String(i + 1))}
            value={h}
            min={MIN_FLOOR_H}
            max={MAX_STOREY_H}
            busy={busy}
            onChange={(n) => onBasementLevelHeight(i, n, linked)}
          />
        ))}
      </div>

      <div className="gen-size-card">
        <span className="gen-size-card-head">{t('gen.basementFootprint')}</span>
        {(['w', 'd'] as const).map((axis) => (
          <SizeRow
            key={axis}
            tag={axis === 'w' ? t('gen.width') : t('gen.depth')}
            ariaLabel={axis === 'w' ? t('gen.width') : t('gen.depth')}
            value={area[axis]}
            min={SIZE_MIN}
            max={SIZE_MAX}
            busy={busy}
            onChange={(n) => onBasementArea(axis, n, area)}
          />
        ))}
      </div>
    </SizePanel>
  );
}

/** The surroundings yard-size control (shown only when a surroundings ring is picked) —
 *  the SAME boxed card as the height/footprint panels. Two manual cell {@link Stepper}s:
 *  yard WIDTH (the X / side margins, each side) and yard DEPTH (the Z / front+back margins),
 *  nudged in {@link SURROUND_MARGIN_STEP}-cell steps. The values shown are the current ring
 *  margins (the auto, footprint-scaled ones until the user edits, then their explicit
 *  override). Editing WIDTH keeps the auto front/back; editing DEPTH sets front = back. */
function YardSizeSection({
  ring,
  busy,
  t,
  onSurroundSize,
}: {
  ring: { side: number; front: number; back: number } | null;
  busy: boolean;
  t: T;
  onSurroundSize: (sizing: SurroundSizing | null) => void;
}) {
  if (!ring) return null;
  return (
    <SizePanel
      className="gen-yard-size"
      label={
        <>
          <span className="planner-legend-dot" style={{ background: 'var(--surround-dot, #4f9e5a)' }} />
          {t('gen.fieldYardSize')}
        </>
      }
    >
      <div className="gen-size-card">
        <SizeRow
          tag={t('gen.yardWidth')}
          ariaLabel={t('gen.yardWidth')}
          value={ring.side}
          min={SURROUND_MARGIN_MIN}
          max={SURROUND_MARGIN_MAX}
          step={SURROUND_MARGIN_STEP}
          busy={busy}
          onChange={(n) => onSurroundSize({ side: n, front: ring.front, back: ring.back })}
        />
        <SizeRow
          tag={t('gen.yardDepth')}
          ariaLabel={t('gen.yardDepth')}
          value={ring.front}
          min={SURROUND_MARGIN_MIN}
          max={SURROUND_MARGIN_MAX}
          step={SURROUND_MARGIN_STEP}
          busy={busy}
          onChange={(n) => onSurroundSize({ side: ring.side, front: n, back: n })}
        />
        <div className="gen-size-total">
          <span>{t('gen.yardRingHint')}</span>
          <span className="gen-size-total-val">{ring.side * 2 + ring.front + ring.back}</span>
        </div>
      </div>
    </SizePanel>
  );
}
