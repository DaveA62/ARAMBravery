export type Ability = 'Q' | 'W' | 'E' | 'R'

export interface SkillStep {
  level: number
  ability: Ability | null
  rank: number
  automatic?: Ability[]
}

type AbilityRanks = Record<Ability, number>
type LevelGates = Readonly<Record<Ability, readonly number[]>>

export interface SkillRules {
  gates: LevelGates
  first?: Ability
  innateRanks?: Readonly<Partial<AbilityRanks>>
  automatic?: Readonly<Record<number, readonly Ability[]>>
  requires?: Readonly<Partial<Record<Ability, readonly Ability[]>>>
  note?: string
}

export const MAYHEM_START_LEVEL = 3
export const MAYHEM_BASE_LEVEL_CAP = 18

const abilities: readonly Ability[] = ['Q', 'W', 'E', 'R']
const basic = [1, 3, 5, 7, 9]
const sixRanks = [...basic, 11]
const ultimate = [6, 11, 16]
const delayedBasic = [2, 3, 5, 7, 9]
const standard: LevelGates = { Q: basic, W: basic, E: basic, R: ultimate }

const startingUlt: SkillRules = {
  gates: { ...standard, R: [1, ...ultimate] },
  innateRanks: { R: 1 },
  automatic: { 1: ['R'] },
  note: 'R is already unlocked at spawn. Its next ranks open at levels 6, 11, and 16.',
}

const apheliosStats = [1, 1, 3, 5, 7, 9]
const championRules: Readonly<Record<string, SkillRules>> = {
  Aphelios: {
    gates: { Q: apheliosStats, W: apheliosStats, E: apheliosStats, R: [] },
    automatic: { 1: ['W'], 2: ['Q'], 6: ['R'], 11: ['R'], 16: ['R'] },
    note: 'Spend points on Q Attack Damage, W Attack Speed, and E Lethality. Weapon skills and R unlock automatically.',
  },
  Azir: {
    gates: { ...standard, Q: delayedBasic, E: delayedBasic },
    first: 'W',
    note: 'Your first point is already spent on W at spawn.',
  },
  Elise: startingUlt,
  Hwei: {
    gates: standard,
    note: 'Close the active spell subject before spending a skill point.',
  },
  Jayce: {
    gates: { Q: sixRanks, W: sixRanks, E: sixRanks, R: [] },
    automatic: { 1: ['R'] },
    note: 'Transform is available at spawn. Q, W, and E can reach rank 6.',
  },
  Karma: startingUlt,
  Nidalee: startingUlt,
  Shen: {
    gates: { ...standard, W: delayedBasic },
    requires: { W: ['Q'] },
  },
  Udyr: {
    gates: { Q: sixRanks, W: sixRanks, E: sixRanks, R: sixRanks },
    note: 'All four stances can reach rank 6. R follows basic skill timing.',
  },
  Viego: {
    gates: standard,
    note: 'Spend points in Viego’s own form after a possession ends.',
  },
  Viktor: {
    gates: standard,
    note: 'Spend any pending Glorious Evolution upgrade before assigning a skill point.',
  },
  Xayah: {
    gates: { ...standard, E: delayedBasic },
    requires: { E: ['Q', 'W'] },
  },
  Yuumi: {
    gates: { ...standard, Q: sixRanks, W: delayedBasic },
    innateRanks: { W: 1 },
    automatic: { 1: ['W'] },
    note: 'W starts at rank 1 for free. Q can reach rank 6.',
  },
  Zeri: {
    gates: { ...standard, W: delayedBasic, E: delayedBasic },
    first: 'Q',
    note: 'Your first point is already spent on Q at spawn.',
  },
  Zilean: {
    gates: { ...standard, W: delayedBasic },
    requires: { W: ['Q', 'E'] },
  },
  Zyra: {
    gates: { ...standard, W: delayedBasic },
    requires: { W: ['Q', 'E'] },
  },
}

export function abilityRules(championId: string): SkillRules {
  return Object.hasOwn(championRules, championId) ? championRules[championId] : { gates: standard }
}

export function skillNote(championId: string): string | undefined {
  return abilityRules(championId).note
}

function initialRanks(rules: SkillRules): AbilityRanks {
  return { Q: 0, W: 0, E: 0, R: 0, ...rules.innateRanks }
}

function nextAbilities(rules: SkillRules, ranks: AbilityRanks, level: number): Ability[] {
  if (level === 1 && rules.first) return [rules.first]
  const reachedLevel = Math.max(MAYHEM_START_LEVEL, level)
  return abilities.filter((ability) => {
    const requiredLevel = rules.gates[ability][ranks[ability]]
    const prerequisite = rules.requires?.[ability]
    if (requiredLevel === undefined || requiredLevel > reachedLevel) return false
    return !prerequisite || prerequisite.some((key) => ranks[key] > 0)
  })
}

function automaticAt(rules: SkillRules, level: number): readonly Ability[] {
  if (level === 1 && rules.first) return [rules.first]
  return rules.automatic?.[level] ?? []
}

export function generateSkills(championId: string, rng: () => number): SkillStep[] {
  const rules = abilityRules(championId)
  const ranks = initialRanks(rules)
  return Array.from({ length: MAYHEM_BASE_LEVEL_CAP }, (_, index) => {
    const level = index + 1
    const options = nextAbilities(rules, ranks, level)
    const ability = options[Math.floor(rng() * options.length)] ?? null
    const rank = ability ? ++ranks[ability] : 0
    const automatic = automaticAt(rules, level)
    return automatic.length ? { level, ability, rank, automatic: [...automatic] } : { level, ability, rank }
  })
}

export function validateSkills(championId: string, steps: readonly SkillStep[]): boolean {
  if (steps.length !== MAYHEM_BASE_LEVEL_CAP) return false
  const rules = abilityRules(championId)
  const ranks = initialRanks(rules)
  return steps.every((step, index) => {
    const level = index + 1
    const options = nextAbilities(rules, ranks, level)
    const automatic = automaticAt(rules, level)
    const recorded = step.automatic ?? []
    if (step.level !== level || recorded.length !== automatic.length || !automatic.every((ability, i) => ability === recorded[i])) return false
    if (step.ability === null) return options.length === 0 && step.rank === 0
    if (!options.includes(step.ability)) return false
    return step.rank === ++ranks[step.ability]
  })
}
