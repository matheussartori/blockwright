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
import { Link2, Unlink } from 'lucide-react';
import { store } from '../../state/store';
import { moduleAppliesTo } from '@/shared/domain/applies-to';
import { modulesConflict } from '@/shared/domain/conflicts';
import { MODULE_SLOTS } from '@/shared/domain/module-slots';
import {
  type BuildDetails,
  MAX_STOREY_H,
  MIN_FLOOR_H,
  effectiveSize,
  floorCount,
  maxRoomsForStructure,
  previewOverheads,
} from '../../generation/brief';
import type { BandKey, DetailField, SizeBox } from '../../generation/details';
import type { ChipOption } from './chips';
import { Select, type SelectOption } from '../ui/Select';
import { Segmented } from '../ui/Segmented';
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
  onHeightMode: (mode: 'total' | 'floors') => void;
  onFloorHeight: (index: number, value: number, linked: boolean) => void;
  onBandHeight: (band: BandKey, value: number) => void;
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
  onHeightMode,
  onFloorHeight,
  onBandHeight,
  onAddRoom,
  onRemoveRoom,
}: Props) {
  // Whether the per-floor height inputs move together (the chain affordance). Local —
  // it's an editing convenience, not part of the build model; resets when the cascade
  // re-mounts on a structure change (see the `key` below).
  const [linked, setLinked] = useState(true);
  const selStruct = catalog?.structure.find((m) => m.id === details.structureType);
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
    const groupLabel = (gid?: string) => catalog?.groups?.find((g) => g.id === gid)?.label;
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
    .map((m) => ({ id: m.id, label: m.label, description: m.description }));

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
        nFloors={nFloors}
        linked={linked}
        setLinked={setLinked}
        busy={busy}
        t={t}
        onSize={onSize}
        onHeightMode={onHeightMode}
        onFloorHeight={onFloorHeight}
        onBandHeight={onBandHeight}
      />

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

/** The build-size controls: the W/D/H box plus — for a storeyed structure — a Total ⇄ Per
 *  floor height switch. In "per floor" mode the single H field is replaced by one input per
 *  storey with a chain toggle (linked = raise one, raise all), bracketed by a Basement row
 *  below and an Attic row on top when those slots are picked (the attic is the topmost
 *  band — it owns the whole attic + roof zone); the total height then reads out as the
 *  derived sum. */
function SizeSection({
  details,
  sz,
  overheads,
  nFloors,
  linked,
  setLinked,
  busy,
  t,
  onSize,
  onHeightMode,
  onFloorHeight,
  onBandHeight,
}: {
  details: BuildDetails;
  sz: SizeBox;
  overheads: { basement: number; attic: number; roof: number };
  nFloors: number;
  linked: boolean;
  setLinked: (v: boolean) => void;
  busy: boolean;
  t: T;
  onSize: (axis: keyof SizeBox, value: number, base: SizeBox) => void;
  onHeightMode: (mode: 'total' | 'floors') => void;
  onFloorHeight: (index: number, value: number, linked: boolean) => void;
  onBandHeight: (band: BandKey, value: number) => void;
}) {
  const heights = details.floorHeights;
  const perFloor = !!heights && heights.length > 0;
  // The switch shows for any multi-storey build (and stays available while per-floor is on,
  // so the user can always return to Total). A single-storey build is just a height field.
  const showToggle = nFloors >= 2 || perFloor;
  const axes: (keyof SizeBox)[] = perFloor ? ['w', 'd'] : ['w', 'd', 'h'];
  const axisLabel = (a: keyof SizeBox) => (a === 'w' ? t('gen.width') : a === 'd' ? t('gen.depth') : t('gen.height'));

  return (
    <div className="gen-chip-group">
      <div className="gen-size-head">
        <span className="gen-chip-label">
          {t('gen.sizeLabel')}
          {details.size || perFloor ? '' : t('gen.autoSuffix')}
        </span>
        {showToggle && (
          <Segmented
            value={perFloor ? 'floors' : 'total'}
            options={[
              { value: 'total', label: t('gen.heightTotalMode') },
              { value: 'floors', label: t('gen.heightFloorsMode') },
            ]}
            onChange={(m) => onHeightMode(m as 'total' | 'floors')}
            ariaLabel={t('gen.height')}
          />
        )}
      </div>

      <div className="gen-size">
        {axes.map((axis) => (
          <label key={axis} className="gen-size-axis">
            <span>{axisLabel(axis)[0]}</span>
            <input
              type="number"
              min={3}
              max={64}
              value={sz[axis]}
              disabled={busy}
              title={axisLabel(axis)}
              onChange={(e) => onSize(axis, Math.trunc(Number(e.target.value)) || sz[axis], sz)}
            />
          </label>
        ))}
      </div>

      {perFloor && heights && (
        <div className="gen-floor-heights">
          <div className="gen-floor-heights-head">
            <span className="gen-chip-label">{t('gen.height')}</span>
            <button
              type="button"
              className={`gen-link-toggle${linked ? ' on' : ''}`}
              aria-pressed={linked}
              disabled={busy}
              title={linked ? t('gen.linkHeights') : t('gen.unlinkHeights')}
              aria-label={linked ? t('gen.linkHeights') : t('gen.unlinkHeights')}
              onClick={() => setLinked(!linked)}
            >
              {linked ? <Link2 size={14} strokeWidth={1.9} aria-hidden /> : <Unlink size={14} strokeWidth={1.9} aria-hidden />}
            </button>
          </div>
          {details.basement && (
            <label className="gen-floor-height">
              <span className="gen-floor-height-tag">
                <span className="planner-legend-dot" style={{ background: BASEMENT_COLOR }} />
                {t('gen.fieldBasement')}
              </span>
              <input
                type="number"
                min={MIN_FLOOR_H}
                max={MAX_STOREY_H}
                value={overheads.basement}
                disabled={busy}
                onChange={(e) => onBandHeight('basement', Math.trunc(Number(e.target.value)) || overheads.basement)}
              />
            </label>
          )}
          {heights.map((h, i) => (
            <label key={i} className="gen-floor-height">
              <span className="gen-floor-height-tag">
                {t('gen.roomFloor')} {i + 1}
              </span>
              <input
                type="number"
                min={MIN_FLOOR_H}
                max={MAX_STOREY_H}
                value={h}
                disabled={busy}
                onChange={(e) => onFloorHeight(i, Math.trunc(Number(e.target.value)) || h, linked)}
              />
            </label>
          ))}
          {details.attic && (
            <label className="gen-floor-height">
              <span className="gen-floor-height-tag">
                <span className="planner-legend-dot" style={{ background: ATTIC_COLOR }} />
                {t('gen.fieldAttic')}
              </span>
              <input
                type="number"
                min={MIN_FLOOR_H}
                max={MAX_STOREY_H}
                value={overheads.attic}
                disabled={busy}
                onChange={(e) => onBandHeight('attic', Math.trunc(Number(e.target.value)) || overheads.attic)}
              />
            </label>
          )}
          <div className="gen-floor-heights-total">
            <span>{t('gen.totalHeightLabel')}</span>
            <span className="gen-floor-heights-total-val">{sz.h}</span>
          </div>
        </div>
      )}
    </div>
  );
}
