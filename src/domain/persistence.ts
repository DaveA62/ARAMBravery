import { DATA_VERSION } from '../data';
import {
  generateChallenge,
  GENERATOR_VERSION,
  LEGACY_GENERATOR_VERSION,
  isChallengeInput,
  isGeneratorVersion,
  type Challenge,
  type ChallengeConfig,
  type RerollAction,
} from './challenge';
import { CURATION_VERSION, LEGACY_CURATION_VERSION, isCurationVersion } from './curation';

const LIBRARY_KEY = `aram-bravery.library.${DATA_VERSION}.${GENERATOR_VERSION}`;
const LEGACY_LIBRARY_KEY = `aram-bravery.library.${DATA_VERSION}.${LEGACY_GENERATOR_VERSION}`;
const PREFERENCES_KEY = 'aram-bravery.preferences.v1';
const HISTORY_LENGTH = 24;
const ITEM_ACTIONS = '123456';
const SPELL_ACTIONS = 'ab';

function encodeReroll(action: RerollAction): string {
  if (action.type === 'items') return 'I';
  if (action.type === 'spells') return 'S';
  if (action.type === 'item') return ITEM_ACTIONS[action.index];
  return SPELL_ACTIONS[action.index];
}

function decodeReroll(token: string): RerollAction | null {
  if (token === 'I') return { type: 'items' };
  if (token === 'S') return { type: 'spells' };
  const item = ITEM_ACTIONS.indexOf(token);
  if (item !== -1) return { type: 'item', index: item };
  const spell = SPELL_ACTIONS.indexOf(token);
  return spell === -1 ? null : { type: 'spell', index: spell };
}

function asConfig(value: ChallengeConfig | Challenge): ChallengeConfig {
  return 'config' in value ? value.config : value;
}

export function challengeKey(value: ChallengeConfig | Challenge): string {
  const config = asConfig(value);
  return JSON.stringify([
    `${DATA_VERSION}.${config.generatorVersion ?? GENERATOR_VERSION}`, config.seed, config.mode,
    config.championId ?? null, config.rerolls.map(encodeReroll).join(''),
    ...(config.curated ? [config.curationVersion ?? CURATION_VERSION] : []),
  ]);
}

export function challengeUrl(value: ChallengeConfig | Challenge, base: string | URL = globalThis.location.href): string {
  const config = asConfig(value);
  const url = new URL(base);
  url.searchParams.set('seed', config.seed);
  url.searchParams.set('mode', config.mode);
  url.searchParams.set('data', DATA_VERSION);
  url.searchParams.set('v', config.generatorVersion ?? GENERATOR_VERSION);
  if (config.championId) url.searchParams.set('champion', config.championId);
  else url.searchParams.delete('champion');

  if (config.curated) {
    url.searchParams.set('curated', '1');
    url.searchParams.set('guides', config.curationVersion ?? CURATION_VERSION);
  } else {
    url.searchParams.delete('curated');
    url.searchParams.delete('guides');
  }

  if (config.rerolls.length) url.searchParams.set('reels', config.rerolls.map(encodeReroll).join(''));
  else url.searchParams.delete('reels');

  url.hash = '';
  return url.toString();
}

export function challengeFromUrl(source: string | URL | Location = globalThis.location): Challenge | null {
  try {
    if (!source) return null;
    const url = new URL(typeof source === 'string' ? source : source.href);
    const query = url.searchParams;
    const generatorVersion = query.get('v');
    if (query.get('data') !== DATA_VERSION || !isGeneratorVersion(generatorVersion)) return null;

    const curated = query.get('curated');
    const curationVersion = curated === '1' ? query.get('guides') : undefined;
    if (curated !== null && (curated !== '1' || !isCurationVersion(curationVersion))) return null;

    const rerolls: RerollAction[] = [];
    for (const token of query.get('reels') ?? '') {
      const action = decodeReroll(token);
      if (!action) return null;
      rerolls.push(action);
    }

    const input = {
      seed: query.get('seed'),
      mode: query.get('mode'),
      generatorVersion,
      championId: query.get('champion') ?? undefined,
      ...(curated === '1' ? { curated: true, curationVersion } : {}),
      rerolls,
    };
    return isChallengeInput(input) ? generateChallenge(input) : null;
  } catch {
    return null;
  }
}

