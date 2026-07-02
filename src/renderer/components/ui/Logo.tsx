// The app mark — one theme-neutral artwork (the squircle app-icon tile) used
// everywhere; no light/dark variants. The asset lives in public/logo.png.
export function Logo({ size = 64, className }: { size?: number; className?: string }) {
  return (
    <img
      src="logo.png"
      width={size}
      height={size}
      alt="Blockwright"
      className={className}
      draggable={false}
    />
  );
}
