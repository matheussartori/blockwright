// Keyboard navigation help — a discreet "?" button pinned to the viewport that
// opens a popover with the full Orbit + Fly cheatsheet, plus a compact Fly
// overlay that auto-appears whenever the camera enters fly mode. Replaces the
// old always-on Controls window; its open state rides the `controls` window
// slice so the View-menu "Keyboard Shortcuts" toggle keeps working.
import { windowsStore } from '../state/windows';
import { useApp, useWindows } from '../hooks/useStores';

interface Row {
  keys: string[];
  label: string;
}

const ORBIT: Row[] = [
  { keys: ['Drag'], label: 'rotate' },
  { keys: ['R-drag'], label: 'pan' },
  { keys: ['Scroll'], label: 'zoom' },
  { keys: ['F'], label: 'enter fly' },
];

const FLY: Row[] = [
  { keys: ['W', 'A', 'S', 'D'], label: 'move' },
  { keys: ['Space', 'Shift'], label: 'up / down' },
  { keys: ['Mouse'], label: 'look' },
  { keys: ['Scroll'], label: 'speed' },
  { keys: ['Esc', 'F'], label: 'exit' },
];

function Group({ name, rows, active }: { name: string; rows: Row[]; active?: boolean }) {
  return (
    <div className={`ch-group${active ? ' ch-group--active' : ''}`}>
      <div className="ch-group-name">{name}</div>
      <ul>
        {rows.map((row, i) => (
          <li key={i}>
            {row.keys.map((k) => (
              <kbd key={k}>{k}</kbd>
            ))}
            <span>{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ShortcutsHelp({ available }: { available: boolean }) {
  const flying = useApp((s) => s.navMode === 'fly');
  const open = useWindows((s) => s.controls.visible);

  if (!available) return null;

  return (
    <>
      {flying && (
        <div className="fly-overlay">
          <Group name="Fly · noclip" rows={FLY} />
        </div>
      )}

      <div className="shortcuts-help">
        {open && (
          <div className="shortcuts-popover" role="dialog" aria-label="Keyboard shortcuts">
            <div className="ch-groups">
              <Group name="Orbit" rows={ORBIT} />
              <Group name="Fly · noclip" rows={FLY} active={flying} />
            </div>
          </div>
        )}
        <button
          type="button"
          className={`shortcuts-btn${open ? ' active' : ''}`}
          title="Keyboard shortcuts"
          aria-label="Keyboard shortcuts"
          aria-expanded={open}
          onClick={() => windowsStore.getState().setVisible('controls', !open)}
        >
          ?
        </button>
      </div>
    </>
  );
}
