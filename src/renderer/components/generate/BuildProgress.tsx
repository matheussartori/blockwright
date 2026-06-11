// The live build-progress bar shown while a generation is in flight. A COMPACT,
// determinate-ish bar: the design passes (massing → roof → facade → interior →
// circulation → audit) give a real fraction (designStep / designSteps), so the bar
// fills as the model works through them; before any pass is reported it animates as an
// indeterminate stripe. The phase + current pass label sit above, the live elapsed /
// token cost to the right. Shared by the chat dock (compact) and the stage's pre-first-
// emit "building" card (block) so the two never drift.
import { Loader2 } from 'lucide-react';
import { formatElapsed } from '../../generation/brief';
import type { MessageKey, TFunction } from '@/shared/i18n';
import type { GenerateProgress } from '@/shared/types';

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

interface Props {
  progress: GenerateProgress | null;
  /** Elapsed time of the in-flight run (ms). */
  elapsedMs: number;
  t: TFunction;
  /** `block` = the larger centered stage card; `compact` (default) = the dock line. */
  variant?: 'compact' | 'block';
}

export function BuildProgress({ progress, elapsedMs, t, variant = 'compact' }: Props) {
  const phase = progress ? t(PHASE_LABEL[progress.phase]) : t('gen.phase.generating');
  const pass = progress?.designPhase
    ? DESIGN_PHASE_LABEL[progress.designPhase]
      ? t(DESIGN_PHASE_LABEL[progress.designPhase])
      : progress.designPhase
    : null;
  const step = progress?.designStep ?? 0;
  const steps = progress?.designSteps ?? 0;
  const determinate = steps > 0;
  const pct = determinate ? Math.round((step / steps) * 100) : 0;
  const tokens = progress && progress.outputTokens > 0 ? progress.outputTokens : null;

  return (
    <div className={`build-progress ${variant}`}>
      <div className="build-progress-head">
        <span className="build-progress-phase">
          <Loader2 size={variant === 'block' ? 16 : 13} className="spin" aria-hidden />
          <span className="build-progress-label">{phase}</span>
          {pass && <span className="build-progress-pass">{pass}</span>}
        </span>
        <span className="build-progress-stats" aria-hidden>
          <span className="build-progress-time">{formatElapsed(elapsedMs)}</span>
          {tokens != null && <span className="build-progress-tok">{tokens.toLocaleString()} tok</span>}
        </span>
      </div>
      <div
        className={`build-progress-track${determinate ? '' : ' indeterminate'}`}
        role="progressbar"
        aria-valuenow={determinate ? pct : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={phase}
      >
        <div className="build-progress-fill" style={determinate ? { width: `${pct}%` } : undefined} />
      </div>
      {determinate && (
        <div className="build-progress-steps" aria-hidden>
          {step}/{steps}{pass ? ` · ${pass}` : ''}
        </div>
      )}
    </div>
  );
}
