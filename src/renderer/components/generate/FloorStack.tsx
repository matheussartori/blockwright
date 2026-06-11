// The per-floor interior room editor — a vertical stack, one row per storey, that scales
// where the old fixed 2×N dropdown grid didn't. Each floor shows its assigned rooms as
// removable chips and an "add room" picker that's capped by the STRUCTURE's declared
// `maxRoomsPerFloor` (a roomy house allows more than a tight cabin). Duplicates are
// allowed (two bedrooms is a valid floor), and a floor with richer per-room options later
// just grows the chip's own affordances — the layout doesn't change. A pure view: the
// parent owns the rooms model + the add/remove reducers (generation/details.ts).
import type { ChipOption } from './chips';
import { Select } from '../ui/Select';
import type { MessageKey } from '@/shared/i18n';

type T = (key: MessageKey) => string;

interface Props {
  /** Number of storeys to show (the structure's resolved `floors`). */
  nFloors: number;
  /** The rooms model: `rooms[floor]` = that floor's assigned room ids, in order. */
  rooms: string[][];
  /** The room module options that fit the chosen structure. */
  options: ChipOption[];
  /** Max rooms a single floor accepts (the structure's `maxRoomsPerFloor`). */
  max: number;
  busy: boolean;
  t: T;
  onAdd: (floor: number, id: string) => void;
  onRemove: (floor: number, index: number) => void;
}

export function FloorStack({ nFloors, rooms, options, max, busy, t, onAdd, onRemove }: Props) {
  const labelOf = (id: string) => options.find((o) => o.id === id)?.label ?? id;

  return (
    <div className="gen-floors-stack">
      <div className="gen-rooms-head">
        <span>{t('gen.roomsTitle')}</span>
        <span className="gen-rooms-hint">{t('gen.roomsHint')}</span>
      </div>
      {Array.from({ length: nFloors }, (_, i) => {
        const assigned = (rooms[i] ?? []).filter(Boolean);
        const full = assigned.length >= max;
        return (
          <div key={i} className="gen-floor-card">
            <span className="gen-floor-tag">
              {t('gen.roomFloor')} {i + 1}
            </span>
            <div className="gen-floor-rooms">
              {assigned.map((id, idx) => (
                <span key={`${id}-${idx}`} className="gen-room-chip">
                  {labelOf(id)}
                  <button
                    type="button"
                    className="gen-room-chip-x"
                    aria-label={t('gen.removeRoom')}
                    title={t('gen.removeRoom')}
                    disabled={busy}
                    onClick={() => onRemove(i, idx)}
                  >
                    ✕
                  </button>
                </span>
              ))}
              {!full && (
                <Select
                  className="bw-select-action"
                  value=""
                  placeholder={t('gen.addRoom')}
                  ariaLabel={t('gen.addRoom')}
                  disabled={busy}
                  options={options.map((o) => ({ value: o.id, label: o.label, description: o.description }))}
                  onChange={(id) => id && onAdd(i, id)}
                />
              )}
              {full && <span className="gen-floor-full">{t('gen.roomsFull')}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
