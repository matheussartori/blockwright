// The ⚙ Details section of the Generate composer: the Structure / Decoration / Roof /
// Basement selects, the chosen structure's tunable params, the build-size fields, and
// the per-floor room editor. Optional guidance — a build can come from a free-form
// prompt alone — so everything here is collapsed by default. A pure view: the parent
// owns the `BuildDetails` state and passes the reducers in (see generation/details.ts).
import { store } from '../../state/store';
import { moduleAppliesTo } from '@/shared/domain/applies-to';
import { type BuildDetails, ROOMS_PER_FLOOR, effectiveSize, floorCount, floorRooms } from '../../generation/brief';
import type { DetailField, SizeBox } from '../../generation/details';
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
  onRoom: (floor: number, slot: number, value: string) => void;
}

export function DetailsSection({ details, catalog, busy, t, onField, onParam, onSize, onRoom }: Props) {
  // A structure module is OPTIONAL — a build can come from a free-form prompt alone.
  // The selected structure (if any) drives the param controls + size + room editor.
  const selStruct = catalog?.structure.find((m) => m.id === details.structureType);
  // Roof/basement/room options are filtered by the chosen structure's `appliesTo` — the
  // SAME pure predicate main uses to gate knowledge guides, so the two can't drift.
  const fits = (m: GenerationModule): boolean => moduleAppliesTo(m.appliesTo, details.structureType || undefined);
  // Per-floor room editor: shown for a storeyed structure (one with a `floors` param —
  // the house). Each floor takes up to two interior room modules that fit the structure.
  const nFloors = floorCount(selStruct, details.params);
  const roomOptions = (catalog?.room ?? []).filter(fits);

  return (
    <div className="gen-details">
      <p className="gen-details-hint">
        {t('gen.detailsHintPre')}
        <button className="link" onClick={() => store.getState().setModulesOpen(true)} disabled={busy}>
          {t('gen.detailsHintLink')}
        </button>
        {t('gen.detailsHintPost')}
      </p>
      <div className="gen-details-grid">
        <label className="gen-field">
          <span>{t('gen.fieldStructure')}</span>
          <select value={details.structureType} onChange={(e) => onField('structureType', e.target.value)} disabled={busy}>
            <option value="">{t('gen.optNone')}</option>
            {(catalog?.structure ?? []).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        <label className="gen-field">
          <span>{t('gen.fieldDecoration')}</span>
          <select value={details.decoration} onChange={(e) => onField('decoration', e.target.value)} disabled={busy || !details.structureType}>
            <option value="">{t('gen.optDefault')}</option>
            {(catalog?.decoration ?? []).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        <label className="gen-field">
          <span>{t('gen.fieldRoof')}</span>
          <select value={details.roof} onChange={(e) => onField('roof', e.target.value)} disabled={busy || !details.structureType}>
            <option value="">{t('gen.optAuto')}</option>
            {(catalog?.roof ?? []).filter(fits).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        <label className="gen-field">
          <span>{t('gen.fieldBasement')}</span>
          <select value={details.basement} onChange={(e) => onField('basement', e.target.value)} disabled={busy || !details.structureType}>
            <option value="">{t('gen.optNone')}</option>
            {(catalog?.basement ?? []).filter(fits).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
      </div>
      {selStruct?.params && selStruct.params.length > 0 && (
        <div className="gen-details-grid">
          {selStruct.params.map((p) => (
            <label key={p.name} className="gen-field">
              <span>{p.label}</span>
              {p.kind === 'int' ? (
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
              ) : (
                <select
                  value={String(details.params[p.name] ?? p.default)}
                  disabled={busy}
                  onChange={(e) => onParam(p.name, e.target.value)}
                >
                  {p.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              )}
            </label>
          ))}
        </div>
      )}
      {selStruct && (
        <div className="gen-details-grid">
          {(['w', 'd', 'h'] as const).map((axis) => {
            const sz = effectiveSize(details, selStruct);
            const label = axis === 'w' ? t('gen.width') : axis === 'd' ? t('gen.depth') : t('gen.height');
            return (
              <label key={axis} className="gen-field">
                <span>{label}{details.size ? '' : t('gen.autoSuffix')}</span>
                <input
                  type="number"
                  min={3}
                  max={64}
                  value={sz[axis]}
                  disabled={busy}
                  onChange={(e) => onSize(axis, Math.trunc(Number(e.target.value)) || sz[axis], sz)}
                />
              </label>
            );
          })}
        </div>
      )}
      {nFloors > 0 && roomOptions.length > 0 && (
        <div className="gen-rooms">
          <div className="gen-rooms-head">
            <span>{t('gen.roomsTitle')}</span>
            <span className="gen-rooms-hint">{t('gen.roomsHint')}</span>
          </div>
          {Array.from({ length: nFloors }, (_, i) => (
            <div key={i} className="gen-room-row">
              <span className="gen-room-floor-label">
                {t('gen.roomFloor')} {i + 1}
              </span>
              <div className="gen-room-selects">
                {Array.from({ length: ROOMS_PER_FLOOR }, (_, slot) => (
                  <select
                    key={slot}
                    className="gen-room-select"
                    value={floorRooms(details, i)[slot]}
                    disabled={busy}
                    onChange={(e) => onRoom(i, slot, e.target.value)}
                  >
                    <option value="">{t('gen.optNoRoom')}</option>
                    {roomOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
