/** A fixed 32-bit PRNG. Change the generator version if the algorithm changes. */
export function seededRandom(key: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    state = Math.imul(state ^ key.charCodeAt(index), 16777619);
  }

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(options: readonly T[], random: () => number): T[] {
  const result = [...options];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function pick<T>(options: readonly T[], random: () => number): T {
  if (!options.length) throw new Error('The verified pool has no legal candidate.');
  return options[Math.floor(random() * options.length)];
}

export function byId<T extends { id: string }>(left: T, right: T): number {
  return left.id < right.id ? -1 : Number(left.id !== right.id);
}

export function newSeed(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
}
