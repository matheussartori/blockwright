// Rename the current generated project — its library FOLDER and the latest
// `<name>.nbt` inside it — so a build saved under a prompt-slug name (which reads
// like a Claude suggestion) gets a clean name BEFORE exporting (the export dialogs
// seed their filename from this `.nbt`). Opened from File ▸ Rename Project…; the
// rename itself is a main-process file move (api.renameProject), after which we
// re-point the document + recents at the new path.
import { useEffect, useState } from 'react';
import { api } from '../api';
import { store } from '../state/store';
import { useApp, useT } from '../hooks/useStores';
import { documentsStore, activeDocument } from '../state/documents';
import { persistDoc } from '../state/generation';
import { basename } from '../ui/path';
import { Modal } from './ui/Modal';

/** The project's display name = its library file basename without the extension. */
function currentName(filePath: string): string {
  return basename(filePath).replace(/\.nbt$/i, '');
}

export function RenameProjectModal() {
  const t = useT();
  const open = useApp((s) => s.renameOpen);
  const doc = activeDocument(documentsStore.getState());
  // Only a generated project (its own library folder) can be renamed.
  const filePath = doc?.generated ? doc.filePath : null;

  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed the field with the current name each time the dialog opens.
  useEffect(() => {
    if (open && filePath) {
      setName(currentName(filePath));
      setError(null);
      setBusy(false);
    }
  }, [open, filePath]);

  const close = () => store.getState().setRenameOpen(false);

  const submit = async () => {
    if (!doc || !filePath || busy) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === currentName(filePath)) {
      close();
      return;
    }
    setBusy(true);
    setError(null);
    const result = await api.renameProject(filePath, trimmed, doc.sessionId);
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    // Re-point the document + recents at the renamed library file. `doc.path` (the
    // scratch `vN.nbt` the viewer shows) is untouched, so the build stays on screen.
    documentsStore.getState().patchDoc(doc.id, { filePath: result.file, title: basename(result.file) });
    void api.removeRecent(filePath);
    void api.addRecent(result.file);
    persistDoc(doc.id); // re-key the chat history under the new path
    store.getState().setNotice({ text: t('rename.done', { name: result.name }), warn: false });
    close();
  };

  return (
    <Modal
      open={open && !!filePath}
      onClose={close}
      title={t('rename.title')}
      className="rename-modal"
      footer={
        <div className="rename-actions">
          <button className="btn" onClick={close} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" onClick={() => void submit()} disabled={busy || !name.trim()}>
            {t('rename.save')}
          </button>
        </div>
      }
    >
      <p className="rename-hint">{t('rename.hint')}</p>
      <input
        className="input rename-input"
        autoFocus
        spellCheck={false}
        value={name}
        placeholder={t('rename.placeholder')}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit();
        }}
      />
      {error && <p className="rename-error">{error}</p>}
    </Modal>
  );
}
