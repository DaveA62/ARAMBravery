import { useId, useRef, useState, type ComponentProps } from 'react'
import { Diamond, ListOrdered, Minus, Plus, Search } from 'lucide-react'
import type { AugmentOfferCount, Challenge } from '../domain'
import { AUGMENT_PICK_LEVELS, augmentPosition, augmentPositions, type AugmentPosition } from '../domain/augmentPositions'
import { AugmentPicker } from './AugmentPicker'
import './positions.css'

type Method = 'name' | 'position'
type Props = Pick<ComponentProps<typeof AugmentPicker>, 'challenge' | 'reducedMotion' | 'compact' | 'playSound'>
const preferenceKey = 'mayhem.augment.method.v1'
const ordinals = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth' } as const

function preferredMethod(): Method {
  try {
    return localStorage.getItem(preferenceKey) === 'position' ? 'position' : 'name'
  } catch {
    return 'name'
  }
}

export function AugmentTools(props: Props) {
  const [method, setMethod] = useState(preferredMethod)
  const [offers, setOffers] = useState<AugmentOfferCount>(3)
  const namesId = useId()
  const positionsId = useId()

  function choose(next: Method) {
    setMethod(next)
    try { localStorage.setItem(preferenceKey, next) } catch { /* The picker still works without local storage. */ }
    props.playSound?.('confirm')
  }

  return (
    <div className="augment-tools">
      <div className="augment-tools__bar">
        <div className="augment-tools__modes" role="group" aria-label="Augment method">
          <button type="button" aria-pressed={method === 'name'} aria-controls={namesId} onClick={() => choose('name')}>
            <Search size={15} aria-hidden="true" /> By name
          </button>
          <button type="button" aria-pressed={method === 'position'} aria-controls={positionsId} onClick={() => choose('position')}>
            <ListOrdered size={17} aria-hidden="true" /> By position
          </button>
        </div>
        <label className="augment-tools__count">
          <span>Cards per offer</span>
          <select value={offers} onChange={event => setOffers(event.target.value === '4' ? 4 : 3)}>
            <option value="3">3 cards</option>
            <option value="4">4 cards (Maestro)</option>
          </select>
        </label>
      </div>
      <div id={namesId} hidden={method !== 'name'}>
        <AugmentPicker {...props} offerCount={offers} playSound={method === 'name' ? props.playSound : undefined} />
      </div>
      <div id={positionsId} hidden={method !== 'position'}>
        <PositionPicker key={props.challenge?.config.seed} challenge={props.challenge} offers={offers} compact={props.compact} />
      </div>
    </div>
  )
}

function PositionPicker({ challenge, offers, compact }: { challenge: Challenge | null; offers: AugmentOfferCount; compact?: boolean }) {
  const [bonusCount, setBonusCount] = useState(0)
  const addBonusButton = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const seed = challenge?.config.seed
  const standardPicks = seed ? augmentPositions(seed, offers) : undefined
  const bonusPicks = seed ? Array.from({ length: bonusCount }, (_, index) =>
    augmentPosition(seed, { type: 'bonus', number: index + 1 }, offers)) : []
  const newestBonus = bonusPicks.at(-1)

  return (
    <section className={'augment-picker' + (compact ? ' augment-picker--compact' : '')} aria-labelledby={titleId}>
      <div className="augment-picker__body">
        <header className="augment-picker__header">
          <div className="augment-picker__emblem" aria-hidden="true"><Diamond size={25} /></div>
          <div>
            <h2 id={titleId}>Augment Picker</h2>
            <p>{challenge ? 'Count the cards left to right and take the indicated one.' : 'Roll a build to unlock your augment picks.'}</p>
          </div>
        </header>
        <ol className="augment-position-grid" aria-label="Standard augment picks">
          {AUGMENT_PICK_LEVELS.map(level => (
            <PositionCard key={level} label={'Level ' + level} position={standardPicks?.[level]} offers={offers} />
          ))}
        </ol>
        <div className="augment-position-bonus">
          <div>
            <h3>Bonus picks</h3>
            <p>Add a pick whenever your Headliner gives you another augment round.</p>
          </div>
          <div className="augment-position-bonus__actions">
            {bonusCount > 0 && <button type="button" className="small-button" aria-label="Remove last bonus pick"
              onClick={() => {
                if (bonusCount === 1) addBonusButton.current?.focus()
                setBonusCount(count => Math.max(0, count - 1))
              }}>
              <Minus size={16} aria-hidden="true" /> Remove last
            </button>}
            <button ref={addBonusButton} type="button" className="small-button share-button" disabled={!challenge}
              onClick={() => setBonusCount(count => count + 1)}>
              <Plus size={16} aria-hidden="true" /> Add bonus pick
            </button>
          </div>
        </div>
        <span className="augment-sr-only" role="status">
          {newestBonus && `Bonus ${bonusCount}. Pick the ${ordinals[newestBonus]} card.`}
        </span>
        {bonusPicks.length > 0 && <ol className="augment-position-grid" aria-label="Bonus augment picks">
          {bonusPicks.map((position, index) => (
            <PositionCard key={index} label={'Bonus ' + (index + 1)} position={position} offers={offers} />
          ))}
        </ol>}
      </div>
    </section>
  )
}

function PositionCard({ label, position, offers }: { label: string; position?: AugmentPosition; offers: AugmentOfferCount }) {
  return (
    <li className="augment-position" data-picked={position !== undefined || undefined}>
      <span className="augment-position__label">{label}</span>
      <strong>{position ? 'Pick the ' + ordinals[position] + ' card' : 'Awaiting roll'}</strong>
      <div className="augment-position__slots" aria-hidden="true">
        {Array.from({ length: offers }, (_, index) => (
          <span key={index} data-selected={index + 1 === position || undefined}>{index + 1}</span>
        ))}
      </div>
    </li>
  )
}
