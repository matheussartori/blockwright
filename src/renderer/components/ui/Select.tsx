// A custom single-select dropdown that matches the app's chrome — the reusable
// replacement for the single-select chip groups in the Build Planner (and anywhere
// else a native <select> would clash with the theme). The menu renders through a
// portal in `position: fixed` so it's never clipped by a scrolling config column,
// flips above the trigger when there's no room below, and supports full keyboard
// navigation (Arrow/Home/End/Enter/Escape) + click-outside / scroll-to-dismiss.
// Disabled options are greyed with their reason in a tooltip (the conflict gating the
// chip group used to show as a strike-through). Options can carry a `group` (family)
// label: each contiguous run of same-group options gets a header/divider in the menu —
// and that holds while a search query FILTERS the list too (the filter preserves order,
// so groups stay contiguous), so a match like "classic" still shows under "House" and
// "Tower" headers rather than losing its family context.
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';

/** One choice. `disabled` greys + blocks it (with `title` as the reason tooltip). */
export interface SelectOption {
  value: string;
  label: string;
  /** A short explanation shown under the label (smaller, muted) when the menu is open. It's
   *  clamped to one line — the full text shows in the option's hover tooltip. */
  description?: string;
  /** The display label of the group (family) this option belongs to (e.g. "House").
   *  Each contiguous run of same-group options gets a header/divider in the menu —
   *  preserved while a search query filters the list, so a match keeps its family header. */
  group?: string;
  disabled?: boolean;
  title?: string;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
  /** Shown on the trigger when no option matches `value` — for an "action" select
   *  (e.g. "+ Add room") that stays on its placeholder after each pick. */
  placeholder?: string;
  /** Extra class on the trigger button (e.g. `bw-select-action` for the dashed look). */
  className?: string;
  /** Adds a search box at the top of the open menu, filtering options by label,
   *  group and description. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Shown in the menu when a search query matches nothing. */
  noResultsLabel?: string;
}

/** The next selectable index in `dir` from `from`, skipping disabled options. Clamps
 *  at the ends (no wrap), so holding ↓ settles on the last enabled option. */
function nextEnabled(options: SelectOption[], from: number, dir: 1 | -1): number {
  for (let i = from + dir; i >= 0 && i < options.length; i += dir) {
    if (!options[i].disabled) return i;
  }
  // Nothing in that direction — keep the current (or find the first enabled if `from` was out of range).
  for (let i = from; i >= 0 && i < options.length; i -= dir) {
    if (!options[i].disabled) return i;
  }
  return Math.max(0, Math.min(options.length - 1, from));
}

