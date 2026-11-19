import { describe, expect, it } from 'vitest'
import { champions } from '../data'
import {
  generateSkills,
  MAYHEM_BASE_LEVEL_CAP,
  MAYHEM_START_LEVEL,
  validateSkills,
  type Ability,
} from './skills'

function rng(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0
    return state / 4294967296
  }
}

describe('Mayhem skill progression', () => {
  it('spends every baseline point across the patch roster', () => {
    for (const { id } of champions) {
      for (let seed = 0; seed < 12; seed++) {
        const steps = generateSkills(id, rng(seed))
        expect(steps.length, id).toBe(MAYHEM_BASE_LEVEL_CAP)
        expect(steps.every((step) => step.ability !== null), id).toBe(true)
        expect(validateSkills(id, steps), id).toBe(true)
      }
    }
  })

  it('applies the level-three gates to all three spawn points', () => {
    const steps = generateSkills('Ahri', () => 0)
    expect(MAYHEM_START_LEVEL).toBe(3)
    expect(steps.slice(0, 3).map(({ ability, rank }) => [ability, rank])).toEqual([['Q', 1], ['Q', 2], ['W', 1]])
    expect(steps.filter(({ ability }) => ability === 'R').map(({ level }) => level)).toEqual([16, 17, 18])
    expect(validateSkills('Ahri', [{ ...steps[0], ability: 'R' }, ...steps.slice(1)])).toBe(false)
    expect(validateSkills('Ahri', [{ ...steps[0], rank: 3 }, ...steps.slice(1)])).toBe(false)
  })

  it.each([['Azir', 'W'], ['Zeri', 'Q']] as const)('uses %s’s forced first point', (id, key) => {
    const steps = generateSkills(id, () => 0.95)
    expect(steps[0]).toEqual({ level: 1, ability: key, rank: 1, automatic: [key] })
    expect(validateSkills(id, [{ ...steps[0], automatic: [] }, ...steps.slice(1)])).toBe(false)
  })

  it.each(['Elise', 'Karma', 'Nidalee'])('models %s’s free R and three purchasable ranks', (id) => {
    const steps = generateSkills(id, () => 0.95)
    expect(steps[0].automatic).toEqual(['R'])
    expect(steps.filter(({ ability }) => ability === 'R').map(({ level, rank }) => [level, rank]))
      .toEqual([[6, 2], [11, 3], [16, 4]])
  })

  it('models Jayce’s free transform and Udyr’s freely rankable fourth stance', () => {
    const jayce = generateSkills('Jayce', () => 0.95)
    expect(jayce[0].automatic).toEqual(['R'])
    expect(jayce.some(({ ability }) => ability === 'R')).toBe(false)
    expect(jayce.filter(({ rank }) => rank === 6)).toHaveLength(3)
    const udyr = generateSkills('Udyr', () => 0.95)
    expect(udyr[0].ability).toBe('R')
    expect(udyr.filter(({ ability }) => ability === 'R').map(({ level }) => level)).toEqual([1, 2, 5, 7, 9, 11])
  })

  it('models Aphelios’s stat allocations and automatic ultimate ranks', () => {
    const steps = generateSkills('Aphelios', () => 0)
    expect(steps.some(({ ability }) => ability === 'R')).toBe(false)
    expect(steps.filter(({ ability }) => ability === 'Q').map(({ level }) => level)).toEqual([1, 2, 3, 5, 7, 9])
    expect(steps.filter(({ automatic }) => automatic?.includes('R')).map(({ level }) => level)).toEqual([6, 11, 16])
  })

  it('models Yuumi’s free W and ability rank caps', () => {
    const steps = generateSkills('Yuumi', () => 0)
    const caps = (['Q', 'W', 'E', 'R'] as Ability[]).map((ability) =>
      Math.max(...steps.filter((step) => step.ability === ability).map(({ rank }) => rank)),
    )
    expect(steps[0].automatic).toEqual(['W'])
    expect(caps).toEqual([6, 5, 5, 3])
  })

  it.each([['Shen', 'W'], ['Zilean', 'W'], ['Zyra', 'W'], ['Xayah', 'E']] as const)(
    'keeps an enabling ability ahead of %s’s %s',
    (id, key) => {
      const steps = generateSkills(id, () => 0.95)
      expect(steps[0].ability).not.toBe(key)
      expect(validateSkills(id, [{ ...steps[0], ability: key }, ...steps.slice(1)])).toBe(false)
    },
  )
})
