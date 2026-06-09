// The Generate chat transcript: the empty-state examples, the scrollable message
// list (reference thumbnails, text, the build card, and per-message result stats),
// and the live in-flight status block. A pure view — the parent owns the scroll ref
// + effects and the generation state; this just renders what it's given.
import type { RefObject } from 'react';
import { store } from '../../state/store';
import { formatElapsed } from '../../generation/brief';
import { BuildCard } from './BuildCard';
import type { MessageKey } from '@/shared/i18n';
import type { ChatMessage, GenerateProgress } from '@/shared/types';

/** i18n label per live generation phase. */
const PHASE_LABEL: Record<GenerateProgress['phase'], MessageKey> = {
  thinking: 'gen.phase.thinking',
  building: 'gen.phase.building',
  compiling: 'gen.phase.compiling',
  rendering: 'gen.phase.rendering',
  reviewing: 'gen.phase.reviewing',
};

/** i18n label per design pass id (massing/roof/…), sent by main as `designPhase`. */
const DESIGN_PHASE_LABEL: Record<string, MessageKey> = {
  massing: 'gen.designPhase.massing',
  roof: 'gen.designPhase.roof',
  facade: 'gen.designPhase.facade',
  interior: 'gen.designPhase.interior',
  circulation: 'gen.designPhase.circulation',
  audit: 'gen.designPhase.audit',
};

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
          <p>
            {t('gen.emptyDescPre')}<code>.nbt</code>{t('gen.emptyDescPost')}
          </p>
          <p className="gen-hint">{t('gen.emptyHint')}</p>
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
      {busy && <LiveProgress progress={progress} elapsedMs={elapsedMs} t={t} />}
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

/** The live in-flight block: the current phase + design-pass label and the running
 *  elapsed time / token counts. */
function LiveProgress({ progress, elapsedMs, t }: { progress: GenerateProgress | null; elapsedMs: number; t: T }) {
  return (
    <div className="gen-msg assistant gen-live">
      <div className="gen-progress-head">
        <span className="gen-spinner" aria-hidden />
        <span className="gen-phase">
          {progress ? t(PHASE_LABEL[progress.phase]) : t('gen.phase.generating')}
          {progress?.designPhase && (
            <span className="gen-design-phase">
              {' · '}
              {DESIGN_PHASE_LABEL[progress.designPhase] ? t(DESIGN_PHASE_LABEL[progress.designPhase]) : progress.designPhase}
              {progress.designStep ? ` (${progress.designStep}/${progress.designSteps})` : ''}
            </span>
          )}
        </span>
      </div>
      <div className="gen-stats">
        <span className="gen-stat" title={t('gen.elapsedTitle')}>
          <span className="gen-stat-label">{t('gen.statTime')}</span>
          <span className="gen-stat-value">{formatElapsed(elapsedMs)}</span>
        </span>
        {progress && progress.outputTokens > 0 && (
          <>
            <span className="gen-stat" title={t('gen.statInTitleLive')}>
              <span className="gen-stat-label">{t('gen.statIn')}</span>
              <span className="gen-stat-value">{progress.inputTokens.toLocaleString()}</span>
            </span>
            <span className="gen-stat" title={t('gen.statOutTitle')}>
              <span className="gen-stat-label">{t('gen.statOut')}</span>
              <span className="gen-stat-value">{progress.outputTokens.toLocaleString()}</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
