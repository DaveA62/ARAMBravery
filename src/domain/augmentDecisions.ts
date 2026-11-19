import { augments, type Augment } from '../data';
import { byId, shuffled } from './random';

export type AugmentOfferCount = 3 | 4;

export interface AugmentDecision {
  augment: Augment;
  priority: number;
  instruction: 'take' | 'reroll';
}

const sortedAugments = [...augments].sort(byId);

export function rankAugments(random: () => number): AugmentDecision[] {
  return shuffled(sortedAugments, random).map((augment, index) => ({
    augment,
    priority: index + 1,
    instruction: random() < 0.5 ? 'take' : 'reroll',
  }));
}

export function recommendAugment(
  decisions: readonly AugmentDecision[],
  offeredIds: readonly string[],
  rerollsRemaining: number,
  offerCount: AugmentOfferCount = 3,
): {
  ranked: AugmentDecision[];
  choice: AugmentDecision | null;
  action: AugmentDecision['instruction'] | null;
} {
  const ids = new Set(offeredIds);
  const ranked = decisions.filter(({ augment }) => ids.has(augment.id))
    .sort((first, second) => first.priority - second.priority);
  const completeOffer = offeredIds.length === offerCount && ids.size === offerCount && ranked.length === offerCount;
  const choice = completeOffer ? ranked[0] : null;
  const action = choice ? (rerollsRemaining > 0 ? choice.instruction : 'take') : null;
  return { ranked, choice, action };
}
