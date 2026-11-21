import { champions, DATA_VERSION, spells, type Champion, type Item, type Spell } from '../data';
import { rankAugments, type AugmentDecision } from './augmentDecisions';
import { canCombine, eligibleItems, generateItems, isBoot, type Mode } from './itemLegality';
import { byId, pick, seededRandom, shuffled } from './random';
import { generateSkills, type SkillStep } from './skills';

export const LEGACY_GENERATOR_VERSION = '1';
export const GENERATOR_VERSION = '2';
export type GeneratorVersion = typeof LEGACY_GENERATOR_VERSION | typeof GENERATOR_VERSION;
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
  generatorVersion?: GeneratorVersion;
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
}

type Equipment = Pick<Challenge, 'items' | 'spells'>;
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

export function isGeneratorVersion(value: unknown): value is GeneratorVersion {
  return value === LEGACY_GENERATOR_VERSION || value === GENERATOR_VERSION;
}

function challengeRandom(config: Pick<ChallengeConfig, 'seed' | 'generatorVersion'>, scope: string): () => number {
  return seededRandom(JSON.stringify([config.generatorVersion ?? GENERATOR_VERSION, DATA_VERSION, config.seed, scope]));
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
    (!('generatorVersion' in value) || value.generatorVersion === undefined || isGeneratorVersion(value.generatorVersion)) &&
    // Saved builds that relied on the retired guide pool cannot be reproduced.
    (!('curated' in value) || value.curated !== true) &&
    (!('curationVersion' in value) || value.curationVersion === undefined) &&
    (!('championId' in value) || value.championId === undefined ||
      sortedChampions.some(({ id }) => id === value.championId)) &&
    (!('rerolls' in value) || value.rerolls === undefined ||
      (Array.isArray(value.rerolls) && value.rerolls.every(isRerollAction)));
}

function rerollItem(
  champion: Champion, mode: Mode, current: readonly Item[], index: number,
  random: () => number,
  { avoidBoots, excludedItemIds }: {
    avoidBoots?: boolean; excludedItemIds?: ReadonlySet<string>;
  } = {},
): Item[] {
  const occupied = current.filter((_, position) => position !== index);
  const legal = eligibleItems(champion, mode)
    .filter((item) => item.id !== current[index].id && !excludedItemIds?.has(item.id) && canCombine(item, occupied));
  const nonBoots = avoidBoots ? legal.filter((item) => !isBoot(item)) : [];
  const candidates = nonBoots.length ? nonBoots : legal;
  const items = [...current];
  if (candidates.length) items[index] = pick(candidates, random);
  return items;
}

function rerollEquipment(
  challenge: Pick<Challenge, 'champion' | 'config'> & Equipment,
  action: RerollAction,
  count: number,
  excludedItemIds?: ReadonlySet<string>,
): Equipment {
  const { champion, config } = challenge;
  const ensureBoot = config.generatorVersion !== LEGACY_GENERATOR_VERSION;
  const random = challengeRandom(config, `${rerollCategory(action)}:${count}`);
  const equipment: Equipment = {
    items: challenge.items, spells: challenge.spells,
  };

  if (action.type === 'items') {
    return { ...equipment, items: generateItems(champion, config.mode, random, ensureBoot) };
  }
  if (action.type === 'spells') {
    return { ...equipment, spells: generateSpells(champion, random) };
  }

  // The current and occupied slots are excluded, so a reroll visibly changes
  // that slot whenever any alternative purchase or spell is legal.
  if (action.type === 'item') {
    const items = rerollItem(champion, config.mode, equipment.items, action.index, random, {
      avoidBoots: ensureBoot && isBoot(equipment.items[action.index]),
      excludedItemIds,
    });
    return { ...equipment, items };
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
    generatorVersion: input.generatorVersion ?? GENERATOR_VERSION,
    ...(input.championId ? { championId: input.championId } : {}),
    rerolls: [...(input.rerolls ?? [])],
  };
  const selectedChampion = sortedChampions.find(({ id }) => id === config.championId);
  const champion = selectedChampion ?? pick(sortedChampions, challengeRandom(config, 'champion'));
  const items = generateItems(
    champion, config.mode, challengeRandom(config, 'items:0'), config.generatorVersion !== LEGACY_GENERATOR_VERSION,
  );
  let equipment: Equipment = {
    items,
    spells: generateSpells(champion, challengeRandom(config, 'spells:0')),
  };

  const counts: RerollCounts = { items: 0, spells: 0 };
  for (const action of config.rerolls) {
    const category = rerollCategory(action);
    equipment = rerollEquipment({ champion, config, ...equipment }, action, ++counts[category]);
  }

  return {
    config,
    champion,
    ...equipment,
    skills: generateSkills(champion.id, challengeRandom(config, 'skills')),
    augments: rankAugments(challengeRandom(config, 'augments')),
  };
}

export function rerollChallenge(challenge: Challenge, action: RerollAction, excludedItemIds?: ReadonlySet<string>): Challenge {
  if (!isRerollAction(action)) throw new Error('Invalid reroll action.');
  const category = rerollCategory(action);
  const count = challenge.config.rerolls.filter((entry) => rerollCategory(entry) === category).length + 1;
  return {
    ...challenge,
    ...rerollEquipment(challenge, action, count, excludedItemIds),
    config: { ...challenge.config, rerolls: [...challenge.config.rerolls, action] },
  };
}

export function modeName(mode: Mode): string {
  return mode === 'little' ? 'A Little Bullshit' : 'Straight Bullshit';
}

export function challengeSummary(challenge: Challenge): string {
  const { champion, config, items, skills, spells } = challenge;
  return [
    `ARAM Mayhem — Ultimate Bravery · ${champion.name}`,
    modeName(config.mode),
    `Purchase order: ${items.map(({ name }) => name).join(' → ')}`,
    `Summoner spells: ${spells.map(({ name }) => name).join(' + ')}`,
    `Skill order: ${skills.map(({ level, ability }) => `${level} ${ability ?? '–'}`).join(' · ')}`,
    `Seed ${config.seed} · Data ${DATA_VERSION} · Generator ${config.generatorVersion ?? GENERATOR_VERSION}`,
  ].join('\n');
}
