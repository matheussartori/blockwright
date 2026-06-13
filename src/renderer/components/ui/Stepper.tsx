// A polished numeric stepper — the composer's replacement for the native
// `<input type="number">` whose spinner arrows are tiny and fiddly to click. It pairs a
// large −/+ button on each side of a centered, click-to-type value (tabular numerals), so
// nudging a dimension is a comfortable target and typing an exact value still works. The
// buttons auto-repeat on press-and-hold, the value field takes the wheel + arrow keys, and
// everything is themed off the app's existing tokens (cobalt accent, rounded). Bounds are
// reflected by disabling the button at the limit; the parent still clamps on its side.
import { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  ariaLabel?: string;
  /** A short unit shown after the value (e.g. "blocks"); omit for a bare number. */
  unit?: string;
  /** Visual density — `sm` for the tight per-floor rows, `md` (default) elsewhere. */
  size?: 'sm' | 'md';
}

/** Press-and-hold auto-repeat timing (ms): the initial delay, then the repeat interval. */
const HOLD_DELAY = 380;
const HOLD_INTERVAL = 70;

export function Stepper({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  disabled = false,
  ariaLabel,
  unit,
  size = 'md',
}: StepperProps) {
  // A local draft so the field can be cleared/edited freely; it re-syncs whenever the
  // committed value changes from outside (a button press, a linked-stack move, a reset).
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const commit = (n: number) => {
    const c = clamp(Math.trunc(n));
    if (c !== value) onChange(c);
    setDraft(String(c));
  };
  const nudge = (dir: 1 | -1) => commit(clamp(value + dir * step));

  // Hold-to-repeat: a button held down keeps nudging until released.
  const holdRef = useRef<{ delay?: number; interval?: number }>({});
  const valueRef = useRef(value);
  valueRef.current = value;
  const startHold = (dir: 1 | -1) => {
    nudge(dir);
    holdRef.current.delay = window.setTimeout(() => {
      holdRef.current.interval = window.setInterval(() => {
        const next = clamp(valueRef.current + dir * step);
        if (next === valueRef.current) return stopHold();
        onChange(next);
      }, HOLD_INTERVAL);
    }, HOLD_DELAY);
  };
  const stopHold = () => {
    if (holdRef.current.delay) window.clearTimeout(holdRef.current.delay);
    if (holdRef.current.interval) window.clearInterval(holdRef.current.interval);
    holdRef.current = {};
  };
  useEffect(() => stopHold, []);

  const atMin = value <= min;
  const atMax = value >= max;

  return (
    <div className={`stepper${size === 'sm' ? ' sm' : ''}${disabled ? ' disabled' : ''}`}>
      <button
        type="button"
        className="stepper-btn"
        aria-label={ariaLabel ? `Decrease ${ariaLabel}` : 'Decrease'}
        disabled={disabled || atMin}
        onPointerDown={(e) => {
          e.preventDefault();
          if (!disabled) startHold(-1);
        }}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
      >
        <Minus size={size === 'sm' ? 13 : 15} strokeWidth={2.4} aria-hidden />
      </button>
      <input
        className="stepper-value"
        type="text"
        inputMode="numeric"
        value={draft}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== '' && Number.isFinite(n)) commit(n);
        }}
        onBlur={() => {
          const n = Number(draft);
          commit(Number.isFinite(n) && draft.trim() !== '' ? n : value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            nudge(1);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            nudge(-1);
          }
          e.stopPropagation(); // don't let the composer's global keys hijack typing
        }}
        onWheel={(e) => {
          if (document.activeElement !== e.currentTarget) return; // only when focused
          e.preventDefault();
          nudge(e.deltaY < 0 ? 1 : -1);
        }}
      />
      {unit && <span className="stepper-unit">{unit}</span>}
      <button
        type="button"
        className="stepper-btn"
        aria-label={ariaLabel ? `Increase ${ariaLabel}` : 'Increase'}
        disabled={disabled || atMax}
        onPointerDown={(e) => {
          e.preventDefault();
          if (!disabled) startHold(1);
        }}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
      >
        <Plus size={size === 'sm' ? 13 : 15} strokeWidth={2.4} aria-hidden />
      </button>
    </div>
  );
}
