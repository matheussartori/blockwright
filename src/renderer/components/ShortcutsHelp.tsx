// Keyboard navigation help — a discreet "?" button pinned to the viewport that
// opens a popover with the full Orbit + Fly cheatsheet, plus a compact Fly
// overlay that auto-appears whenever the camera enters fly mode. Replaces the
// old always-on Controls window; its open state rides the `controls` window
// slice so the View-menu "Keyboard Shortcuts" toggle keeps working.
import type { MessageKey } from '@/shared/i18n';
import { windowsStore } from '../state/windows';
import { useApp, useT, useWindows } from '../hooks/useStores';

interface Row {
  keys: string[];
  label: MessageKey;
}

const ORBIT: Row[] = [
  { keys: ['Drag'], label: 'shortcuts.rotate' },
  { keys: ['R-drag'], label: 'shortcuts.pan' },
  { keys: ['Scroll'], label: 'shortcuts.zoom' },
  { keys: ['F'], label: 'shortcuts.enterFly' },
];

const FLY: Row[] = [
  { keys: ['W', 'A', 'S', 'D'], label: 'shortcuts.move' },
  { keys: ['Space', 'Shift'], label: 'shortcuts.upDown' },
  { keys: ['Mouse'], label: 'shortcuts.look' },
  { keys: ['Scroll'], label: 'shortcuts.speed' },
  { keys: ['Esc', 'F'], label: 'shortcuts.exit' },
];

function Group({ name, rows, active }: { name: string; rows: Row[]; active?: boolean }) {
  const t = useT();
  return (
    <div className={`ch-group${active ? ' ch-group--active' : ''}`}>
      <div className="ch-group-name">{name}</div>
      <ul>
        {rows.map((row, i) => (
          <li key={i}>
            {row.keys.map((k) => (
              <kbd key={k}>{k}</kbd>
            ))}
            <span>{t(row.label)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ShortcutsHelp({ available }: { available: boolean }) {
  const t = useT();
  const flying = useApp((s) => s.navMode === 'fly');
  const open = useWindows((s) => s.controls.visible);

  if (!available) return null;

  return (
    <>
      {flying && (
        <div className="fly-overlay">
          <Group name={t('shortcuts.fly')} rows={FLY} />
        </div>
      )}

      <div className="shortcuts-help">
        {open && (
          <div className="shortcuts-popover" role="dialog" aria-label={t('shortcuts.title')}>
            <div className="ch-groups">
              <Group name={t('shortcuts.orbit')} rows={ORBIT} />
              <Group name={t('shortcuts.fly')} rows={FLY} active={flying} />
            </div>
          </div>
        )}
        <button
          type="button"
          className={`shortcuts-btn${open ? ' active' : ''}`}
          title={t('shortcuts.title')}
          aria-label={t('shortcuts.title')}
          aria-expanded={open}
          onClick={() => windowsStore.getState().setVisible('controls', !open)}
        >
          ?
        </button>
      </div>
    </>
  );
}
