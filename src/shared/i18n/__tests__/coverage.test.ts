// i18n coverage guard. Two failure modes this catches:
//   1. A UI-chrome string left in English under pt-BR (value identical to en) —
//      unless it's a deliberate loanword/identical term on the allowlist.
//   2. A REGISTRY-DATA string (module/preset/param/provider/preset label) with no
//      pt-BR override in `data-pt-BR.ts` — so a new module/provider can't ship
//      English-only. The expected keys are generated from the SAME key builders the
//      app uses, walked over the REAL catalog + ai.ts registries.
import { describe, it, expect } from 'vitest';
import { en } from '../en';
import { ptBR } from '../pt-BR';
import { dataPtBR } from '../data-pt-BR';
import { AI_PROVIDERS, GENERATION_PRESETS } from '@/shared/ai';
import { listModuleCatalog } from '@/main/structure/domain';
import { moduleKey, paramKey, paramOptionKey, groupKey, presetKey, aiProviderKey, aiPresetKey } from '../registry';

/** Chrome keys whose pt-BR value is LEGITIMATELY identical to English — proper
 *  nouns, loanwords, or words spelled the same in both languages. */
const CHROME_IDENTICAL_OK = new Set<string>([
  'menu.jigsaw', 'menu.console', 'menu.layout', 'menu.zoom', 'panel.jigsaw', 'inspector.jigsaws', 'jigsaw.seed',
  'statusbar.jigsawLabel',
  'console.title', 'catalog.namespace', 'workspace.label', 'modules.presetsCount', 'modules.universal',
  'ai.beta', 'ai.genPreset', 'shortcuts.zoom', 'versions.original', 'gen.designPhase.interior',
  'gen.autoSuffix', 'gen.heightTotalMode', 'viewer.contentPack',
  'editor.axisX', 'editor.axisY', 'editor.axisZ',
]);

describe('i18n chrome coverage', () => {
  it('has no pt-BR value left identical to English (outside the loanword allowlist)', () => {
    const stillEnglish = (Object.keys(en) as (keyof typeof en)[]).filter(
      (k) => ptBR[k] === en[k] && !CHROME_IDENTICAL_OK.has(k),
    );
    expect(stillEnglish, `untranslated pt-BR keys: ${stillEnglish.join(', ')}`).toEqual([]);
  });
});

/** Every registry-data key the app will ask `localizeData` for, from the live registries. */
function expectedDataKeys(): string[] {
  const keys: string[] = [];
  const catalog = listModuleCatalog();
  for (const [category, value] of Object.entries(catalog)) {
    if (category === 'groups') {
      for (const g of catalog.groups) keys.push(groupKey(g.id));
      continue;
    }
    for (const m of value as { id: string; category: string; params?: unknown[]; presets?: unknown[] }[]) {
      const mk = moduleKey(m.category as never, m.id);
      keys.push(mk.label, mk.desc);
      for (const p of (m.params ?? []) as { name: string; kind: string; options?: { value: string }[] }[]) {
        keys.push(paramKey(p.name));
        if (p.kind === 'enum') for (const o of p.options ?? []) keys.push(paramOptionKey(p.name, o.value));
      }
      for (const p of (m.presets ?? []) as { scale: string; furnishings: string[] }[]) {
        const pk = presetKey(m.id, p.scale);
        keys.push(pk.label, pk.summary, ...p.furnishings.map((_, i) => pk.furnishing(i)));
      }
    }
  }
  for (const prov of AI_PROVIDERS) keys.push(aiProviderKey(prov.id).label, aiProviderKey(prov.id).blurb);
  for (const pre of GENERATION_PRESETS) keys.push(aiPresetKey(pre.id).label, aiPresetKey(pre.id).blurb);
  return keys;
}

describe('i18n registry-data coverage', () => {
  it('has a pt-BR override for every registry-data string', () => {
    const missing = expectedDataKeys().filter((k) => dataPtBR[k] === undefined);
    expect(missing, `registry data missing pt-BR: ${missing.join(', ')}`).toEqual([]);
  });
});
