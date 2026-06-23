// One row in the export file tree: filename on top, its folder beneath (so the
// otherwise-identical `<name>.json` files read as distinct), with a leading icon and an
// optional trailing badge. Shared by the live preview and the success summary.
import type { ReactNode } from 'react';
import { basename, dirname } from '../../ui/path';

/** Drop the `data/<ns>/` prefix so a row reads as the path INSIDE the data pack. */
const insidePack = (rel: string, namespace: string): string =>
  namespace ? rel.replace(`data/${namespace}/`, '') : rel;

interface ExportFileRowProps {
  rel: string;
  namespace: string;
  icon: ReactNode;
  badge?: ReactNode;
}

export function ExportFileRow({ rel, namespace, icon, badge }: ExportFileRowProps) {
  const short = insidePack(rel, namespace);
  return (
    <li className="export-file" title={short}>
      {icon}
      <span className="export-file-main">
        <code className="export-file-name">{basename(rel)}</code>
        <span className="export-file-dir">{dirname(short)}</span>
      </span>
      {badge}
    </li>
  );
}
