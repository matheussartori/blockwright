// The ± axis pad: a −/+ button per axis. Shared by Move (shifts the selection one block)
// and Extrude (duplicates it `count` blocks). The parent decides what an axis press does.
import type { Axis } from '../../editor/ops';
import type { MessageKey, TFunction } from '@/shared/i18n';

const AXES: Axis[] = ['x', 'y', 'z'];

export function AxisPad({ onAxis, t }: { onAxis: (axis: Axis, dir: 1 | -1) => void; t: TFunction }) {
  return (
    <div className="editor-axispad">
      {AXES.map((axis) => {
        const label = t(`editor.axis${axis.toUpperCase()}` as MessageKey);
        return (
          <div key={axis} className="editor-axisrow">
            <button className="editor-axisbtn no-drag" onClick={() => onAxis(axis, -1)} aria-label={`−${label}`}>
              −
            </button>
            <span className="editor-axislabel">{label}</span>
            <button className="editor-axisbtn no-drag" onClick={() => onAxis(axis, 1)} aria-label={`+${label}`}>
              +
            </button>
          </div>
        );
      })}
    </div>
  );
}
