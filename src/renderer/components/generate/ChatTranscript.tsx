// The Generate chat transcript: the empty-state examples, the scrollable message
// list (reference thumbnails, text, the build card, and per-message result stats),
// and the live in-flight status block. A pure view — the parent owns the scroll ref
// + effects and the generation state; this just renders what it's given.
import type { RefObject } from 'react';
import { Sparkles } from 'lucide-react';
import { store } from '../../state/store';
import { formatElapsed } from '../../generation/brief';
import { BuildCard } from './BuildCard';
import { BuildProgress } from './BuildProgress';
import type { MessageKey } from '@/shared/i18n';
import type { ChatMessage, GenerateProgress } from '@/shared/types';

const EXAMPLES: MessageKey[] = ['gen.example1', 'gen.example2', 'gen.example3'];

type T = (key: MessageKey) => string;

interface Props {
  chat: ChatMessage[];
  busy: boolean;
  progress: GenerateProgress | null;
  /** Elapsed time of the in-flight run (ms), shown live while `busy`. */
  elapsedMs: number;
  t: T;
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Fill the composer with an example prompt (empty-state click). */
  onPickExample: (text: string) => void;
}

export function ChatTranscript({ chat, busy, progress, elapsedMs, t, scrollRef, onPickExample }: Props) {
  return (
    <div className="gen-messages" ref={scrollRef}>
      {chat.length === 0 && (
        <div className="gen-empty">
          <span className="gen-empty-icon" aria-hidden>
            <Sparkles size={20} strokeWidth={1.7} />
          </span>
          <p>
            {t('gen.emptyDescPre')}<code>.nbt</code>{t('gen.emptyDescPost')}
          </p>
          <p className="gen-hint">{t('gen.emptyHint')}</p>
          <span className="gen-examples-label">{t('gen.examplesLabel')}</span>
          <ul className="gen-examples">
            {EXAMPLES.map((ex) => (
              <li key={ex}>
                <button className="gen-example" onClick={() => onPickExample(t(ex))} disabled={busy}>
                  {t(ex)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {chat.map((m, i) => (
        <div key={i} className={`gen-msg ${m.role}${m.error ? ' error' : ''}`}>
          {m.meta && <ResultStats meta={m.meta} t={t} />}
          {m.images && m.images.length > 0 && (
            <div className="gen-msg-images">
              {m.images.map((src, j) => (
                <img
                  key={j}
                  className="gen-msg-thumb"
                  src={src}
                  alt="reference"
                  title={t('gen.imgPreviewTitle')}
                  onClick={() => store.getState().setImagePreview(src)}
                />
              ))}
            </div>
          )}
          {m.text && <div className="gen-msg-text">{m.text}</div>}
          {m.build && <BuildCard build={m.build} t={t} />}
        </div>
      ))}
      {busy && (
        <div className="gen-msg assistant gen-live">
          <BuildProgress progress={progress} elapsedMs={elapsedMs} t={t} />
        </div>
      )}
    </div>
  );
}

/** The result-stats footer under a completed assistant message (version/size/blocks/
 *  time/tokens — whichever the turn reported). */
function ResultStats({ meta, t }: { meta: NonNullable<ChatMessage['meta']>; t: T }) {
  return (
    <div className="gen-stats gen-result-stats">
      {meta.version != null && <span className="gen-stat gen-stat-version">v{meta.version}</span>}
      {meta.size && (
        <span className="gen-stat" title={t('gen.statSizeTitle')}>
          <span className="gen-stat-label">{t('gen.statSize')}</span>
          <span className="gen-stat-value">{meta.size.join('×')}</span>
        </span>
      )}
      {meta.blockCount != null && (
        <span className="gen-stat" title={t('gen.statBlocksTitle')}>
          <span className="gen-stat-label">{t('gen.statBlocks')}</span>
          <span className="gen-stat-value">{meta.blockCount.toLocaleString()}</span>
        </span>
      )}
      {meta.tookMs != null && (
        <span className="gen-stat" title={t('gen.statTimeTitle')}>
          <span className="gen-stat-label">{t('gen.statTime')}</span>
          <span className="gen-stat-value">{formatElapsed(meta.tookMs)}</span>
        </span>
      )}
      {meta.tokensIn != null && (
        <span className="gen-stat" title={t('gen.statInTitle')}>
          <span className="gen-stat-label">{t('gen.statIn')}</span>
          <span className="gen-stat-value">{meta.tokensIn.toLocaleString()}</span>
        </span>
      )}
      {meta.tokensOut != null && (
        <span className="gen-stat" title={t('gen.statOutTitle')}>
          <span className="gen-stat-label">{t('gen.statOut')}</span>
          <span className="gen-stat-value">{meta.tokensOut.toLocaleString()}</span>
        </span>
      )}
    </div>
  );
}

