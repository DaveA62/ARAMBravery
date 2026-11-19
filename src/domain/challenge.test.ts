import { afterEach, describe, expect, it, vi } from 'vitest';
import { augments, champions, DATA_VERSION, items, spells } from '../data';
import {
  canCombine,
  challengeFromUrl,
  challengeKey,
  challengeUrl,
  championCompatibility,
  eligibleItems,
  eligibleSpells,
  generateChallenge,
  loadLibrary,
  loadPreferences,
  newSeed,
  recommendAugment,
  rememberChallenge,
  rerollChallenge,
  savePreferences,
  toggleFavorite,
  validateItems,
  validateSkills,
  validateSpells,
  type Mode,
} from './index';
import scaling from './scaling.json';

const sharedBase = 'https://example.github.io/ARAMBravery/?from=friend#augments';
const seed = 'TRY–GOLD+MAYHEM ⚡';
const modes: Mode[] = ['little', 'straight'];

function champion(id: string) {
  const match = champions.find((entry) => entry.id === id);
  if (!match) throw new Error(`Missing champion ${id}.`);
  return match;
}

function stubStorage() {
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  });
  return stored;
}

afterEach(() => vi.unstubAllGlobals());

describe('Mayhem challenge legality', () => {
  it('uses the patch roster and full spell pool', () => {
    expect(champions).toHaveLength(173);
    expect(scaling.patch).toBe(DATA_VERSION);
    expect(scaling.missing).toEqual([]);
    expect(Object.keys(scaling.profiles).sort()).toEqual(champions.map(({ id }) => id).sort());
    expect(spells.map(({ name }) => name).sort()).toEqual([
      'Barrier', 'Clarity', 'Cleanse', 'Flash', 'Ghost', 'Heal', 'Ignite', 'Mark',
    ]);
    expect(new Set(spells.map(({ id }) => id)).size).toBe(spells.length);
  });

  it('generates a complete legal challenge for every eligible champion in both modes', () => {
    for (const entry of champions) {
      for (const mode of modes) {
        const challenge = generateChallenge({ seed: 'all-champions', mode, championId: entry.id });
        expect(challenge.champion.id).toBe(entry.id);
        expect(validateItems(entry, challenge.items, mode)).toBe(true);
        expect(validateSpells(entry, challenge.spells)).toBe(true);
        expect(validateSkills(entry.id, challenge.skills)).toBe(true);
      }
    }
  });

  it('filters offensive items by evidence in A Little Bullshit and allows them in Straight Bullshit', () => {
    const aatrox = champion('Aatrox');
    const ahri = champion('Ahri');
    const ezreal = champion('Ezreal');
    expect(championCompatibility(aatrox)).toEqual({ ad: true, ap: false });
    expect(championCompatibility(ahri)).toEqual({ ad: false, ap: true });
    expect(championCompatibility(ezreal)).toEqual({ ad: true, ap: true });
    expect(eligibleItems(aatrox, 'little').some((item) => item.power === 'ap')).toBe(false);
    expect(eligibleItems(ahri, 'little').some((item) => item.power === 'ad')).toBe(false);
    expect(eligibleItems(ezreal, 'little')).toEqual(eligibleItems(ezreal, 'straight'));
    expect(eligibleItems(ahri, 'straight').some((item) => item.power === 'ad')).toBe(true);
    expect(eligibleItems(aatrox, 'straight').some((item) => item.power === 'ap')).toBe(true);
    expect(eligibleItems(ahri, 'little').some((item) => item.power === 'neutral')).toBe(true);
  });

  it('keeps mutually exclusive items from appearing in the same final build', () => {
    const grouped = items.find(({ groups, id }) => groups.some((group) =>
      items.some((other) => other.id !== id && other.groups.includes(group))));
    expect(grouped).toBeDefined();
    const member = grouped!;
    const conflicting = items.find((other) => other.id !== member.id &&
      other.groups.some((group) => member.groups.includes(group)))!;
    expect(canCombine(conflicting, [member])).toBe(false);
    expect(canCombine(member, [member])).toBe(false);
  });

  it('applies shop restrictions even in Straight Bullshit', () => {
    const inventory = eligibleItems(champion('Cassiopeia'), 'straight');
    expect(inventory.some(({ groups }) => groups.includes('boots'))).toBe(false);
    expect(eligibleItems(champion('Ezreal'), 'straight').some(({ id }) => id === '3085')).toBe(true);
    expect(eligibleItems(champion('Darius'), 'straight').some(({ id }) => id === '3085')).toBe(false);
  });

  it('keeps champion-specific spell restrictions active', () => {
    for (const spell of spells) {
      for (const championId of spell.forbiddenChampions ?? []) {
        expect(eligibleSpells(champion(championId))).not.toContain(spell);
      }
    }
    const challenge = generateChallenge({ seed, mode: 'straight' });
    expect(validateSpells(challenge.champion, [challenge.spells[0], challenge.spells[0]])).toBe(false);
  });
});

