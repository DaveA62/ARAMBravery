import { afterEach, describe, expect, it, vi } from 'vitest';
import { champions, DATA_VERSION } from '../data';
import { curatedGuides } from '../data/curated';
import {
  GENERATOR_VERSION, LEGACY_GENERATOR_VERSION, challengeFromUrl, challengeKey, challengeUrl, eligibleItems,
  generateChallenge, isBoot, loadLibrary, rememberChallenge, rerollChallenge, toggleFavorite, validateItems, type Mode,
} from './index';

const baseUrl = 'https://example.github.io/ARAMBravery/';
const modes: Mode[] = ['little', 'straight'];

afterEach(() => vi.unstubAllGlobals());

describe('finished boots in new loadouts', () => {
  it('rolls exactly one legal boot whenever available and respects Cassiopeia', () => {
    for (const mode of modes) {
      for (const champion of champions) {
        const build = generateChallenge({ seed: 'ROSTER-BOOTS', mode, championId: champion.id });
        const usableBoots = eligibleItems(champion, mode).filter(isBoot);
        const expectedBootCount = Number(usableBoots.length > 0);
        if (champion.id === 'Cassiopeia') expect(expectedBootCount).toBe(0);
        expect(build.items.filter(isBoot)).toHaveLength(expectedBootCount);
        const next = rerollChallenge(build, { type: 'items' });
        expect(next.items.filter(isBoot)).toHaveLength(expectedBootCount);
        expect(validateItems(champion, next.items, mode)).toBe(true);
      }
    }
  });

  it('adds boots to a bootless curated guide and preserves boots on a same-guide full reroll', () => {
    const guided = generateChallenge({ seed: 'PUBLISHED-MAYHEM-0', mode: 'straight', championId: 'Nunu', curated: true });
    const source = curatedGuides.find(({ id }) => id === guided.curation?.guideId)!;
    expect(guided.curation).toMatchObject({ status: 'applied', adapted: true });
    expect(guided.items.slice(0, 5).map(({ id }) => id)).toEqual(source.itemIds.slice(0, 5));
    expect(guided.items.filter(isBoot)).toHaveLength(1);

    const next = rerollChallenge(guided, { type: 'items' });
    expect(next.items).not.toEqual(guided.items);
    expect(next.items.filter(isBoot)).toHaveLength(1);
    expect(generateChallenge(next.config)).toEqual(next);
  });

  it('allows the individual boot reel to become a non-boot without touching any other slot', () => {
    const initial = generateChallenge({ seed: 'DROP-BOOTS', mode: 'little', championId: 'Jinx' });
    const index = initial.items.findIndex(isBoot);
    expect(index).toBeGreaterThanOrEqual(0);
    const after = rerollChallenge(initial, { type: 'item', index });
    expect(after.items.filter(isBoot)).toHaveLength(0);
    expect(after.items.filter((_, slot) => slot !== index)).toEqual(initial.items.filter((_, slot) => slot !== index));
    expect(validateItems(initial.champion, after.items, initial.config.mode)).toBe(true);
    expect(challengeFromUrl(challengeUrl(after, baseUrl))).toEqual(after);
    expect(rerollChallenge(after, { type: 'items' }).items.filter(isBoot)).toHaveLength(1);
  });

  it('excludes room-owned item IDs only for individual item rerolls', () => {
    const initial = generateChallenge({ seed: 'ROOM-ITEMS', mode: 'straight', championId: 'Jinx' });
    const index = initial.items.findIndex((item) => !isBoot(item));
    const action = { type: 'item', index } as const;
    const replacement = rerollChallenge(initial, action);
    const excluded = new Set([replacement.items[index].id]);
    const roomReroll = rerollChallenge(initial, action, excluded);
    expect(roomReroll.items[index].id).not.toBe(replacement.items[index].id);
    expect(roomReroll.items[index].id).not.toBe(initial.items[index].id);
    expect(roomReroll.config).toEqual(replacement.config);
    expect(validateItems(initial.champion, roomReroll.items, initial.config.mode)).toBe(true);
    const excludedAll = new Set(eligibleItems(initial.champion, initial.config.mode).map(({ id }) => id));
    expect(rerollChallenge(initial, action, excludedAll).items).toEqual(initial.items);
    expect(rerollChallenge(initial, { type: 'items' }, excludedAll)).toEqual(rerollChallenge(initial, { type: 'items' }));
    expect(rerollChallenge(initial, { type: 'spell', index: 0 }, excludedAll)).toEqual(rerollChallenge(initial, { type: 'spell', index: 0 }));
  });
});

describe('published version-1 challenges', () => {
  const oldUrl = `${baseUrl}?seed=LEGACY-BOOTS&mode=straight&data=${DATA_VERSION}&v=1&champion=Ezreal&reels=3a`;

  it('replays the same old item, spell, skill, and augment outcomes from an existing share URL', () => {
    const old = challengeFromUrl(oldUrl)!;
    expect(old.config.generatorVersion).toBe(LEGACY_GENERATOR_VERSION);
    expect(old.items.map(({ id }) => id)).toEqual(['3124', '3053', '3222', '6655', '3153', '2526']);
    expect(old.items.filter(isBoot)).toHaveLength(0);
    expect(old.spells.map(({ id }) => id)).toEqual(['SummonerDot', 'SummonerHeal']);
    expect(old.skills.map(({ ability }) => ability).join('')).toBe('QWQEWWQEQQWEWREERR');
    expect(old.augments[0].augment.id).toBe('ARAM_TankItOrLeaveIt');
    expect(challengeFromUrl(challengeUrl(old, baseUrl))).toEqual(old);
    expect(generateChallenge(old.config)).toEqual(old);

    const modern = generateChallenge({ ...old.config, generatorVersion: undefined });
    expect(modern.config.generatorVersion).toBe(GENERATOR_VERSION);
    expect(challengeKey(modern)).not.toBe(challengeKey(old));
    expect(new URL(challengeUrl(modern, baseUrl)).searchParams.get('v')).toBe(GENERATOR_VERSION);
  });

  it('reads old favorites and history and keeps the migrated library distinct from current builds', () => {
    const old = challengeFromUrl(oldUrl)!;
    const storedConfig = { ...old.config, generatorVersion: undefined };
    const storage = new Map([
      [`aram-bravery.library.${DATA_VERSION}.1`, JSON.stringify({ favorites: [storedConfig], history: [storedConfig] })],
    ]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    expect(loadLibrary().favorites.map(generateChallenge)).toEqual([old]);
    const current = generateChallenge({ seed: old.config.seed, mode: old.config.mode, championId: old.champion.id });
    rememberChallenge(current);
    expect(loadLibrary().history.map(generateChallenge)).toEqual([current, old]);
    toggleFavorite(old);
    expect(loadLibrary().favorites).toEqual([]);
  });
});
