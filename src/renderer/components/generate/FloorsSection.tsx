// The ▦ Floors section of the Generate composer: define named vertical levels (an
// inclusive y range + a role per level) for an EXISTING build. The plan rides along
// as context on every prompt and is highlighted as bands in the viewer. A pure view —
// the parent owns the per-doc floor state + persistence.
import type { MessageKey } from '@/shared/i18n';
import type { FloorDef } from '@/shared/types';

type T = (key: MessageKey) => string;

interface Props {
  floors: FloorDef[];
  busy: boolean;
  t: T;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<FloorDef>) => void;
  onRemove: (id: string) => void;
}

export function FloorsSection({ floors, busy, t, onAdd, onUpdate, onRemove }: Props) {
  return (
    <div className="gen-floors">
      <div className="gen-floors-head">
        <span>{t('gen.floorPlan')}</span>
        <span className="gen-floors-hint">{t('gen.floorPlanHint')}</span>
      </div>
      {floors.length === 0 && <p className="gen-floors-empty">{t('gen.floorsEmpty')}</p>}
      {floors.map((f, i) => (
        <div key={f.id} className="gen-floor-row">
          <span className="gen-floor-name">{`Floor ${i + 1}`}</span>
          <label className="gen-floor-y">
            <span>{t('gen.floorFrom')}</span>
            <input
              type="number"
              value={f.from}
              disabled={busy}
              onChange={(e) => onUpdate(f.id, { from: Math.trunc(Number(e.target.value)) || 0 })}
            />
          </label>
          <label className="gen-floor-y">
            <span>{t('gen.floorTo')}</span>
            <input
              type="number"
              value={f.to}
              disabled={busy}
              onChange={(e) => onUpdate(f.id, { to: Math.trunc(Number(e.target.value)) || 0 })}
            />
          </label>
          <label className="gen-floor-y gen-floor-role">
            <span>{t('gen.floorRole')}</span>
            <select
              value={f.role ?? 'ground'}
              disabled={busy}
              onChange={(e) => onUpdate(f.id, { role: e.target.value as FloorDef['role'] })}
            >
              <option value="basement">{t('gen.floorRole.basement')}</option>
              <option value="ground">{t('gen.floorRole.ground')}</option>
              <option value="upper">{t('gen.floorRole.upper')}</option>
              <option value="roof">{t('gen.floorRole.roof')}</option>
            </select>
          </label>
          <button
            className="gen-floor-remove"
            title={t('gen.removeFloor')}
            aria-label={t('gen.removeFloor')}
            disabled={busy}
            onClick={() => onRemove(f.id)}
          >
            ✕
          </button>
        </div>
      ))}
      <button className="btn sm gen-floor-add" onClick={onAdd} disabled={busy}>
        {t('gen.addFloor')}
      </button>
    </div>
  );
}
