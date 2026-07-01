// Shared pointer-drag helper for the resizable side panels (Project panel /
// inspector dock). Mirrors the Console dock's row-resize behavior: track the
// pointer from the grab point, apply the delta to the width the panel had at
// grab time, and let the store clamp. `dir` is +1 when dragging right grows
// the panel (a left panel) and -1 when dragging left grows it (a right panel).
export function startColDrag(
  e: { clientX: number; preventDefault(): void },
  startWidth: number,
  dir: 1 | -1,
  apply: (width: number) => void,
): void {
  e.preventDefault();
  const startX = e.clientX;
  const move = (ev: PointerEvent) => {
    apply(startWidth + dir * (ev.clientX - startX));
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    document.body.classList.remove('col-resizing');
  };
  document.body.classList.add('col-resizing');
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}
