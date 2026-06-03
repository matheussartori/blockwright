// Shared modal shell: a dimmed overlay + an elevated panel with a titled header
// and a close button. Owns the common behaviour (Escape to close, backdrop click,
// swallowing keys so the viewer's WASD/F shortcuts stay inert while open) so every
// dialog in the app looks and behaves the same. Settings and the Block Catalog
// are both built on it.
import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Extra class on the panel (e.g. sizing variants like `modal-lg`). */
  className?: string;
  /** Extra class on the scrolling body. */
  bodyClassName?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, className, bodyClassName, children, footer }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (!(e.target as Element)?.closest?.('.modal')) e.stopPropagation();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${className ? ` ${className}` : ''}`} role="dialog" aria-modal="true">
        <header className="modal-head">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" title="Close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className={`modal-body${bodyClassName ? ` ${bodyClassName}` : ''}`}>{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}
