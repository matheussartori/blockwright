// The orbit/fly navigation cheatsheet (top-left by default). Highlights the Fly
// group while flying, driven by the live nav mode in the store.
import { FloatingWindow } from '../components/FloatingWindow';
import { useApp } from '../hooks/useStores';

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

export function ControlsWindow({ available }: { available: boolean }) {
  const navMode = useApp((s) => s.navMode);
  const flying = navMode === 'fly';

  return (
    <FloatingWindow
      id="controls"
      title="Controls"
      available={available}
      headerExtra={<span className={`ch-mode${flying ? ' active' : ''}`}>{flying ? 'Fly' : 'Orbit'}</span>}
    >
      <div className="ch-groups">
        <Group name="Orbit" rows={ORBIT} />
        <Group name="Fly · noclip" rows={FLY} active={flying} />
      </div>
    </FloatingWindow>
  );
}
