import type { Item } from '../data'
import type { Challenge } from '../domain'
import { canCombine, eligibleItems, isBoot, ITEM_SLOT_COUNT } from '../domain/itemLegality'
import { seededRandom, shuffled } from '../domain/random'

type Slots = (Item | undefined)[]

interface Participant {
  original: readonly Item[]
  legal: Map<string, Item>
  boots: Item[]
  equipment: Item[]
  guideIds: Set<string>
}

function assignBoots(participants: readonly Participant[]): Slots {
  const current: Slots = []
  const used = new Set<string>()
  let best: { boots: Slots; count: number; retained: number } | undefined

  function visit(index: number, count: number, retained: number) {
    const remaining = participants.length - index
    if (best && (count + remaining < best.count ||
        (count + remaining === best.count && retained + remaining <= best.retained))) return
    if (!remaining) {
      best = { boots: [...current], count, retained }
      return
    }

    const { original, boots } = participants[index]
    const preferred = original.find(isBoot)?.id
    for (const boot of boots) {
      if (used.has(boot.id)) continue
      current[index] = boot
      used.add(boot.id)
      visit(index + 1, count + 1, retained + Number(boot.id === preferred))
      used.delete(boot.id)
    }
    current[index] = undefined
    visit(index + 1, count, retained)
  }

  visit(0, 0, 0)
  return best?.boots ?? []
}

function assigned(slots: Slots): Item[] {
  return slots.filter((item): item is Item => item !== undefined)
}

function reserveOriginalItems(participants: readonly Participant[], slots: Slots[]) {
  const taken = new Set(slots.flatMap(assigned).map(({ id }) => id))
  const claims = participants.flatMap(({ original, legal, guideIds }, player) =>
    original.flatMap(({ id }, slot) => {
      const item = legal.get(id)
      return item && !isBoot(item) && !slots[player][slot]
        ? [{ player, slot, item, curated: guideIds.has(id) }]
        : []
    }))
  // When two participants rolled the same item, prefer preserving a guide's
  // recommendation over preserving a randomly selected item.
  claims.sort((left, right) => Number(right.curated) - Number(left.curated))
  for (const { player, slot, item } of claims) {
    if (taken.has(item.id) || !canCombine(item, assigned(slots[player]))) continue
    slots[player][slot] = item
    taken.add(item.id)
  }
}

function fillSlots(participants: readonly Participant[], slots: Slots[]): Item[][] | null {
  const taken = new Set(slots.flatMap(assigned).map(({ id }) => id))

  function fill(): boolean {
    let next: { player: number; slot: number; candidates: Item[] } | undefined
    const availableIds = new Set<string>()
    let emptySlots = 0
    for (const [player, row] of slots.entries()) {
      const occupied = assigned(row)
      if (occupied.length === ITEM_SLOT_COUNT) continue
      const vacancies = ITEM_SLOT_COUNT - occupied.length
      const candidates = participants[player].equipment.filter(item =>
        !taken.has(item.id) && canCombine(item, occupied))
      if (candidates.length < vacancies) return false
      emptySlots += vacancies
      for (const { id } of candidates) availableIds.add(id)
      if (!next || candidates.length < next.candidates.length) {
        next = { player, slot: row.indexOf(undefined), candidates }
      }
    }

    if (!next) return true
    if (availableIds.size < emptySlots) return false
    const { player, slot, candidates } = next
    const preferredId = participants[player].original[slot]?.id
    const preference = candidates.findIndex(item => item.id === preferredId)
    if (preference > 0) candidates.unshift(...candidates.splice(preference, 1))
    for (const item of candidates) {
      slots[player][slot] = item
      taken.add(item.id)
      if (fill()) return true
      taken.delete(item.id)
      slots[player][slot] = undefined
    }
    return false
  }

  return fill() ? slots.map(assigned) : null
}

/** Allocate one copy of each item ID across the round, preserving input order. */
export function allocateUniqueItems(builds: readonly Challenge[]): Item[][] | null {
  const participants: Participant[] = builds.map(({ champion, config, items, curation }, player) => {
    const random = seededRandom(JSON.stringify(['unique-mayhem', config.seed, champion.id, player]))
    const options = shuffled(eligibleItems(champion, config.mode), random)
    const preferredBoot = items.find(isBoot)?.id
    const boots = options.filter(isBoot)
    boots.sort((left, right) => Number(right.id === preferredBoot) - Number(left.id === preferredBoot))
    return {
      original: items,
      legal: new Map(options.map(item => [item.id, item])),
      boots,
      equipment: options.filter(item => !isBoot(item)),
      guideIds: new Set(curation?.status === 'applied' ? curation.itemIds : []),
    }
  })

  const boots = assignBoots(participants)
  const bootSlots: Slots[] = participants.map(({ original }, player) => {
    const slots = Array<Item | undefined>(ITEM_SLOT_COUNT).fill(undefined)
    const originalSlot = original.findIndex(isBoot)
    slots[originalSlot < 0 ? ITEM_SLOT_COUNT - 1 : originalSlot] = boots[player]
    return slots
  })
  const preferredSlots = bootSlots.map(slots => [...slots])
  reserveOriginalItems(participants, preferredSlots)
  // Release the preferred placements if a narrow pool needs a different
  // combination. Keep the maximum boot coverage chosen independently.
  return fillSlots(participants, preferredSlots) ?? fillSlots(participants, bootSlots)
}
