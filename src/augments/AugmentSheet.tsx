import { ChevronDown, List, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Augment } from '../data'
import type { AugmentDecision } from '../domain'
import { AugmentIcon, matchesAugment } from './presentation'

const tierOrder: Record<Augment['tier'], number> = { Silver: 1, Gold: 2, Prismatic: 3 }

export function AugmentSheet({ decisions }: { decisions: readonly AugmentDecision[] }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [tier, setTier] = useState('all')
  const [instruction, setInstruction] = useState('all')
  const [sort, setSort] = useState('priority')
  const filtered = useMemo(() => {
    if (!open) return []
    const rows = decisions.filter(row =>
      (tier === 'all' || row.augment.tier === tier)
      && (instruction === 'all' || row.instruction === instruction)
      && matchesAugment(row.augment, query),
    )
    return rows.sort((first, second) => {
      if (sort === 'name') return first.augment.name.localeCompare(second.augment.name)
      if (sort === 'tier') return tierOrder[first.augment.tier] - tierOrder[second.augment.tier] || first.priority - second.priority
      return first.priority - second.priority
    })
  }, [decisions, instruction, open, query, sort, tier])

  return (
    <details className="augment-sheet" onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>
        <List size={17} aria-hidden="true" />
        <span>Augment reference sheet</span>
        {decisions.length > 0 && <span className="augment-sheet__count">{decisions.length} ranked</span>}
        <ChevronDown className="augment-sheet__chevron" size={18} aria-hidden="true" />
      </summary>
      {open && (decisions.length ? (
        <div className="augment-sheet__body">
          <div className="augment-sheet__filters">
            <label className="augment-field augment-field--search">
              <Search size={15} aria-hidden="true" />
              <input type="search" placeholder="Find an augment" aria-label="Find an augment in the reference sheet"
                value={query} onChange={event => setQuery(event.target.value)} />
            </label>
            <label>
              <span className="augment-sheet__filter-label">Tier</span>
              <select aria-label="Filter by tier" value={tier} onChange={event => setTier(event.target.value)}>
                <option value="all">All tiers</option>
                <option value="Silver">Silver</option>
                <option value="Gold">Gold</option>
                <option value="Prismatic">Prismatic</option>
              </select>
              <ChevronDown className="augment-sheet__select-chevron" size={14} aria-hidden="true" />
            </label>
            <label>
              <span className="augment-sheet__filter-label">Instruction</span>
              <select aria-label="Filter by instruction" value={instruction} onChange={event => setInstruction(event.target.value)}>
                <option value="all">All instructions</option>
                <option value="take">Take it</option>
                <option value="reroll">Reroll first</option>
              </select>
              <ChevronDown className="augment-sheet__select-chevron" size={14} aria-hidden="true" />
            </label>
            <label>
              <span className="augment-sheet__filter-label">Sort by</span>
              <select aria-label="Sort by" value={sort} onChange={event => setSort(event.target.value)}>
                <option value="priority">Priority</option>
                <option value="name">Name</option>
                <option value="tier">Tier</option>
              </select>
              <ChevronDown className="augment-sheet__select-chevron" size={14} aria-hidden="true" />
            </label>
          </div>
          <p className="augment-sheet__results" role="status">{filtered.length} of {decisions.length} augments</p>
          {filtered.length > 0 ? (
            <div className="augment-sheet__table-container" role="region" aria-label="Augment reference results" tabIndex={0}>
              <table>
                <thead>
                  <tr><th scope="col">Augment</th><th scope="col">Tier</th><th scope="col">Priority</th><th scope="col">Instruction</th></tr>
                </thead>
                <tbody>
                  {filtered.map(row => (
                    <tr key={row.augment.id}>
                      <th scope="row">
                        <span className="augment-sheet__name" title={row.augment.description}>
                          <AugmentIcon augment={row.augment} />
                          <span>
                            {row.augment.name}
                            {row.augment.availability === 'unconfirmed' && <span className="augment-unconfirmed">Unconfirmed</span>}
                          </span>
                        </span>
                      </th>
                      <td className="augment-rarity" data-tier={row.augment.tier.toLowerCase()}>{row.augment.tier}</td>
                      <td className="augment-sheet__priority">#{row.priority}</td>
                      <td><span className="augment-sheet__instruction" data-instruction={row.instruction}>
                        {row.instruction === 'take' ? 'Take it' : 'Reroll first'}
                      </span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="augment-empty">No augments match these filters.</p>}
        </div>
      ) : <p className="augment-empty">Your roll will assign an instruction and priority to each augment.</p>)}
    </details>
  )
}
