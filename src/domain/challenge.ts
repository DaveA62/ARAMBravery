import { champions, DATA_VERSION, spells, type Champion, type Item, type Spell } from '../data';
import { rankAugments, type AugmentDecision } from './augmentDecisions';
import {
  CURATION_VERSION, LEGACY_CURATION_VERSION, curatedChampionPool, describeCuration, describeStandardCuration,
  findGuide, isCurationVersion, rollsForCuration, selectGuide, type Curation,
} from './curation';
import { canCombine, eligibleItems, generateItems, type Mode } from './itemLegality';
import { byId, pick, seededRandom, shuffled } from './random';
import { generateSkills, type SkillStep } from './skills';

export const GENERATOR_VERSION = '1';
const sortedChampions = [...champions].sort(byId);
const sortedSpells = [...spells].sort(byId);

export type RerollAction =
  | { type: 'item'; index: number }
  | { type: 'spell'; index: number }
  | { type: 'items' }
  | { type: 'spells' };

export interface ChallengeConfig {
  seed: string;
  mode: Mode;
  /** When omitted, the seed chooses from the eligible champion pool. */
  championId?: string;
  curated?: boolean;
  curationVersion?: string;
  rerolls: RerollAction[];
}

export type ChallengeInput = Omit<ChallengeConfig, 'rerolls'> & { rerolls?: readonly RerollAction[] };

export interface Challenge {
  config: ChallengeConfig;
  champion: Champion;
  items: Item[];
  spells: Spell[];
  skills: SkillStep[];
  augments: AugmentDecision[];
  curation?: Curation;
}

type Equipment = Pick<Challenge, 'items' | 'spells' | 'curation'>;
type RerollCategory = 'items' | 'spells';
type RerollCounts = Record<RerollCategory, number>;

export function eligibleSpells(champion: Champion): Spell[] {
  return sortedSpells.filter((spell) => !spell.forbiddenChampions?.includes(champion.id));
}

export function validateSpells(champion: Champion, selection: readonly Spell[]): boolean {
  const allowed = new Set(eligibleSpells(champion).map(({ id }) => id));
  return selection.length === 2 && selection[0].id !== selection[1].id &&
    selection.every(({ id }) => allowed.has(id));
}

function generateSpells(champion: Champion, random: () => number): Spell[] {
  const selection = shuffled(eligibleSpells(champion), random).slice(0, 2);
  if (selection.length !== 2) throw new Error(`The spell pool cannot fill two slots for ${champion.name}.`);
  return selection;
}

function challengeRandom(seed: string, scope: string): () => number {
  return seededRandom(JSON.stringify([GENERATOR_VERSION, DATA_VERSION, seed, scope]));
}

function rerollCategory(action: RerollAction): RerollCategory {
  return action.type === 'item' || action.type === 'items' ? 'items' : 'spells';
}

export function isRerollAction(value: unknown): value is RerollAction {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  if (value.type === 'items' || value.type === 'spells') return true;
  if (value.type !== 'item' && value.type !== 'spell') return false;
  return 'index' in value && typeof value.index === 'number' &&
    Number.isInteger(value.index) && value.index >= 0 &&
    value.index < (value.type === 'item' ? 6 : 2);
}

export function isChallengeInput(value: unknown): value is ChallengeInput {
  if (!value || typeof value !== 'object' || !('seed' in value) || !('mode' in value)) return false;
  return typeof value.seed === 'string' && value.seed.trim().length > 0 &&
    (value.mode === 'little' || value.mode === 'straight') &&
    (!('curated' in value) || value.curated === undefined || typeof value.curated === 'boolean') &&
    (!('curationVersion' in value) || value.curationVersion === undefined ||
      ('curated' in value && value.curated === true && isCurationVersion(value.curationVersion))) &&
    (!('championId' in value) || value.championId === undefined ||
      sortedChampions.some(({ id }) => id === value.championId)) &&
    (!('rerolls' in value) || value.rerolls === undefined ||
      (Array.isArray(value.rerolls) && value.rerolls.every(isRerollAction)));
}

function rerollItem(
  champion: Champion, mode: Mode, current: readonly Item[], index: number,
  random: () => number, guideItems: readonly string[] = [],
): Item[] {
  const occupied = current.filter((_, position) => position !== index);
  const candidates = eligibleItems(champion, mode)
    .filter((item) => item.id !== current[index].id && canCombine(item, occupied));
  const curated = candidates.filter((item) => guideItems.includes(item.id));
  const items = [...current];
  if (candidates.length) items[index] = pick(curated.length ? curated : candidates, random);
  return items;
}

