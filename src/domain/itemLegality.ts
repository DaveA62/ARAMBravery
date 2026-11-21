import type { Champion, Item } from '../data';
import { items } from '../data';
import { byId, shuffled } from './random';
import scaling from './scaling.json';

export type Mode = 'little' | 'straight';
export const ITEM_SLOT_COUNT = 6;
type Scaling = Record<'ad' | 'ap', Record<string, number>>;
const profiles: Partial<Record<string, Scaling>> = scaling.profiles;
const allItems = [...items].sort(byId);

export function championCompatibility(champion: Champion): { ad: boolean; ap: boolean } {
  if (champion.power) {
    return {
      ad: champion.power === 'ad' || champion.power === 'hybrid',
      ap: champion.power === 'ap' || champion.power === 'hybrid',
    };
  }

  const profile = profiles[champion.id];
  if (!profile) return { ad: false, ap: false };

  function meaningful(ratios: number[]): boolean {
    return ratios.some((ratio) => ratio >= 30) || ratios.reduce((sum, ratio) => sum + ratio, 0) >= 50;
  }

  return {
    ad: meaningful(Object.values(profile.ad)),
    ap: meaningful(Object.values(profile.ap)),
  };
}

export function eligibleItems(champion: Champion, mode: Mode): Item[] {
  const scaling = championCompatibility(champion);
  return allItems.filter((item) => {
    if (item.allowedChampions && !item.allowedChampions.includes(champion.id)) return false;
    if (item.forbiddenChampions?.includes(champion.id)) return false;
    if (mode === 'straight' || item.power === 'neutral') return true;
    if (item.power === 'hybrid') return scaling.ad || scaling.ap;
    return scaling[item.power];
  });
}

export function isBoot(item: Item): boolean {
  return item.groups.includes('boots');
}

export function canCombine(candidate: Item, occupied: readonly Item[]): boolean {
  return occupied.every((item) => item.id !== candidate.id &&
    !item.groups.some((group) => candidate.groups.includes(group)));
}

export function validateItems(champion: Champion, selection: readonly Item[], mode: Mode = 'straight'): boolean {
  if (selection.length !== ITEM_SLOT_COUNT) return false;
  const allowed = new Map(eligibleItems(champion, mode).map((item) => [item.id, item]));
  const canonicalItems = selection.flatMap(({ id }) => {
    const match = allowed.get(id);
    return match ? [match] : [];
  });
  return canonicalItems.length === ITEM_SLOT_COUNT &&
    canonicalItems.every((item, index) => canCombine(item, canonicalItems.slice(0, index)));
}

function findBuild(remaining: readonly Item[], chosen: readonly Item[], slots: number, needsBoot = false): Item[] | null {
  if (chosen.length === slots) return needsBoot ? null : [...chosen];
  if (needsBoot && !remaining.some((item) => isBoot(item) && canCombine(item, chosen))) return null;
  for (let index = 0; index <= remaining.length - (slots - chosen.length); index += 1) {
    const candidate = remaining[index];
    if (!canCombine(candidate, chosen)) continue;
    const result = findBuild(remaining.slice(index + 1), [...chosen, candidate], slots, needsBoot && !isBoot(candidate));
    if (result) return result;
  }
  return null;
}

export function generateItems(
  champion: Champion, mode: Mode, random: () => number, ensureBoot = true,
): Item[] {
  const pool = shuffled(eligibleItems(champion, mode), random);
  const selection = findBuild(pool, [], ITEM_SLOT_COUNT, ensureBoot && pool.some(isBoot));
  if (!selection) throw new Error(`The item pool cannot fill six legal slots for ${champion.name}.`);
  return selection;
}
