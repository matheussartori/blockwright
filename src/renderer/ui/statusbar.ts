// Renders the bottom status bar: replace its content, or show the summary for
// a loaded structure (size / block count / content-pack vs fallback mode).
import type { StructureData } from '@/shared/types';
import { escapeHtml } from './html';

/** Replace the status bar with arbitrary (already-escaped) HTML. */
export function setStatus(statusbar: HTMLElement, html: string): void {
  statusbar.innerHTML = html;
}

/** Show the summary line for a successfully loaded structure. */
export function renderStatus(statusbar: HTMLElement, data: StructureData): void {
  const mode = data.hasContent
    ? '<span class="dot ok"></span>Content pack'
    : '<span class="dot warn-dot"></span>Fallback colors';
  setStatus(statusbar, `
    <span>${escapeHtml(data.name)}</span>
    <span class="sep">·</span>
    <span class="muted">${data.size.join('×')}</span>
    <span class="sep">·</span>
    <span class="muted">${data.blockCount.toLocaleString()} blocks</span>
    <span class="spacer"></span>
    <span class="mode">${mode}</span>
  `);
}
