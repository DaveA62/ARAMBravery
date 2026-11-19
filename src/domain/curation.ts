import type { Champion, Item } from '../data';
import { curatedGuides, CURATION_VERSION as snapshotVersion } from '../data/curated';
import { compatibleGuideItems, type Mode } from './itemLegality';
import { pick, seededRandom } from './random';

const GUIDE_SNAPSHOT_VERSION: string = snapshotVersion;
export const LEGACY_CURATION_VERSION = 'mobafire-26.23-1';
export const CURATION_VERSION = `${GUIDE_SNAPSHOT_VERSION}-chance1`;
export const CURATED_CHANCE = 0.5;
const MIN_GUIDE_ITEMS = 4;

interface GuideRecord {
  id: string;
  championId: string;
  title: string;
  author: string;
  url: string;
  itemIds: readonly string[];
  sourceMode?: 'aram';
}

interface GuidePlan {
  guide: GuideRecord;
  choices: Item[];
}

export interface Curation {
  status: 'applied' | 'fallback' | 'standard';
  itemIds: string[];
  guideId?: string;
  reason?: string;
  source?: { name: 'MOBAFire'; title: string; author: string; url: string; mode: 'aram' | 'rift' };
  adapted?: boolean;
}

const guidesByChampion = new Map<string, GuideRecord[]>();
for (const guide of curatedGuides) {
  const list = guidesByChampion.get(guide.championId) ?? [];
  list.push(guide);
  guidesByChampion.set(guide.championId, list);
}

const plansByMode: Record<Mode, Map<string, GuidePlan[]>> = { little: new Map(), straight: new Map() };

export function isCurationVersion(value: unknown): value is string {
  return value === CURATION_VERSION || (GUIDE_SNAPSHOT_VERSION === LEGACY_CURATION_VERSION && value === LEGACY_CURATION_VERSION);
}

export function rollsForCuration(seed: string, version: string | undefined, roll: number): boolean {
  if (version === LEGACY_CURATION_VERSION) return true;
  if (version !== CURATION_VERSION) return false;
  return seededRandom(JSON.stringify(['curation-chance', version, seed, roll]))() < CURATED_CHANCE;
}

function guidePlans(champion: Champion, mode: Mode): GuidePlan[] {
  const cached = plansByMode[mode].get(champion.id);
  if (cached) return cached;
  const plans = (guidesByChampion.get(champion.id) ?? [])
    .map((guide) => ({ guide, choices: compatibleGuideItems(champion, mode, guide.itemIds) }))
    .filter(({ choices }) => choices.length >= MIN_GUIDE_ITEMS)
    .sort((left, right) => right.choices.length - left.choices.length ||
      (left.guide.id < right.guide.id ? -1 : Number(left.guide.id !== right.guide.id)));
  plansByMode[mode].set(champion.id, plans);
  return plans;
}

export function curatedChampionPool(champions: readonly Champion[], mode: Mode): Champion[] {
  return champions.filter((champion) => guidePlans(champion, mode).length);
}

export function selectGuide(champion: Champion, mode: Mode, seed: string, roll: number, previousGuideId?: string): GuidePlan | undefined {
  const available = guidePlans(champion, mode);
  if (!available.length) return undefined;
  const alternatives = available.filter(({ guide }) => guide.id !== previousGuideId);
  const eligible = alternatives.length ? alternatives : available;
  const best = eligible.filter(({ choices }) => choices.length === eligible[0].choices.length);
  const random = seededRandom(JSON.stringify(['moba-guide', GUIDE_SNAPSHOT_VERSION, seed, champion.id, mode, roll]));
  return pick(best, random);
}

export function findGuide(champion: Champion, mode: Mode, id?: string): GuidePlan | undefined {
  return guidePlans(champion, mode).find(({ guide }) => guide.id === id);
}

export function describeStandardCuration(): Curation {
  return { status: 'standard', itemIds: [], reason: 'The curation draw missed. This roll used the regular item pool.' };
}

export function describeCuration(champion: Champion, mode: Mode, plan: GuidePlan | undefined, equipment: readonly Item[]): Curation {
  if (!plan) {
    const hasGuide = Boolean(guidesByChampion.get(champion.id)?.length);
    const reason = hasGuide
      ? `The verified guides have fewer than ${MIN_GUIDE_ITEMS} compatible Mayhem purchases${mode === 'little' ? ' in A Little Bullshit' : ''}. Using the normal item pool.`
      : `No verified MOBAFire build is available for ${champion.name}. Using the normal item pool.`;
    return { status: 'fallback', itemIds: [], reason };
  }

  const { guide } = plan;
  const itemIds = equipment.map(({ id }) => id).filter((id) => guide.itemIds.includes(id));
  if (!itemIds.length) {
    return { status: 'fallback', guideId: guide.id, itemIds, reason: 'All guide items have been replaced. The current purchases are from the normal item pool.' };
  }
  const adapted = equipment.length !== guide.itemIds.length ||
    equipment.some(({ id }, index) => id !== guide.itemIds[index]);
  return {
    status: 'applied',
    guideId: guide.id,
    itemIds,
    source: { name: 'MOBAFire', title: guide.title, author: guide.author, url: guide.url, mode: guide.sourceMode ?? 'rift' },
    adapted,
  };
}
