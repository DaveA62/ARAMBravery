import type { AugmentOfferCount } from './augmentDecisions'
import { seededRandom } from './random'

export const AUGMENT_PICK_LEVELS = [3, 7, 11, 15] as const
export type AugmentPickLevel = typeof AUGMENT_PICK_LEVELS[number]
export type AugmentPick = { type: 'level'; level: AugmentPickLevel } | { type: 'bonus'; number: number }
export type AugmentPosition = 1 | 2 | 3 | 4

export function augmentPosition(seed: string, pick: AugmentPick, offers: AugmentOfferCount): AugmentPosition {
  const normalizedSeed = seed.trim()
  if (!normalizedSeed) throw new Error('Choose a challenge seed before assigning an augment position.')
  if (offers !== 3 && offers !== 4) throw new Error('Choose three or four augment offers.')

  const pickNumber = pick.type === 'level' ? pick.level : pick.number
  const validPick = pick.type === 'level'
    ? AUGMENT_PICK_LEVELS.includes(pick.level)
    : Number.isSafeInteger(pickNumber) && pickNumber >= 1
  if (!validPick) throw new Error('Choose a supported augment pick.')

  // Each pick has its own stream, independent of build generation and rerolls.
  // A different offer count maps the same draw to the available positions.
  const random = seededRandom(JSON.stringify(['augment-position/v1', normalizedSeed, pick.type, pickNumber]))
  return (Math.floor(random() * offers) + 1) as AugmentPosition
}

export function augmentPositions(
  seed: string,
  offers: AugmentOfferCount = 3,
): Record<AugmentPickLevel, AugmentPosition> {
  return {
    3: augmentPosition(seed, { type: 'level', level: 3 }, offers),
    7: augmentPosition(seed, { type: 'level', level: 7 }, offers),
    11: augmentPosition(seed, { type: 'level', level: 11 }, offers),
    15: augmentPosition(seed, { type: 'level', level: 15 }, offers),
  }
}
