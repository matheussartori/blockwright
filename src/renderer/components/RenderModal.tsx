// Export ▸ Render Image…: the Beauty Render dialog. High-resolution PNG stills of the
// loaded build (preset angles, transparent or themed background) and a turntable WebM —
// the showcase artifacts builders currently assemble through Blender pipelines. The
// heavy lifting lives in viewer/beauty-render.ts; this dialog only collects options,
// runs the render on the live viewer, and hands the bytes to main's save dialog.
import { useState } from 'react';
import { Camera, Film } from 'lucide-react';
import type { MessageKey } from '@/shared/i18n';
import { api } from '../api';
import { useActiveDoc, useApp, useT } from '../hooks/useStores';
import { store } from '../state/store';
import { useViewer } from '../viewer/ViewerProvider';
import { RENDER_ANGLES, type RenderAngle } from '../viewer/beauty-render';
import { Modal } from './ui/Modal';
import { Select } from './ui/Select';
import { Segmented } from './ui/Segmented';
import { basename } from '../ui/path';

const WIDTHS = [1024, 2048, 4096] as const;
const ASPECTS = { square: 1, wide: 16 / 9 } as const;
const TURNTABLE_SECONDS = [4, 8, 12] as const;

const dataUrlBytes = (url: string): ArrayBuffer => {
  const bin = atob(url.split(',')[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
};

export function RenderModal() {
  const t = useT();
  const open = useApp((s) => s.renderOpen);
  const doc = useActiveDoc();
  const viewer = useViewer();
  const [angle, setAngle] = useState<RenderAngle>('hero');
  const [width, setWidth] = useState<number>(2048);
  const [aspect, setAspect] = useState<keyof typeof ASPECTS>('square');
  const [transparent, setTransparent] = useState(true);
  const [seconds, setSeconds] = useState<number>(8);
  const [busy, setBusy] = useState<'still' | 'turntable' | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  if (!open) return null;
  const close = () => {
    store.getState().setRenderOpen(false);
    setSaved(null);
  };
  const name = doc?.path ? basename(doc.path).replace(/\.(nbt|schem|litematic)$/i, '') : 'structure';
  const height = Math.round(width / ASPECTS[aspect]);
  // The themed background mirrors the live stage: the app's --bg token.
  const themedBg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0f1115';

  const still = async () => {
    if (!viewer) return;
    setBusy('still');
    setSaved(null);
    try {
      const url = viewer.renderStill({ width, height, angle, background: transparent ? null : themedBg });
      if (!url) return;
      const path = await api.saveRender(dataUrlBytes(url), name, 'png');
      if (path) setSaved(path);
    } finally {
      setBusy(null);
    }
  };

  const turntable = async () => {
    if (!viewer) return;
    setBusy('turntable');
    setSaved(null);
    try {
      // The video encoder tops out well below the still sizes — cap the frame width.
      const w = Math.min(width, 2048);
      const recording = viewer.renderTurntable({ width: w, height: Math.round(w / ASPECTS[aspect]), seconds, fps: 30 });
      if (!recording) return; // nothing loaded
      const blob = await recording;
      const path = await api.saveRender(await blob.arrayBuffer(), name, 'webm');
      if (path) setSaved(path);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('render.title')}
      className="render-modal"
      footer={
        <>
          {saved && <span className="render-saved" title={saved}>{t('render.saved', { path: basename(saved) })}</span>}
          <button className="btn" onClick={close} disabled={busy !== null}>
            {t('render.close')}
          </button>
          <button className="btn" disabled={busy !== null || !viewer} onClick={() => void turntable()}>
            <Film size={14} strokeWidth={1.9} aria-hidden />
            {busy === 'turntable' ? t('render.recording') : t('render.turntable')}
          </button>
          <button className="btn primary" disabled={busy !== null || !viewer} onClick={() => void still()}>
            <Camera size={14} strokeWidth={1.9} aria-hidden />
            {busy === 'still' ? t('render.rendering') : t('render.still')}
          </button>
        </>
      }
    >
      <p className="retheme-note">{t('render.note')}</p>
      <div className="render-grid">
        <label className="editor-field">
          <span className="editor-label">{t('render.angle')}</span>
          <Select
            value={angle}
            options={RENDER_ANGLES.map((a) => ({ value: a, label: t(`render.angle.${a}` as MessageKey) }))}
            onChange={(v) => setAngle(v as RenderAngle)}
          />
        </label>
        <label className="editor-field">
          <span className="editor-label">{t('render.resolution')}</span>
          <Select
            value={String(width)}
            options={WIDTHS.map((w) => ({ value: String(w), label: `${w} px` }))}
            onChange={(v) => setWidth(Number(v))}
          />
        </label>
        <label className="editor-field">
          <span className="editor-label">{t('render.aspect')}</span>
          <Segmented
            value={aspect}
            ariaLabel={t('render.aspect')}
            onChange={(v) => setAspect(v as keyof typeof ASPECTS)}
            options={[
              { value: 'square', label: '1:1' },
              { value: 'wide', label: '16:9' },
            ]}
          />
        </label>
        <label className="editor-field">
          <span className="editor-label">{t('render.background')}</span>
          <Segmented
            value={transparent ? 'transparent' : 'themed'}
            ariaLabel={t('render.background')}
            onChange={(v) => setTransparent(v === 'transparent')}
            options={[
              { value: 'transparent', label: t('render.bgTransparent') },
              { value: 'themed', label: t('render.bgThemed') },
            ]}
          />
        </label>
        <label className="editor-field">
          <span className="editor-label">{t('render.duration')}</span>
          <Select
            value={String(seconds)}
            options={TURNTABLE_SECONDS.map((s) => ({ value: String(s), label: `${s} s` }))}
            onChange={(v) => setSeconds(Number(v))}
          />
        </label>
      </div>
      <p className="retheme-note">{t('render.turntableNote')}</p>
    </Modal>
  );
}
