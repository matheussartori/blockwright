// The 16 Minecraft dye colors as sRGB hex (Java's DyeColor diffuse colors) — shared by
// everything that tints a grayscale entity texture: banner cloth, sheep wool, shulker.
export const DYE: Record<string, number> = {
  white: 0xf9fffe,
  orange: 0xf9801d,
  magenta: 0xc74ebd,
  light_blue: 0x3ab3da,
  yellow: 0xfed83d,
  lime: 0x80c71f,
  pink: 0xf38baa,
  gray: 0x474f52,
  light_gray: 0x9d9d97,
  cyan: 0x169c9c,
  purple: 0x8932b8,
  blue: 0x3c44aa,
  brown: 0x835432,
  green: 0x5e7c16,
  red: 0xb02e26,
  black: 0x1d1d21,
};

/** Dye ids in their numeric NBT order (sheep `Color`, shulker `Color`). */
export const DYE_ORDER = [
  'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray',
  'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black',
] as const;

/** Hex → normalized [r,g,b]. */
export function dyeRgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
}
