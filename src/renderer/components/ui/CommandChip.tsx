// A copyable Minecraft command row: the command in mono + a one-click Copy with
// feedback. Shared by the export success state and the Jigsaw panel so the
// "test it in-game" loop is always one paste away.
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useT } from '../../hooks/useStores';

export function CommandChip({ command, hint }: { command: string; hint?: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="command-chip">
      {hint && <p className="command-chip-hint">{hint}</p>}
      <div className="command-chip-row">
        <code className="command-chip-cmd" title={command}>{command}</code>
        <button
          type="button"
          className={`command-chip-copy${copied ? ' done' : ''}`}
          aria-label={t('command.copy')}
          title={copied ? t('command.copied') : t('command.copy')}
          onClick={copy}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
    </div>
  );
}
