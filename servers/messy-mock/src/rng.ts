/** Deterministic PRNG (mulberry32) so every run of the mock serves identical data. */
export function createRng(seed: number) {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)];
  const chance = (p: number): boolean => next() < p;
  const alnum = (n: number): string => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < n; i++) s += chars[Math.floor(next() * chars.length)];
    return s;
  };
  const hex = (n: number): string => {
    let s = '';
    for (let i = 0; i < n; i++) s += Math.floor(next() * 16).toString(16);
    return s;
  };
  const uuid = (): string => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
  return { next, int, pick, chance, alnum, hex, uuid };
}

export type Rng = ReturnType<typeof createRng>;
