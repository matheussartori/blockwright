// A small on/off switch (pill track + sliding knob), themed off the app tokens. Used
// for boolean toggles where a segmented control reads as too heavy — e.g. the export
// dialog's "generate worldgen files". Controlled: pass `checked` + `onChange`.
interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
}

export function Switch({ checked, onChange, ariaLabel }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      className={`ui-switch no-drag${checked ? ' on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="ui-switch-knob" />
    </button>
  );
}
