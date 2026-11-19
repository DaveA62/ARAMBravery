import championData from './generated/champions.json';
import itemData from './generated/items.json';
import spellData from './generated/spells.json';
import augmentData from './generated/augments.json';
import manifest from './generated/manifest.json';
import type { Augment, Champion, Item, Spell } from './types';

export type { Ability, Augment, Champion, Item, Spell } from './types';

export const DATA_VERSION: string = manifest.dataDragon;
export const PATCH_LABEL: string = manifest.displayPatch;
export const coverage = manifest.coverage;
export const dataManifest = manifest;
export const champions = championData as Champion[];
export const items = itemData as Item[];
export const spells = spellData as Spell[];
export const augments = augmentData as Augment[];
