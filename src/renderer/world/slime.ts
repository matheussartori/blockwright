// Seed-derived slime chunks (Java Edition): a chunk is a slime chunk iff
// `new Random(seed + x*x*0x4c1906 + x*0x5ac0db + z*z*0x4307a7 + z*0x5f24f ^ 0x3ad8025f)
//  .nextInt(10) == 0` — vanilla's exact formula, so the overlay matches the game. Java's
// 48-bit LCG (java.util.Random) is reproduced with BigInt; pure + unit-tested.

const MASK_48 = (1n << 48n) - 1n;
const MULTIPLIER = 0x5deece66dn;
const INCREMENT = 0xbn;

/** java.util.Random's 48-bit LCG, exact. */
export class JavaRandom {
  private state: bigint;

  constructor(seed: bigint) {
    this.state = (seed ^ MULTIPLIER) & MASK_48;
  }

  /** The core `next(bits)` step: advance the LCG, return the top `bits` as a SIGNED int32. */
  private next(bits: number): number {
    this.state = (this.state * MULTIPLIER + INCREMENT) & MASK_48;
    return Number(BigInt.asIntN(32, this.state >> BigInt(48 - bits)));
  }

  /** Java's `nextInt()` — a full signed int32. */
  nextInt(): number;
  /** Java's `nextInt(bound)` — uniform in [0, bound), with the modulo-bias rejection loop. */
  nextInt(bound: number): number;
  nextInt(bound?: number): number {
    if (bound === undefined) return this.next(32);
    if ((bound & -bound) === bound) {
      // Power of two: one multiply-shift, no rejection.
      return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n);
    }
    let bits: number;
    let val: number;
    do {
      bits = this.next(31);
      val = bits % bound;
    } while (bits - val + (bound - 1) < 0);
    return val;
  }
}

/** Whether chunk (cx, cz) is a slime chunk for the given world seed (decimal string). */
export function isSlimeChunk(seed: string, cx: number, cz: number): boolean {
  const x = BigInt(cx);
  const z = BigInt(cz);
  const chunkSeed =
    (BigInt(seed) + x * x * 0x4c1906n + x * 0x5ac0dbn + z * z * 0x4307a7n + z * 0x5f24fn) ^ 0x3ad8025fn;
  return new JavaRandom(BigInt.asIntN(64, chunkSeed)).nextInt(10) === 0;
}
