// The chip primitives the Build Planner's form is built from — a pill button, a labelled
// single-select chip group (with an optional neutral leading option), and a bare labelled
// row. Shared by the config column (DetailsSection) and the per-floor room editor
// (FloorStack) so the look + behaviour stay in one place as the form grows.
import type { ReactNode } from 'react';

/** One selectable option. `id === ''` is the neutral choice (None/Auto/Default). */
export interface ChipOption {
  id: string;
  label: string;
}

export function Chip({
  on,
  busy,
  onPick,
  children,
  disabled,
  title,
}: {
  on: boolean;
  busy: boolean;
  onPick: () => void;
  children: ReactNode;
  /** Greys + blocks the chip independently of `busy` (e.g. an incompatible option). */
  disabled?: boolean;
  /** Tooltip shown on hover (e.g. the reason an option is disabled). */
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`gen-chip${on ? ' on' : ''}${disabled ? ' disabled' : ''}`}
      disabled={busy || disabled}
      title={title}
      onClick={onPick}
    >
      {children}
    </button>
  );
}

/** A labelled row of arbitrary chip content (no neutral option, no single-select rule). */
export function ChipRow({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="gen-chip-group">
      {label && <span className="gen-chip-label">{label}</span>}
      <div className="gen-chips">{children}</div>
    </div>
  );
}

/** A single-select chip group with an optional neutral leading option (None/Auto/Default).
 *  Hidden entirely when there's nothing to choose (only the neutral option would show). */
export function ChipSelect({
  label,
  value,
  options,
  neutral,
  busy,
  onPick,
  disabledFor,
}: {
  label: string;
  value: string;
  options: ChipOption[];
  neutral?: ChipOption;
  busy: boolean;
  onPick: (id: string) => void;
  /** Per-option gate: return a reason string to GREY + block that option (shown as its
   *  tooltip, e.g. "Needs a pitched roof"), or undefined to leave it selectable. */
  disabledFor?: (id: string) => string | undefined;
}) {
  if (options.length === 0) return null;
  const all = neutral ? [neutral, ...options] : options;
  return (
    <div className="gen-chip-group">
      <span className="gen-chip-label">{label}</span>
      <div className="gen-chips">
        {all.map((o) => {
          const reason = o.id ? disabledFor?.(o.id) : undefined;
          return (
            <Chip
              key={o.id || '_neutral'}
              on={value === o.id}
              busy={busy}
              disabled={!!reason}
              title={reason}
              onPick={() => onPick(o.id)}
            >
              {o.label}
            </Chip>
          );
        })}
      </div>
    </div>
  );
}
