// The shared chrome of DetailsSection's boxed size panels (Size / Basement / Yard size):
// the section wrapper with its labelled head, the tag + Stepper row every card stacks,
// and the link/chain toggle that moves a stack of height steppers together. Pure
// presentational pieces — they keep the three sub-panels' markup identical without
// each one repeating it.
import type { ReactNode } from 'react';
import { Link2, Unlink } from 'lucide-react';
import { Stepper } from '../ui/Stepper';
import type { TFunction } from '@/shared/i18n';

/** The boxed section shell (`gen-chip-group gen-size-section`) with its labelled head row. */
export function SizePanel({
  label,
  className,
  children,
}: {
  label: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`gen-chip-group gen-size-section${className ? ` ${className}` : ''}`}>
      <div className="gen-size-head">
        <span className="gen-chip-label">{label}</span>
      </div>
      {children}
    </div>
  );
}

/** One labelled stepper row inside a size card: the row tag + a small {@link Stepper}. */
export function SizeRow({
  tag,
  ariaLabel,
  value,
  min,
  max,
  step,
  busy,
  onChange,
}: {
  tag: ReactNode;
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  busy: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <div className="gen-size-row">
      <span className="gen-size-row-tag">{tag}</span>
      <Stepper
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={busy}
        ariaLabel={ariaLabel}
        size="sm"
        onChange={onChange}
      />
    </div>
  );
}

/** The link/chain toggle: while ON, editing one height stepper moves the whole stack. */
export function LinkToggle({
  linked,
  setLinked,
  busy,
  t,
}: {
  linked: boolean;
  setLinked: (v: boolean) => void;
  busy: boolean;
  t: TFunction;
}) {
  return (
    <button
      type="button"
      className={`gen-link-toggle${linked ? ' on' : ''}`}
      aria-pressed={linked}
      disabled={busy}
      title={linked ? t('gen.linkHeights') : t('gen.unlinkHeights')}
      aria-label={linked ? t('gen.linkHeights') : t('gen.unlinkHeights')}
      onClick={() => setLinked(!linked)}
    >
      {linked ? <Link2 size={14} strokeWidth={1.9} aria-hidden /> : <Unlink size={14} strokeWidth={1.9} aria-hidden />}
    </button>
  );
}
