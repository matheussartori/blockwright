// The app mark, themed to the current appearance. We set nativeTheme.themeSource
// from the theme setting, so the renderer's prefers-color-scheme tracks the
// chosen theme (system/light/dark) — which lets a plain <picture> swap the dark
// (dark-plinth) and light (light-plinth) logo with no JS. Assets live in public/.
export function Logo({ size = 64, className }: { size?: number; className?: string }) {
  return (
    <picture className={className}>
      <source media="(prefers-color-scheme: dark)" srcSet="logo-dark.png" />
      <img src="logo-light.png" width={size} height={size} alt="Blockwright" draggable={false} />
    </picture>
  );
}
