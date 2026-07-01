// The mod-block generation SCOPE control (off / mix / prefer) + its three-way explanatory
// hint — the same workspace-level preference surfaced in TWO places (set where you browse,
// set where you generate): the Block Catalog's side rail and the Build Planner's config
// column. The two surfaces differ only in their wrapper/label/hint classes and whether the
// label carries the mod namespace, so those are parameters.
import { Segmented } from '../ui/Segmented';
import type { TFunction } from '@/shared/i18n';
import type { ModBlockScope } from '@/shared/types';

export function ModScopeControl({
  scope,
  onChange,
  namespace,
  className,
  labelClassName,
  hintClassName,
  t,
}: {
  scope: ModBlockScope;
  onChange: (scope: ModBlockScope) => void;
  /** The mod namespace to show beside the title (the planner's label); omit for the bare title. */
  namespace?: string;
  className: string;
  labelClassName: string;
  hintClassName: string;
  t: TFunction;
}) {
  return (
    <div className={className}>
      <span className={labelClassName}>
        {t('catalog.scopeTitle')}
        {namespace && (
          <>
            {' · '}
            <code>{namespace}</code>
          </>
        )}
      </span>
      <Segmented<ModBlockScope>
        ariaLabel={t('catalog.scopeTitle')}
        value={scope}
        onChange={onChange}
        options={[
          { value: 'off', label: t('catalog.scopeOff') },
          { value: 'mix', label: t('catalog.scopeMix') },
          { value: 'prefer', label: t('catalog.scopePrefer') },
        ]}
      />
      <span className={hintClassName}>
        {scope === 'off'
          ? t('catalog.scopeHintOff')
          : scope === 'mix'
            ? t('catalog.scopeHintMix')
            : t('catalog.scopeHintPrefer')}
      </span>
    </div>
  );
}
