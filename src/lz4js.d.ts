// Ambient declaration for `lz4js` (pure-JS LZ4, no bundled types). We use only `decompress`, which
// consumes the LZ4 frame format Minecraft writes for compression type 4 in region files.
declare module 'lz4js' {
  /** Decompress an LZ4 frame (magic 04 22 4D 18) into a byte array. */
  export function decompress(src: Uint8Array | number[]): Uint8Array;
  /** Compress bytes into an LZ4 frame (used only by tests to round-trip). */
  export function compress(src: Uint8Array | number[]): Uint8Array;
  const LZ4: { decompress: typeof decompress; compress: typeof compress };
  export default LZ4;
}
