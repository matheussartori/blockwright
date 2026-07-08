// Shared row primitives for the Settings tabs — the single source of the
// label / control / note rhythm, so every tab lays out identically and every
// boolean pref uses the same Switch (instead of a mix of native checkboxes).
import type { ReactNode } from 'react';
import { Switch } from '../ui/Switch';

/** One labeled settings row: label on the left, control(s) right-aligned. */
export function SettingRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="setting-row">
      <span className="setting-label">{label}</span>
      {children}
    </div>
  );
}

/** A boolean row: label + the shared Switch, with the whole row as click target
 *  (the wrapper span stops the Switch's own click from re-toggling through the row). */
export function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="setting-row setting-toggle no-drag" onClick={() => onChange(!checked)}>
      <span className="setting-label">{label}</span>
      <span onClick={(e) => e.stopPropagation()}>
        <Switch checked={checked} onChange={onChange} ariaLabel={label} />
      </span>
    </div>
  );
}