export function Select({
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
  placeholder,
  className,
  searchable,
  searchPlaceholder,
  noResultsLabel,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; flip: boolean; max: number } | null>(null);
  // The custom tooltip for the active option's FULL description — shown only when the
  // in-row text is actually clipped. `right`/`left` set the side it floats on.
  const [tip, setTip] = useState<{ text: string; top: number; left?: number; right?: number } | null>(null);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const triggerLabel = options[selectedIndex]?.label ?? placeholder ?? options[0]?.label ?? '';
  const isPlaceholder = selectedIndex < 0 && !!placeholder;

  // The options the open menu shows: all of them, or — with a search query — the ones
  // whose label/group/description match. `active` indexes into THIS list.
  const q = searchable ? query.trim().toLowerCase() : '';
  const visible = !q
    ? options
    : options.filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          o.group?.toLowerCase().includes(q) ||
          o.description?.toLowerCase().includes(q),
      );

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const below = window.innerHeight - r.bottom - gap - 8;
    const above = r.top - gap - 8;
    const flip = below < 180 && above > below;
    setPos({
      left: r.left,
      top: flip ? r.top - gap : r.bottom + gap,
      width: r.width,
      flip,
      max: Math.min(300, Math.max(120, flip ? above : below)),
    });
  }, []);

  const close = useCallback(() => setOpen(false), []);

  const openMenu = useCallback(() => {
    if (disabled) return;
    place();
    setQuery('');
    setActive(selectedIndex >= 0 ? selectedIndex : nextEnabled(options, -1, 1));
    setOpen(true);
  }, [disabled, place, selectedIndex, options]);

  // Dismiss on outside click, scroll (the fixed popup would detach) or resize; Escape
  // is handled on the trigger's keydown so focus returns cleanly.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !popupRef.current?.contains(t)) close();
    };
    // Dismiss when something BEHIND the popup scrolls (the fixed popup would detach). This is
    // a capture listener, so it also sees the popup's OWN overflow scroll (and the row
    // scrollIntoView as the highlight moves) — those must NOT close it.
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && popupRef.current?.contains(e.target)) return;
      close();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, close]);

  // Keep the active option in view as the highlight moves, and position the custom
  // description tooltip beside it — but only when the in-row description is truncated
  // (so a fully-visible one doesn't pop a redundant bubble).
  useLayoutEffect(() => {
    if (!open) {
      setTip(null);
      return;
    }
    const row = popupRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`);
    row?.scrollIntoView({ block: 'nearest' });
    const opt = visible[active];
    const descEl = row?.querySelector<HTMLElement>('.bw-select-option-desc');
    const clipped = !!descEl && descEl.scrollWidth > descEl.clientWidth + 1;
    if (!opt?.description || !descEl || !clipped) {
      setTip(null);
      return;
    }
    const r = row!.getBoundingClientRect();
    const gap = 8;
    const tipW = 280;
    const onLeft = window.innerWidth - r.right < tipW + gap; // no room right → flip left
    setTip({
      text: opt.description,
      top: r.top,
      ...(onLeft ? { right: window.innerWidth - r.left + gap } : { left: r.right + gap }),
    });
    // `visible` is derived from options+query, so those are the real deps.
  }, [active, open, options, q]);

  const pick = useCallback(
    (opt: SelectOption | undefined) => {
      if (!opt || opt.disabled) return;
      onChange(opt.value);
      close();
      triggerRef.current?.focus();
    },
    [onChange, close],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        close();
        triggerRef.current?.focus();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setActive((i) => nextEnabled(visible, i, 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((i) => nextEnabled(visible, i, -1));
        break;
      case 'Home':
        e.preventDefault();
        setActive(nextEnabled(visible, -1, 1));
        break;
      case 'End':
        e.preventDefault();
        setActive(nextEnabled(visible, visible.length, -1));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        pick(visible[active]);
        break;
      default:
        break;
    }
  };

  // The search box's keys: navigation + Enter/Escape come from the shared handler,
  // but typing (incl. Space) and the caret keys (Home/End) stay with the input.
  const onSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Home' || e.key === 'End') return;
    onKeyDown(e);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`bw-select-trigger${open ? ' open' : ''}${className ? ` ${className}` : ''}`}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className={`bw-select-value${isPlaceholder ? ' placeholder' : ''}`}>{triggerLabel}</span>
        <ChevronDown size={14} strokeWidth={2} className="bw-select-caret" aria-hidden />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popupRef}
            role="listbox"
            aria-label={ariaLabel}
            className={`bw-select-popup${pos.flip ? ' flip' : ''}`}
            style={{
              left: pos.left,
              width: pos.width,
              maxHeight: pos.max,
              ...(pos.flip ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
            }}
          >
            {searchable && (
              <div className="bw-select-search">
                <Search size={13} strokeWidth={2} aria-hidden />
                <input
                  type="text"
                  value={query}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  autoFocus
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onSearchKeyDown}
                />
              </div>
            )}
            {visible.length === 0 && <div className="bw-select-empty">{noResultsLabel}</div>}
            {visible.map((o, i) => {
              const selected = o.value === value;
              // A header opens each new GROUP run. The filtered list preserves the
              // original order, so groups stay contiguous and the headers hold during a
              // search too (so "classic" still shows under "House" then "Tower").
              const groupHead = o.group && o.group !== visible[i - 1]?.group ? o.group : null;
              return (
                <Fragment key={o.value || '_neutral'}>
                  {groupHead && (
                    <div className="bw-select-group-head" role="presentation">
                      {groupHead}
                    </div>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    data-i={i}
                    // The full description rides in the custom tooltip (below); a native title is
                    // kept only for a disabled option's reason, which the tooltip doesn't show.
                    title={o.disabled ? o.title : undefined}
                    disabled={o.disabled}
                    className={`bw-select-option${selected ? ' selected' : ''}${i === active ? ' active' : ''}${o.disabled ? ' disabled' : ''}${o.description ? ' has-desc' : ''}`}
                    onMouseEnter={() => !o.disabled && setActive(i)}
                    onClick={() => pick(o)}
                  >
                    <span className="bw-select-option-main">
                      <span className="bw-select-option-label">{o.label}</span>
                      {o.description && <span className="bw-select-option-desc">{o.description}</span>}
                    </span>
                    {selected && <Check size={13} strokeWidth={2.4} className="bw-select-tick" aria-hidden />}
                  </button>
                </Fragment>
              );
            })}
          </div>,
          document.body,
        )}
      {open &&
        tip &&
        createPortal(
          <div
            className={`bw-select-tip${tip.right !== undefined ? ' left' : ''}`}
            role="tooltip"
            style={{ top: tip.top, left: tip.left, right: tip.right }}
          >
            {tip.text}
          </div>,
          document.body,
        )}
    </>
  );
}
