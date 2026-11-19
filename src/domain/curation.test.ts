import { afterEach, describe, expect, it, vi } from 'vitest';
import { champions, items } from '../data';
import { curatedGuides } from '../data/curated';
import {
  CURATION_VERSION, challengeFromUrl, challengeKey, challengeSummary, challengeUrl, generateChallenge,
  loadLibrary, rememberChallenge, rerollChallenge, toggleFavorite, validateItems, type Mode,
} from './index';
import { curatedChampionPool } from './curation';
import { compatibleGuideItems } from './itemLegality';

const base = 'https://example.github.io/ARAMBravery/';
const seed = 'PUBLISHED-MAYHEM';
const modes: Mode[] = ['little', 'straight'];

afterEach(() => vi.unstubAllGlobals());

describe('optional MOBAFire curation', () => {
  it('ships only distinct, credited guide entries that are legal in the current Mayhem shop', () => {
    expect(new Set(curatedGuides.map(({ id }) => id)).size).toBe(curatedGuides.length);
    let legalGuides = 0;
    for (const guide of curatedGuides) {
      const champion = champions.find(({ id }) => id === guide.championId);
      const lineup = guide.itemIds.map((id) => items.find((item) => item.id === id));
      expect(guide.url).toMatch(/^https:\/\/www\.mobafire\.com\/league-of-legends\/build\//);
      expect(guide.title.trim()).not.toBe('');
      expect(guide.author.trim()).not.toBe('');
      if (champion && lineup.every((item) => item !== undefined) && validateItems(champion, lineup, 'straight')) legalGuides += 1;
    }
    expect(legalGuides).toBe(curatedGuides.length);
  });

  it('preserves ordinary generation, legacy config identity and sharing when the toggle is off', () => {
    const build = generateChallenge({ seed, mode: 'straight' });
    const explicitlyOff = generateChallenge({ seed, mode: 'straight', curated: false });
    expect(explicitlyOff).toEqual(build);
    expect(build.config).not.toHaveProperty('curated');
    expect(build).not.toHaveProperty('curation');
    expect(challengeKey(explicitlyOff)).toBe(challengeKey(build));
    const oldUrl = challengeUrl(build, base);
    expect(new URL(oldUrl).searchParams.get('curated')).toBeNull();
    expect(challengeFromUrl(oldUrl)).toEqual(build);
  });

  it('selects covered random champions in both modes and adapts only with a majority of guide items', () => {
    expect(curatedGuides.length).toBeGreaterThan(1);
    for (const mode of modes) {
      const roster = curatedChampionPool(champions, mode);
      expect(roster.length).toBeGreaterThan(0);
      for (let index = 0; index < 25; index += 1) {
        const build = generateChallenge({ seed: `${seed}-${index}`, mode, curated: true });
        expect(roster).toContain(build.champion);
        expect(build.curation?.status).toBe('applied');
        expect(build.curation?.itemIds.length).toBeGreaterThanOrEqual(4);
        expect(validateItems(build.champion, build.items, mode)).toBe(true);
        expect(generateChallenge(build.config)).toEqual(build);
      }
    }
  });

  it('copies complete legal source purchases in order and attributes the linked guide', () => {
    const build = generateChallenge({ seed, mode: 'little', championId: 'Nautilus', curated: true });
    const info = build.curation;
    expect(info).toMatchObject({ status: 'applied', adapted: false, source: { name: 'MOBAFire', author: 'LBDB' } });
    const guide = curatedGuides.find(({ id }) => id === info?.guideId)!;
    expect(build.items.map(({ id }) => id)).toEqual(guide.itemIds);
    expect(info?.source?.url).toBe(guide.url);
    expect(challengeSummary(build)).toContain(guide.url);
  });

  it('keeps an uncovered manual champion and explicitly falls back without false attribution', () => {
    const uncovered = champions.find((champion) => !curatedGuides.some((guide) => guide.championId === champion.id))!;
    const config = { seed, mode: 'little', championId: uncovered.id } as const;
    const build = generateChallenge({ ...config, curated: true });
    const ordinary = generateChallenge(config);
    expect(build.champion).toBe(ordinary.champion);
    expect(build.items).toEqual(ordinary.items);
    expect(build.curation).toMatchObject({ status: 'fallback', itemIds: [] });
    expect(build.curation?.reason).toContain(uncovered.name);
    expect(build.curation?.source).toBeUndefined();
  });

  it('filters offensive scaling, unavailable ids, repeats and ownership groups before attribution', () => {
    const champion = champions.find(({ id }) => id === 'Lux')!;
    const subset = compatibleGuideItems(champion, 'little', ['3031', '3020', '3158', '3089', '3089', '3100', '4645', '6653', '999999']);
    expect(subset.map(({ id }) => id)).toEqual(['3020', '3089', '3100', '4645', '6653']);
  });

  it('adapts personal rerolls, keeps other slots fixed, and can reroll a one-guide loadout', () => {
    const build = generateChallenge({ seed, mode: 'little', championId: 'Karma', curated: true });
    const item = rerollChallenge(build, { type: 'item', index: 1 });
    expect(item.items[1].id).not.toEqual(build.items[1].id);
    expect(item.items.filter((_, index) => index !== 1)).toEqual(build.items.filter((_, index) => index !== 1));
    expect(item.curation).toMatchObject({ status: 'applied', adapted: true });
    expect(item.curation?.itemIds).not.toContain(build.items[1].id);
    expect(item.spells).toBe(build.spells);
    expect(item.augments).toBe(build.augments);
    const all = rerollChallenge(build, { type: 'items' });
    expect(all.items).not.toEqual(build.items);
    expect(validateItems(build.champion, all.items, build.config.mode)).toBe(true);
    expect(generateChallenge(item.config)).toEqual(item);
    expect(generateChallenge(all.config)).toEqual(all);
  });

  it('round-trips the curated dataset revision and maintains separate saved identities', () => {
    const config = { seed, mode: 'straight', championId: 'Jhin' } as const;
    const ordinary = generateChallenge(config);
    const curated = rerollChallenge(generateChallenge({ ...config, curated: true }), { type: 'item', index: 3 });
    const url = new URL(challengeUrl(curated, base));
    expect(url.searchParams.get('curated')).toBe('1');
    expect(url.searchParams.get('guides')).toBe(CURATION_VERSION);
    expect(challengeFromUrl(url)).toEqual(curated);
    url.searchParams.set('guides', 'retired-snapshot');
    expect(challengeFromUrl(url)).toBeNull();
    expect(challengeKey(curated)).not.toBe(challengeKey(ordinary));

    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    rememberChallenge(ordinary);
    rememberChallenge(curated);
    toggleFavorite(ordinary);
    toggleFavorite(curated);
    const saved = loadLibrary();
    expect(saved.history.map(generateChallenge)).toEqual([curated, ordinary]);
    expect(saved.favorites.map(generateChallenge)).toEqual([curated, ordinary]);
  });
});
