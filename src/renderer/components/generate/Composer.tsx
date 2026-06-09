// The Generate composer: the bottom input region — staged attachments, the Details
// and Floors sections (passed in as slots), the prompt textarea, and the action
// toolbar (attach / Details / Floors / Send-Cancel). Owns the file picker + the
// drag/drop/paste image intake (calling `onAddFiles`); all other state lives on the
// parent, which passes the section slots and handlers in.
import { useRef, type ReactNode } from 'react';
import { ACCEPTED_IMAGE, type Attachment, isAcceptedImage } from '../../generation/attachments';
import type { MessageKey } from '@/shared/i18n';

type T = (key: MessageKey) => string;

interface Props {
  input: string;
  onInput: (value: string) => void;
  onSubmit: () => void;
  attachments: Attachment[];
  onAddFiles: (files: Iterable<File>) => void;
  onRemoveAttachment: (id: string) => void;
  /** Placeholder for the textarea. */
  placeholder: string;
  /** The Floors section, when open (else null). */
  floorsSlot: ReactNode;
  busy: boolean;
  available: boolean | null;
  canSend: boolean;
  // Toolbar toggle state + handlers.
  showFloors: boolean;
  /** Whether the Build Planner currently holds any picks (drives the "•" marker). */
  hasDetails: boolean;
  /** Whether the doc is file-backed (the Floors toggle only applies to an existing build). */
  isExisting: boolean;
  /** Defined-floor count, shown as a badge on the Floors toggle. */
  floorCount: number;
  /** Open the full-stage Build Planner. */
  onOpenDetails: () => void;
  onToggleFloors: () => void;
  onCancel: () => void;
  t: T;
}

export function Composer(props: Props) {
  const {
    input, onInput, onSubmit, attachments, onAddFiles, onRemoveAttachment,
    placeholder, floorsSlot, busy, available, canSend,
    showFloors, hasDetails, isExisting, floorCount,
    onOpenDetails, onToggleFloors, onCancel, t,
  } = props;
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div
      className="gen-composer"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        if (Array.from(e.dataTransfer.files).some(isAcceptedImage)) {
          e.preventDefault();
          e.stopPropagation(); // don't let the window-level .nbt drop handler see it
          onAddFiles(e.dataTransfer.files);
        }
      }}
    >
      {attachments.length > 0 && (
        <div className="gen-attachments">
          {attachments.map((a) => (
            <div key={a.id} className="gen-attachment">
              <img src={a.dataUrl} alt="reference" />
              <button
                className="gen-attachment-remove"
                title={t('gen.remove')}
                aria-label={t('gen.removeImage')}
                onClick={() => onRemoveAttachment(a.id)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      {floorsSlot}
      <textarea
        className="gen-input"
        placeholder={placeholder}
        value={input}
        rows={3}
        disabled={busy || available === false}
        onChange={(e) => onInput(e.target.value)}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files);
          if (files.some(isAcceptedImage)) {
            e.preventDefault();
            onAddFiles(files);
          }
        }}
        onKeyDown={(e) => {
          e.stopPropagation(); // keep typing out of the viewer's WASD / F shortcuts
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      <div className="gen-composer-actions">
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED_IMAGE.join(',')}
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) onAddFiles(e.target.files);
            e.target.value = ''; // allow re-selecting the same file
          }}
        />
        <button
          className="btn sm gen-attach"
          title={t('gen.attachTitle')}
          disabled={busy || available === false}
          onClick={() => fileInput.current?.click()}
        >
          {t('gen.imageBtn')}
        </button>
        <button
          className={`btn sm gen-details-toggle${hasDetails ? ' has-details' : ''}`}
          title={t('gen.detailsBtnTitle')}
          disabled={busy || available === false}
          onClick={onOpenDetails}
        >
          {t('gen.detailsBtn')}{hasDetails ? ' •' : ''}
        </button>
        {isExisting && (
          <button
            className={`btn sm gen-details-toggle${floorCount > 0 ? ' has-details' : ''}`}
            title={t('gen.floorsBtnTitle')}
            aria-pressed={showFloors}
            disabled={busy}
            onClick={onToggleFloors}
          >
            {t('gen.floorsBtn')}{floorCount > 0 ? ` (${floorCount})` : ''}
          </button>
        )}
        {busy ? (
          <button className="btn gen-send gen-cancel" onClick={onCancel}>
            {t('gen.cancel')}
          </button>
        ) : (
          <button className="btn primary gen-send" onClick={onSubmit} disabled={!canSend}>
            {t('gen.send')}
          </button>
        )}
      </div>
    </div>
  );
}
