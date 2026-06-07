// A framed preview surface shared by the Block Catalog and the Module Gallery.
// It shows a real image when one is available (a block texture now; an in-game
// screenshot later — drop a PNG named `previews/<category>-<id>.png` in public/
// and it's picked up automatically), and a tasteful CSS-only placeholder until
// then. A "cohesion veil" (`.preview-frame-veil`) is layered over EVERY image so
// even a vivid in-game screenshot is desaturated/vignetted into the app's palette
// instead of clashing with the surrounding chrome. `onError` falls back to the
// placeholder, so a missing screenshot never shows a broken image.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

interface PreviewFrameProps {
  /** Image URL (a resolved texture, or a guessed screenshot path). */
  src?: string | null;
  alt?: string;
  /** Crisp nearest-neighbour upscaling for low-res block textures. */
  pixelated?: boolean;
  /** Placeholder background tint (e.g. a block's deterministic fallback colour). */
  tint?: string;
  /** Overlaid chip(s), top-left. */
  badge?: ReactNode;
  /** Overlaid caption, bottom-left (sits on the veil's bottom fade). */
  caption?: ReactNode;
  /** Centre hint shown under the glyph when there's no image. */
  placeholder?: ReactNode;
  className?: string;
}

/** A small isometric cube — the empty-state mark (on-theme for a Minecraft tool). */
const CUBE = (
  <svg viewBox="0 0 48 48" width="40" height="40" fill="none" aria-hidden>
    <path d="M24 5 42 15v18L24 43 6 33V15z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" opacity="0.55" />
    <path d="M24 5 42 15 24 25 6 15z" fill="currentColor" opacity="0.16" />
    <path d="M24 25v18M24 25 6 15M24 25l18-10" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" opacity="0.4" />
  </svg>
);

export function PreviewFrame({ src, alt = '', pixelated, tint, badge, caption, placeholder, className }: PreviewFrameProps) {
  const [failed, setFailed] = useState(false);
  // Reset the error gate whenever the source changes so a new image gets a fresh try.
  useEffect(() => setFailed(false), [src]);

  const showImg = !!src && !failed;
  const emptyStyle = tint ? ({ ['--frame-tint' as string]: tint } as CSSProperties) : undefined;

  return (
    <div className={`preview-frame${pixelated ? ' pixelated' : ''}${className ? ` ${className}` : ''}`}>
      {showImg ? (
        <img
          className="preview-frame-img"
          src={src!}
          alt={alt}
          draggable={false}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="preview-frame-empty" style={emptyStyle}>
          <span className="preview-frame-glyph">{CUBE}</span>
          {placeholder && <span className="preview-frame-hint">{placeholder}</span>}
        </div>
      )}
      <span className="preview-frame-veil" aria-hidden />
      {badge && <div className="preview-frame-badge">{badge}</div>}
      {caption && <div className="preview-frame-caption">{caption}</div>}
    </div>
  );
}

/** The convention for a module's optional screenshot in public/ (auto-loaded). */
export function modulePreviewSrc(category: string, id: string): string {
  return `previews/${category}-${id}.png`;
}
