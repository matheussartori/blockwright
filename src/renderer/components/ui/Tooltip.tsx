// A reusable hover/focus tooltip — the app's richer replacement for a native `title=`
// (which can't carry a two-tier label + description, styles inconsistently per-OS, and
// is clipped to the window). It wraps a single trigger element (no extra DOM box, so it
// never disturbs a grid/flex layout), renders the bubble through a portal in
// `position: fixed` so the WebGL canvas can't clip it, flips to the opposite side when
// there's no room, and shows after a short delay on hover but instantly on keyboard
// focus. The trigger keeps its `aria-label` for screen readers; the description is a
// sighted-only affordance.
import { cloneElement, isValidElement, useCallback, useEffect, useId, useRef, useState, type ReactElement, type Ref } from 'react';
import { createPortal } from 'react-dom';

type Placement = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  /** The bold first line — what the control is called. */
  label: string;
  /** A one-line plain-language note on what it does (muted, optional). */
  description?: string;
  /** Preferred side; flips to the opposite when the viewport has no room there. Default 'top'. */
  placement?: Placement;
  /** Hover dwell before showing, in ms (keyboard focus is always instant). Default 350. */
  delay?: number;
  /** Exactly one focusable trigger element (a button); the tooltip attaches to it. */
  children: ReactElement;
}

// Conservative bubble extents used only to decide a flip before the node is measured.
const EST_W = 240;
const EST_H = 72;

/** Merge our measuring ref with whatever ref the child already carries. */
function setRef<T>(ref: Ref<T> | undefined, value: T) {
  if (typeof ref === 'function') ref(value);
  else if (ref && typeof ref === 'object') (ref as React.MutableRefObject<T | null>).current = value;
}

export function Tooltip({ label, description, placement = 'top', delay = 350, children }: TooltipProps) {
  const [coords, setCoords] = useState<{ left: number; top: number; side: Placement } | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const id = useId();

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 12;
    // Flip to the opposite side if the preferred one would overflow the viewport.
    let side = placement;
    if (side === 'top' && r.top < EST_H + margin) side = 'bottom';
    else if (side === 'bottom' && window.innerHeight - r.bottom < EST_H + margin) side = 'top';
    else if (side === 'right' && window.innerWidth - r.right < EST_W + margin) side = 'left';
    else if (side === 'left' && r.left < EST_W + margin) side = 'right';

    // The anchor sits exactly on the button's edge; the per-side CSS transform pulls the
    // bubble off it by the gap and seats the caret, so the spacing is defined in one place.
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (side === 'top') setCoords({ left: cx, top: r.top, side });
    else if (side === 'bottom') setCoords({ left: cx, top: r.bottom, side });
    else if (side === 'right') setCoords({ left: r.right, top: cy, side });
    else setCoords({ left: r.left, top: cy, side });
  }, [placement]);

  const show = useCallback(
    (immediate: boolean) => {
      window.clearTimeout(timer.current);
      if (immediate) {
        place();
        return;
      }
      timer.current = window.setTimeout(place, delay);
    },
    [place, delay],
  );

  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setCoords(null);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Dismiss if anything scrolls/resizes under the fixed bubble (it would detach), or on Escape.
  useEffect(() => {
    if (!coords) return;
    const onScroll = () => hide();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && hide();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', hide);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', hide);
      window.removeEventListener('keydown', onKey);
    };
  }, [coords, hide]);

  if (!isValidElement(children)) return children;
  const child = children as ReactElement<Record<string, unknown>>;
  const childProps = child.props;

  const trigger = cloneElement(child, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      setRef((child as unknown as { ref?: Ref<HTMLElement> }).ref, node);
    },
    'aria-label': childProps['aria-label'] ?? label,
    onMouseEnter: (e: React.MouseEvent) => {
      (childProps.onMouseEnter as ((e: React.MouseEvent) => void) | undefined)?.(e);
      show(false);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      (childProps.onMouseLeave as ((e: React.MouseEvent) => void) | undefined)?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent) => {
      (childProps.onFocus as ((e: React.FocusEvent) => void) | undefined)?.(e);
      show(true);
    },
    onBlur: (e: React.FocusEvent) => {
      (childProps.onBlur as ((e: React.FocusEvent) => void) | undefined)?.(e);
      hide();
    },
    // A click that activates the control (e.g. picking a tool) dismisses the bubble so it
    // doesn't linger over the now-selected button.
    onClick: (e: React.MouseEvent) => {
      (childProps.onClick as ((e: React.MouseEvent) => void) | undefined)?.(e);
      hide();
    },
    'aria-describedby': coords ? id : childProps['aria-describedby'],
  });

  return (
    <>
      {trigger}
      {coords &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            className={`bw-tooltip side-${coords.side}`}
            style={{ left: coords.left, top: coords.top }}
          >
            <span className="bw-tooltip-label">{label}</span>
            {description && <span className="bw-tooltip-desc">{description}</span>}
            <span className="bw-tooltip-caret" aria-hidden />
          </div>,
          document.body,
        )}
    </>
  );
}