export interface ChallengeLibrary {
  favorites: ChallengeConfig[];
  history: ChallengeConfig[];
}

export interface Preferences {
  masterVolume: number;
  effectsVolume: number;
  muted: boolean;
  motion: 'full' | 'short' | 'off';
  compact: boolean;
}

export const DEFAULT_PREFERENCES: Readonly<Preferences> = {
  masterVolume: 0.65,
  effectsVolume: 0.8,
  muted: false,
  motion: 'full',
  compact: false,
};

function readLocal(key: string): unknown {
  try {
    const stored = globalThis.localStorage.getItem(key);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: unknown): void {
  try {
    globalThis.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Keep the current session usable when storage is disabled or full.
  }
}

function configs(value: unknown): ChallengeConfig[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isChallengeInput).flatMap((config) => {
    const curationVersion = config.curated ? config.curationVersion ?? LEGACY_CURATION_VERSION : undefined;
    if (curationVersion && !isCurationVersion(curationVersion)) return [];
    return [{
      ...config,
      generatorVersion: config.generatorVersion ?? LEGACY_GENERATOR_VERSION,
      ...(curationVersion ? { curationVersion } : {}),
      rerolls: [...(config.rerolls ?? [])],
    }];
  });
}

export function loadLibrary(): ChallengeLibrary {
  const stored = readLocal(LIBRARY_KEY) ?? readLocal(LEGACY_LIBRARY_KEY);
  if (!stored || typeof stored !== 'object') return { favorites: [], history: [] };
  const value = stored as Partial<Record<keyof ChallengeLibrary, unknown>>;
  return { favorites: configs(value.favorites), history: configs(value.history) };
}

export function rememberChallenge(challenge: Challenge): ChallengeLibrary {
  const library = loadLibrary();
  const key = challengeKey(challenge);
  library.history = [challenge.config, ...library.history.filter((entry) => challengeKey(entry) !== key)]
    .slice(0, HISTORY_LENGTH);
  writeLocal(LIBRARY_KEY, library);
  return library;
}

export function toggleFavorite(challenge: Challenge): ChallengeLibrary {
  const library = loadLibrary();
  const key = challengeKey(challenge);
  const without = library.favorites.filter((entry) => challengeKey(entry) !== key);
  library.favorites = without.length === library.favorites.length ? [challenge.config, ...without] : without;
  writeLocal(LIBRARY_KEY, library);
  return library;
}

export function loadPreferences(defaultMotion: Preferences['motion'] = DEFAULT_PREFERENCES.motion): Preferences {
  const stored = readLocal(PREFERENCES_KEY);
  const preferences = { ...DEFAULT_PREFERENCES, motion: defaultMotion };
  if (!stored || typeof stored !== 'object') return preferences;

  const value = stored as Partial<Record<keyof Preferences, unknown>>;
  if (typeof value.masterVolume === 'number' && Number.isFinite(value.masterVolume)) {
    preferences.masterVolume = Math.min(1, Math.max(0, value.masterVolume));
  }
  if (typeof value.effectsVolume === 'number' && Number.isFinite(value.effectsVolume)) {
    preferences.effectsVolume = Math.min(1, Math.max(0, value.effectsVolume));
  }
  if (typeof value.muted === 'boolean') preferences.muted = value.muted;
  if (typeof value.compact === 'boolean') preferences.compact = value.compact;
  if (value.motion === 'full' || value.motion === 'short' || value.motion === 'off') preferences.motion = value.motion;
  return preferences;
}

export function savePreferences(preferences: Preferences): void {
  writeLocal(PREFERENCES_KEY, preferences);
}
