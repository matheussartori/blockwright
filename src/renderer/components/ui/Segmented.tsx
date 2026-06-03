// A small segmented control (iOS/macOS style): a row of mutually-exclusive
// options in a single pill. Used for the theme switch and the catalog's
// list/grid view toggle so both share one look and behaviour.
import type { ReactNode } from 'react';

interface Option<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  /** `icon` tightens padding for icon-only options. */
  variant?: 'text' | 'icon';
}

export function Segmented<T extends string>({ value, options, onChange, ariaLabel, variant = 'text' }: SegmentedProps<T>) {
  return (
    <div className={`segmented${variant === 'icon' ? ' segmented-icon' : ''}`} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          className={`segmented-option${value === o.value ? ' active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