describe('augment decisions', () => {
  it('assigns a unique deterministic priority and instruction to the whole verified catalog', () => {
    expect(augments).toHaveLength(241);
    expect(augments.map(({ name }) => name)).not.toContain('Snap Back');
    expect(augments.map(({ name }) => name)).not.toContain('Quest: Sneakerhead');
    const challenge = generateChallenge({ seed, mode: 'little' });
    expect(challenge.augments).toEqual(generateChallenge({ seed, mode: 'straight' }).augments);
    const ids = augments.map((augment) => augment.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(challenge.augments.map(({ augment }) => augment.id).sort()).toEqual(ids.sort());
    expect(challenge.augments.map(({ priority }) => priority)).toEqual(augments.map((_, index) => index + 1));
    expect(new Set(challenge.augments.map(({ instruction }) => instruction))).toEqual(new Set(['take', 'reroll']));
  });

  it('ranks offered cards and overrides a reroll instruction after the final reroll', () => {
    const decisions = generateChallenge({ seed, mode: 'little' }).augments;
    const choice = decisions.find(({ instruction, priority }) =>
      instruction === 'reroll' && priority < decisions.length - 2)!;
    const second = decisions[choice.priority];
    const third = decisions[choice.priority + 1];
    const offered = [third.augment.id, choice.augment.id, second.augment.id];
    expect(recommendAugment(decisions, offered, 1)).toEqual({ ranked: [choice, second, third], choice, action: 'reroll' });
    expect(recommendAugment(decisions, offered, 0).action).toBe('take');
    expect(recommendAugment(decisions, offered.slice(0, 2), 1).action).toBeNull();
  });

  it('waits for all four unique Maestro offers and ranks the fourth', () => {
    const decisions = generateChallenge({ seed, mode: 'little' }).augments;
    const choice = decisions.find(({ instruction, priority }) =>
      instruction === 'reroll' && priority <= decisions.length - 3)!;
    const [second, third, fourth] = decisions.slice(choice.priority, choice.priority + 3);
    const offered = [third, choice, second, fourth].map(({ augment }) => augment.id);

    expect(recommendAugment(decisions, offered, 4, 4)).toEqual({
      ranked: [choice, second, third, fourth], choice, action: 'reroll',
    });
    expect(recommendAugment(decisions, offered, 0, 4)).toMatchObject({ choice, action: 'take' });
    expect(recommendAugment(decisions, offered.slice(0, 3), 4, 4).choice).toBeNull();
    expect(recommendAugment(decisions, offered, 4).choice).toBeNull();
    expect(recommendAugment(decisions, [...offered.slice(0, 3), offered[0]], 4, 4).action).toBeNull();
    expect(recommendAugment(decisions, [...offered.slice(0, 3), 'unknown-augment'], 4, 4).action).toBeNull();
  });
});

describe('seeds and component rerolls', () => {
  it('replays the same build including a random champion and component rerolls', () => {
    expect(newSeed()).toMatch(/^[2-9A-Z]{10}$/);
    const initial = generateChallenge({ seed, mode: 'straight' });
    const rerolled = rerollChallenge(rerollChallenge(rerollChallenge(initial,
      { type: 'item', index: 2 }), { type: 'spell', index: 0 }), { type: 'items' });
    expect(generateChallenge(initial.config)).toEqual(initial);
    expect(generateChallenge(rerolled.config)).toEqual(rerolled);
    expect(challengeKey(rerolled)).not.toEqual(challengeKey(initial));
  });

  it('changes only the requested reel and retains legality', () => {
    const initial = generateChallenge({ seed, mode: 'little' });
    const item = rerollChallenge(initial, { type: 'item', index: 2 });
    expect(item.items[2]).not.toEqual(initial.items[2]);
    expect(item.items.filter((_, index) => index !== 2)).toEqual(initial.items.filter((_, index) => index !== 2));
    expect(item.spells).toBe(initial.spells);
    expect(item.skills).toBe(initial.skills);
    expect(item.augments).toBe(initial.augments);
    expect(validateItems(item.champion, item.items, item.config.mode)).toBe(true);

    const spell = rerollChallenge(item, { type: 'spell', index: 1 });
    expect(spell.spells[1]).not.toBe(item.spells[1]);
    expect(spell.spells[0]).toBe(item.spells[0]);
    expect(spell.items).toBe(item.items);
    expect(validateSpells(spell.champion, spell.spells)).toBe(true);
  });

  it('keeps unrelated rerolls from changing future component randomization', () => {
    const initial = generateChallenge({ seed, mode: 'straight' });
    const itemAction = { type: 'item', index: 1 } as const;
    const spellAction = { type: 'spell', index: 0 } as const;
    const one = rerollChallenge(rerollChallenge(initial, spellAction), itemAction);
    const two = rerollChallenge(rerollChallenge(initial, itemAction), spellAction);
    expect(one.items).toEqual(two.items);
    expect(one.spells).toEqual(two.spells);
  });
});

describe('serialized and saved challenges', () => {
  it('round trips an updated seed with manual champion, mode, and mixed rerolls from a Pages URL', () => {
    const initial = generateChallenge({ seed, mode: 'straight', championId: 'Ezreal' });
    const updated = rerollChallenge(rerollChallenge(initial, { type: 'item', index: 5 }), { type: 'spells' });
    const url = new URL(challengeUrl(updated, sharedBase));
    expect(url.pathname).toBe('/ARAMBravery/');
    expect(url.searchParams.get('from')).toBe('friend');
    expect(challengeFromUrl(url)).toEqual(updated);

    url.searchParams.set('v', '999');
    expect(challengeFromUrl(url)).toBeNull();
    url.searchParams.set('v', '1');
    url.searchParams.set('reels', '?');
    expect(challengeFromUrl(url)).toBeNull();
  });

  it('persists recents and favorite configs, deduplicates recents, and restores identical builds', () => {
    stubStorage();
    const challenge = generateChallenge({ seed, mode: 'little' });
    const later = rerollChallenge(challenge, { type: 'items' });

    expect(loadLibrary()).toEqual({ favorites: [], history: [] });
    expect(rememberChallenge(challenge).history).toEqual([challenge.config]);
    rememberChallenge(later);
    rememberChallenge(challenge);
    expect(loadLibrary().history).toEqual([challenge.config, later.config]);

    toggleFavorite(later);
    expect(generateChallenge(loadLibrary().favorites[0])).toEqual(later);
    expect(toggleFavorite(later).favorites).toEqual([]);
  });

  it('persists and restores local playback and compact settings', () => {
    const storage = stubStorage();
    expect(loadPreferences('short').motion).toBe('short');
    const preferences = { ...loadPreferences(), masterVolume: 0.37, effectsVolume: 0.24, muted: true, compact: true, motion: 'short' as const };
    savePreferences(preferences);
    expect(loadPreferences()).toEqual(preferences);
    storage.set([...storage.keys()][0], 'damaged');
    expect(loadPreferences().muted).toBe(false);
  });
});
