// Deterministic per-block-name colors, used to render blocks when their
// textures are missing (or no content pack is present).

/** Deterministic, evenly-spread fallback color per block name (HSL → RGB, 0..1). */
export function fallbackColor(name: string): [number, number, number] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = (h % 360) / 360;
  const sat = 0.45 + ((h >> 9) % 30) / 100; // 0.45..0.75
  const light = 0.45 + ((h >> 17) % 20) / 100; // 0.45..0.65
  return hslToRgb(hue, sat, light);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue2rgb(h + 1 / 3), hue2rgb(h), hue2rgb(h - 1 / 3)];
}
