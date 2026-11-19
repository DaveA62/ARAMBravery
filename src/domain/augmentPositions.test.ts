import type { AugmentOfferCount } from './augmentDecisions'
import { describe, expect, it } from 'vitest'
import { generateChallenge, rerollChallenge } from './challenge'
import {
  AUGMENT_PICK_LEVELS, augmentPosition, augmentPositions, type AugmentPickLevel,
} from './augmentPositions'

describe('seeded augment positions', () => {
  it('replays each standard level choice with the same seed and offer count', () => {
    expect(AUGMENT_PICK_LEVELS).toEqual([3, 7, 11, 15])
    expect(augmentPositions('MAYHEM')).toEqual({ 3: 3, 7: 1, 11: 2, 15: 1 })
    expect(augmentPositions('MAYHEM', 4)).toEqual({ 3: 4, 7: 1, 11: 3, 15: 1 })
    expect(augmentPositions('  MAYHEM  ', 4)).toEqual(augmentPositions('MAYHEM', 4))
  })

  it('assigns bonus choices separately and keeps earlier positions unaffected by later queries', () => {
    const firstBonus = { type: 'bonus', number: 1 } as const
    const secondBonus = { type: 'bonus', number: 2 } as const
    const first = augmentPosition('MAYHEM', firstBonus, 4)
    expect(first).toBe(4)
    expect(augmentPosition('MAYHEM', secondBonus, 4)).toBe(1)
    expect(augmentPosition('MAYHEM', { type: 'bonus', number: 7 }, 4)).not.toBe(
      augmentPosition('MAYHEM', { type: 'level', level: 7 }, 4),
    )
    expect(augmentPosition('MAYHEM', firstBonus, 4)).toBe(first)
  })

  it('uses only valid positions and can select every offered spot', () => {
    for (const offers of [3, 4] as const) {
      const positions = new Set<number>()
      for (let index = 0; index < 80; index += 1) {
        const seed = `position-sample-${index}`
        for (const position of Object.values(augmentPositions(seed, offers))) positions.add(position)
        positions.add(augmentPosition(seed, { type: 'bonus', number: 1 }, offers))
      }
      expect([...positions].sort()).toEqual(offers === 3 ? [1, 2, 3] : [1, 2, 3, 4])
    }
  })

  it('preserves the position sheet across item rerolls and leaves existing build generation unchanged', () => {
    const original = generateChallenge({ seed: 'MAYHEM', mode: 'straight', championId: 'Jinx' })
    const before = augmentPositions(original.config.seed)
    const rerolled = rerollChallenge(original, { type: 'item', index: 2 })
    expect(augmentPositions(rerolled.config.seed)).toEqual(before)
    expect(generateChallenge(original.config)).toEqual(original)
    expect(rerolled.augments).toBe(original.augments)
  })

  it('rejects invalid or empty inputs', () => {
    expect(() => augmentPositions(' ')).toThrow('challenge seed')
    expect(() => augmentPositions('MAYHEM', 2 as AugmentOfferCount)).toThrow('three or four')
    expect(() => augmentPosition('MAYHEM', { type: 'level', level: 6 as AugmentPickLevel }, 3)).toThrow('supported augment pick')
    expect(() => augmentPosition('MAYHEM', { type: 'bonus', number: 0 }, 3)).toThrow('supported augment pick')
  })
})
