import { items, type Item } from '../data'
import { generateChallenge, validateItems, type Challenge } from '../domain'
import { describeCuration, findGuide } from '../domain/curation'
import type { PartyBuild } from './protocol'

const itemById = new Map(items.map(item => [item.id, item]))

export function withPartyItems(challenge: Challenge, replacements: Item[]): Challenge {
  const { champion, config, curation } = challenge
  const guide = curation?.guideId ? findGuide(champion, config.mode, curation.guideId) : undefined
  return {
    ...challenge,
    items: replacements,
    ...(guide && { curation: describeCuration(champion, config.mode, guide, replacements) }),
  }
}

export function resolvePartyBuild({ config, itemIds }: PartyBuild): Challenge {
  if (!itemIds) return generateChallenge(config)

  // Unique Mayhem records the host's actual purchases. The original seed still
  // determines the champion, spells, skill order, augments, and guide.
  const initial = generateChallenge({ ...config, rerolls: [] })
  const inventory = itemIds.flatMap(id => {
    const item = itemById.get(id)
    return item ? [item] : []
  })
  if (!validateItems(initial.champion, inventory, config.mode)) {
    throw new Error('The party received an invalid item build.')
  }
  return withPartyItems({ ...initial, config }, inventory)
}
