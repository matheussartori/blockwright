// Renders the side inspector: structure metadata and the unique block palette.
import type { StructureData } from '@/shared/types';
import { escapeHtml } from './html';

export function renderInspector(inspector: HTMLElement, data: StructureData): void {
  const uniqueBlocks = data.palette
    .filter((p) => !p.air)
    .map((p) => ({
      name: p.name.replace('minecraft:', ''),
      color: p.color,
      resolved: p.models.length > 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  inspector.innerHTML = `
    <div class="inspector-head">
      <h2>${escapeHtml(data.name)}</h2>
      <dl class="meta">
        <div><dt>Size</dt><dd>${data.size.join(' × ')}</dd></div>
        <div><dt>Blocks</dt><dd>${data.blockCount.toLocaleString()}</dd></div>
        <div><dt>Palette</dt><dd>${uniqueBlocks.length}</dd></div>
      </dl>
    </div>
    <div class="palette-list">
      ${uniqueBlocks
        .map((b) => {
          const swatch = `rgb(${b.color.map((c) => Math.round(c * 255)).join(',')})`;
          const tag = b.resolved ? '' : '<span class="chip">flat</span>';
          return `<div class="palette-row">
            <span class="swatch" style="background:${swatch}"></span>
            <span class="block-name">${escapeHtml(b.name)}</span>${tag}
          </div>`;
        })
        .join('')}
    </div>
  `;
  inspector.classList.remove('hidden');
}

/** Hide and empty the inspector (returning to the welcome view). */
export function clearInspector(inspector: HTMLElement): void {
  inspector.classList.add('hidden');
  inspector.innerHTML = '';
}
