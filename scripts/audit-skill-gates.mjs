// Usage: node scripts/audit-skill-gates.mjs 16.23.1 16.23
const [dataDragonPatch, clientPatch] = process.argv.slice(2)
if (!dataDragonPatch || !clientPatch) {
  throw new Error('Provide the Data Dragon and CommunityDragon patch numbers.')
}

async function readJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`${url} returned ${response.status}`)
  return response.json()
}

const roster = await readJson(
  `https://ddragon.leagueoflegends.com/cdn/${dataDragonPatch}/data/en_US/champion.json`,
)
const champions = Object.keys(roster.data).sort()

function summarizeSlot(slot) {
  return slot.mRequirements.map((rank) => {
    const requirements = rank.mRequirements ?? []
    const level = requirements.find((entry) => entry.__type === 'CharacterLevelRequirement')?.mLevel ?? 1
    const conditions = requirements.filter((entry) =>
      !['HasSkillPointRequirement', 'CharacterLevelRequirement'].includes(entry.__type),
    )
    return conditions.length ? { level, conditions } : level
  })
}

async function auditChampion(championId) {
  const folder = championId.toLowerCase()
  const data = await readJson(
    `https://raw.communitydragon.org/${clientPatch}/game/data/characters/${folder}/${folder}.bin.json`,
  )
  const root = Object.entries(data).find(([key]) => key.toLowerCase().endsWith('/characterrecords/root'))?.[1]
  if (!root) throw new Error(`Missing CharacterRecords/Root for ${championId}`)
  const overrides = root.SpellLevelUpInfoList?.List
  if (overrides) console.log(championId, JSON.stringify(overrides.map(summarizeSlot)))
}

for (let index = 0; index < champions.length; index += 12) {
  await Promise.all(champions.slice(index, index + 12).map(auditChampion))
}
console.log(`Audited ${champions.length} champions.`)
