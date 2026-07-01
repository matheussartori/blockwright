// The world HUD's go-to-coordinate form: three axis inputs + a Go button that flies the camera to an
// explicit X/Y/Z. Owns only its transient input state; the parent supplies the initial point + jump.
import { useState } from 'react';
import { useT } from '../../hooks/useStores';

interface Props {
  /** Seed coordinate the inputs open on (typically the world spawn). */
  initial: [number, number, number];
  /** Fly the camera to the entered coordinate. */
  onJump: (pos: [number, number, number]) => void;
}

export function WorldGotoForm({ initial, onJump }: Props) {
  const t = useT();
  const [target, setTarget] = useState<[number, number, number]>(initial);

  return (
    <form
      className="world-hud-goto"
      onSubmit={(e) => {
        e.preventDefault();
        onJump(target);
      }}
    >
      {(['X', 'Y', 'Z'] as const).map((axis, i) => (
        <label key={axis}>
          {axis}
          <input
            type="number"
            value={target[i]}
            onChange={(e) => {
              const next = [...target] as [number, number, number];
              next[i] = Number(e.target.value);
              setTarget(next);
            }}
          />
        </label>
      ))}
      <button type="submit" className="world-hud-btn primary">
        {t('world.go')}
      </button>
    </form>
  );
}
