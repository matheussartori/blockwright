// Full-screen lightbox for a chat reference image. Opened by clicking a thumbnail
// the user attached in the Generate chat; the previewed data URL lives in the app
// store so the overlay can render at the App root, above every panel. Dismiss by
// clicking the backdrop, the ✕, or pressing Esc.
import { useEffect } from 'react';
import { useApp } from '../hooks/useStores';
import { store } from '../state/store';

export function ImagePreview() {
  const src = useApp((s) => s.imagePreview);

  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') store.getState().setImagePreview(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [src]);

  if (!src) return null;

  return (
    <div className="image-preview" role="dialog" aria-label="Image preview" onClick={() => store.getState().setImagePreview(null)}>
      <img src={src} alt="reference preview" onClick={(e) => e.stopPropagation()} />
      <button
        className="image-preview-close"
        aria-label="Close preview"
        title="Close"
        onClick={() => store.getState().setImagePreview(null)}
      >
        ✕
      </button>
    </div>
  );
}
