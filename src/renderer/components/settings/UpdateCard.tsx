// Settings ▸ About — the software-update status card. Self-managing: it owns the
// check lifecycle and renders one calm row whose chip icon, title, sub-line, and
// action all follow the current `phase`. Only the "available" phase spends the
// accent — every other state stays neutral.
import { useState, type ComponentType } from 'react';
import { CheckCircle2, Download, Loader2, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
import type { TFunction } from '@/shared/i18n';
import type { UpdateInfo } from '@/shared/types';
import { api } from '../../api';
import { store } from '../../state/store';
import { useT } from '../../hooks/useStores';

type CheckState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'upToDate' }
  | { phase: 'available'; info: UpdateInfo }
  | { phase: 'error' };

type LucideIcon = ComponentType<{ size?: number; className?: string }>;

/** Presentation for a phase: the card/chip `tone`, the chip `Icon`, and the copy. */
interface PhaseView {
  tone: '' | 'ok' | 'available' | 'error';
  Icon: LucideIcon;
  spin?: boolean;
  title: string;
  sub?: string;
}

function phaseView(state: CheckState, appVersion: string | null, t: TFunction): PhaseView {
  switch (state.phase) {
    case 'checking':
      return { tone: '', Icon: Loader2, spin: true, title: t('about.update.checking') };
    case 'upToDate':
      return {
        tone: 'ok',
        Icon: CheckCircle2,
        title: t('update.upToDate'),
        sub: appVersion ? t('update.upToDateDetail', { version: appVersion }) : undefined,
      };
    case 'available':
      return { tone: 'available', Icon: Sparkles, title: t('update.available'), sub: t('about.update.availableSub') };
    case 'error':
      return { tone: 'error', Icon: TriangleAlert, title: t('about.update.errorTitle'), sub: t('about.update.errorSub') };
    default:
      return { tone: '', Icon: RefreshCw, title: t('about.update.title'), sub: t('about.update.idleSub') };
  }
}

export function UpdateCard({ appVersion }: { appVersion: string | null }) {
  const t = useT();
  const [state, setState] = useState<CheckState>({ phase: 'idle' });

  const runCheck = async () => {
    setState({ phase: 'checking' });
    try {
      const info = await api.checkForUpdatesQuiet();
      if (info) {
        store.getState().setUpdate(info); // also surface the global banner
        setState({ phase: 'available', info });
      } else {
        setState({ phase: 'upToDate' });
      }
    } catch {
      setState({ phase: 'error' });
    }
  };

  const view = phaseView(state, appVersion, t);

  return (
    <div className={`update-card ${view.tone}`.trim()}>
      <span className="update-card-chip" aria-hidden>
        <view.Icon size={17} className={view.spin ? 'spin' : undefined} />
      </span>

      <div className="update-card-body">
        <div className="update-card-title">
          {view.title}
          {state.phase === 'available' && <span className="update-card-version">{state.info.version}</span>}
        </div>
        {view.sub && <p className="update-card-sub">{view.sub}</p>}
      </div>

      {state.phase === 'available' ? (
        <button className="btn sm primary update-card-action" onClick={() => void api.openExternal(state.info.url)}>
          <Download size={13} />
          {t('update.download')}
        </button>
      ) : state.phase !== 'checking' ? (
        <button className="btn sm update-card-action" onClick={() => void runCheck()}>
          {state.phase === 'idle' ? t('about.update.check') : t('about.update.checkAgain')}
        </button>
      ) : null}
    </div>
  );
}