function rerollEquipment(
  challenge: Pick<Challenge, 'champion' | 'config'> & Equipment,
  action: RerollAction,
  count: number,
  loadoutRoll: number,
): Equipment {
  const { champion, config } = challenge;
  const random = challengeRandom(config.seed, `${rerollCategory(action)}:${count}`);
  const equipment: Equipment = {
    items: challenge.items, spells: challenge.spells,
    ...(challenge.curation ? { curation: challenge.curation } : {}),
  };

  if (action.type === 'items') {
    const attempt = rollsForCuration(config.seed, config.curationVersion, loadoutRoll);
    const guide = attempt ? selectGuide(champion, config.mode, config.seed, count, challenge.curation?.guideId) : undefined;
    let items = generateItems(champion, config.mode, random, guide?.guide.itemIds);
    if (guide && items.every(({ id }, index) => id === challenge.items[index].id)) {
      // A single matching source cannot provide a second full loadout. Adapt one
      // slot so the requested reroll still changes the result and its attribution.
      const index = Math.floor(random() * items.length);
      items = rerollItem(champion, config.mode, items, index, random);
    }
    if (!config.curated) return { ...equipment, items };
    const curation = attempt ? describeCuration(champion, config.mode, guide, items) : describeStandardCuration();
    return { ...equipment, items, curation };
  }
  if (action.type === 'spells') {
    return { ...equipment, spells: generateSpells(champion, random) };
  }

  // The current and occupied slots are excluded, so a reroll visibly changes
  // that slot whenever any alternative purchase or spell is legal.
  if (action.type === 'item') {
    const followsGuide = challenge.curation?.status === 'applied' || config.curationVersion === LEGACY_CURATION_VERSION;
    const guide = followsGuide ? findGuide(champion, config.mode, challenge.curation?.guideId) : undefined;
    const items = rerollItem(champion, config.mode, equipment.items, action.index, random, guide?.guide.itemIds);
    if (!guide) return { ...equipment, items };
    return { ...equipment, items, curation: describeCuration(champion, config.mode, guide, items) };
  }

  const candidates = eligibleSpells(champion)
    .filter(({ id }) => challenge.spells.every((spell) => spell.id !== id));
  const spells = [...challenge.spells];
  if (candidates.length) spells[action.index] = pick(candidates, random);
  return { ...equipment, spells };
}

export function generateChallenge(input: ChallengeInput): Challenge {
  if (!isChallengeInput(input)) throw new Error('Invalid challenge seed or configuration.');
  const config: ChallengeConfig = {
    seed: input.seed.trim(),
    mode: input.mode,
    ...(input.championId ? { championId: input.championId } : {}),
    ...(input.curated ? { curated: true, curationVersion: input.curationVersion ?? CURATION_VERSION } : {}),
    rerolls: [...(input.rerolls ?? [])],
  };
  const attempt = rollsForCuration(config.seed, config.curationVersion, 0);
  const selectedChampion = sortedChampions.find(({ id }) => id === config.championId);
  const sourceRoster = attempt && !selectedChampion ? curatedChampionPool(sortedChampions, config.mode) : [];
  const champion = selectedChampion ?? pick(sourceRoster.length ? sourceRoster : sortedChampions, challengeRandom(config.seed, 'champion'));
  const guide = attempt ? selectGuide(champion, config.mode, config.seed, 0) : undefined;
  const items = generateItems(champion, config.mode, challengeRandom(config.seed, 'items:0'), guide?.guide.itemIds);
  let equipment: Equipment = {
    items,
    spells: generateSpells(champion, challengeRandom(config.seed, 'spells:0')),
    ...(config.curated ? { curation: attempt ? describeCuration(champion, config.mode, guide, items) : describeStandardCuration() } : {}),
  };

  const counts: RerollCounts = { items: 0, spells: 0 };
  let loadoutRoll = 0;
  for (const action of config.rerolls) {
    const category = rerollCategory(action);
    if (action.type === 'items') loadoutRoll += 1;
    equipment = rerollEquipment({ champion, config, ...equipment }, action, ++counts[category], loadoutRoll);
  }

  return {
    config,
    champion,
    ...equipment,
    skills: generateSkills(champion.id, challengeRandom(config.seed, 'skills')),
    augments: rankAugments(challengeRandom(config.seed, 'augments')),
  };
}

export function rerollChallenge(challenge: Challenge, action: RerollAction): Challenge {
  if (!isRerollAction(action)) throw new Error('Invalid reroll action.');
  const category = rerollCategory(action);
  const count = challenge.config.rerolls.filter((entry) => rerollCategory(entry) === category).length + 1;
  const loadoutRoll = action.type === 'items' ? challenge.config.rerolls.filter((entry) => entry.type === 'items').length + 1 : 0;
  return {
    ...challenge,
    ...rerollEquipment(challenge, action, count, loadoutRoll),
    config: { ...challenge.config, rerolls: [...challenge.config.rerolls, action] },
  };
}

export function modeName(mode: Mode): string {
  return mode === 'little' ? 'A Little Bullshit' : 'Straight Bullshit';
}

export function challengeSummary(challenge: Challenge): string {
  const { champion, config, curation, items, skills, spells } = challenge;
  const guide = curation?.source;
  return [
    `ARAM Mayhem — Ultimate Bravery · ${champion.name}`,
    modeName(config.mode),
    ...(guide ? [
      `${curation?.adapted ? 'Adapted from' : 'Build from'} ${guide.name} · ${guide.title} by ${guide.author} · ${guide.url}`,
    ] : []),
    `Purchase order: ${items.map(({ name }) => name).join(' → ')}`,
    `Summoner spells: ${spells.map(({ name }) => name).join(' + ')}`,
    `Skill order: ${skills.map(({ level, ability }) => `${level} ${ability ?? '–'}`).join(' · ')}`,
    `Seed ${config.seed} · Data ${DATA_VERSION} · Generator ${GENERATOR_VERSION}`,
  ].join('\n');
}
