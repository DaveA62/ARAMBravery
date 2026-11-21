import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateChallenge, type Challenge } from '../domain'
import { eligibleItems, isBoot, validateItems } from '../domain/itemLegality'
import { allocateUniqueItems } from './uniqueItems'

vi.mock('../domain/itemLegality', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../domain/itemLegality')>()
  return { ...actual, eligibleItems: vi.fn(actual.eligibleItems) }
})

const real = await vi.importActual<typeof import('../domain/itemLegality')>('../domain/itemLegality')
const mockedEligibleItems = vi.mocked(eligibleItems)

afterEach(() => mockedEligibleItems.mockImplementation(real.eligibleItems))

function challenge(championId: string, seed = 'SAME-ROLL', mode: Challenge['config']['mode'] = 'little') {
  return generateChallenge({ championId, mode, seed })
}

describe('Unique Mayhem item allocation', () => {
  it('deterministically allocates 30 legal items even when five players roll identical builds', () => {
    const same = challenge('Jinx')
    const builds = Array<Challenge>(5).fill(same)
    const allocated = allocateUniqueItems(builds)!
    expect(allocated).not.toBeNull()
    expect(allocated.map(items => items.length)).toEqual([6, 6, 6, 6, 6])
    expect(new Set(allocated.flat().map(({ id }) => id)).size).toBe(30)
    expect(allocateUniqueItems(builds)).toEqual(allocated)
    expect(allocated.every(items => validateItems(same.champion, items, same.config.mode))).toBe(true)
    expect(allocated.every(items => items.filter(isBoot).length === 1)).toBe(true)
    for (const [slot, item] of same.items.entries()) {
      expect(allocated.filter(items => items[slot].id === item.id)).toHaveLength(1)
    }
  })

  it('covers everyone who can buy boots and leaves Cassiopeia with six compatible non-boots', () => {
    const builds = ['Cassiopeia', 'Azir', 'Ezreal', 'Garen', 'MasterYi']
      .map(championId => challenge(championId))
    const allocated = allocateUniqueItems(builds)!
    expect(allocated).not.toBeNull()
    expect(allocated.map(items => items.filter(isBoot).length)).toEqual([0, 1, 1, 1, 1])
    expect(allocated.every((items, index) => validateItems(builds[index].champion, items, 'little'))).toBe(true)
    expect(new Set(allocated.flat().map(({ id }) => id)).size).toBe(30)
  })

  it('maximizes boot coverage when legal boot choices overlap or a boot is scarce', () => {
    const builds = [challenge('Jinx', 'FIRST'), challenge('Garen', 'SECOND'), challenge('Vayne', 'THIRD')]
    const oneOption: Record<string, string[]> = {
      Jinx: ['3006', '3009'],
      Garen: ['3006'],
      Vayne: ['3006'],
    }
    mockedEligibleItems.mockImplementation((champion, mode) =>
      real.eligibleItems(champion, mode).filter(item => !isBoot(item) || oneOption[champion.id].includes(item.id)))
    const allocated = allocateUniqueItems(builds)!
    expect(allocated).not.toBeNull()
    expect(allocated[0].find(isBoot)?.id).toBe('3009')
    expect(allocated.slice(1).flat().filter(isBoot).map(({ id }) => id)).toEqual(['3006'])
    expect(new Set(allocated.flat().map(({ id }) => id)).size).toBe(18)
    expect(allocated.every(items => items.length === 6)).toBe(true)
  })

  it('returns null when a six-item allocation is impossible', () => {
    const same = challenge('Jinx')
    mockedEligibleItems.mockImplementation(() => same.items)
    expect(allocateUniqueItems([same, same])).toBeNull()
  })
})
