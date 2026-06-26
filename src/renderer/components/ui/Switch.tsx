// A small on/off switch (pill track + sliding knob), themed off the app tokens. Used
// for boolean toggles where a segmented control reads as too heavy — e.g. the export
// dialog's "generate worldgen files". Controlled: pass `checked` + `onChange`.
interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
  /** Lock the switch (shown dimmed, clicks ignored) — e.g. worldgen forced on for a split. */
  disabled?: boolean;
}

export function Switch({ checked, onChange, ariaLabel, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`ui-switch no-drag${checked ? ' on' : ''}${disabled ? ' disabled' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="ui-switch-knob" />
    </button>
  );
}
