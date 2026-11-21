import { items } from '../data'
import { generateChallenge, validateItems, type Challenge } from '../domain'
import type { PartyBuild } from './protocol'

const itemById = new Map(items.map(item => [item.id, item]))

export function resolvePartyBuild({ config, itemIds }: PartyBuild): Challenge {
  if (!itemIds) return generateChallenge(config)

  // Unique Mayhem records the host's actual purchases. The original seed still
  // determines the champion, spells, skill order, and augments.
  const initial = generateChallenge({ ...config, rerolls: [] })
  const inventory = itemIds.flatMap(id => {
    const item = itemById.get(id)
    return item ? [item] : []
  })
  if (!validateItems(initial.champion, inventory, config.mode)) {
    throw new Error('The party received an invalid item build.')
  }
  return { ...initial, config, items: inventory }
}
