import { AnimatePresence, motion } from 'motion/react'
import { Check, Diamond, Minus, Plus, RotateCw, Search, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { augments, coverage } from '../data'
import { recommendAugment } from '../domain'
import type { AugmentOfferCount, Challenge } from '../domain'
import { AugmentSheet } from './AugmentSheet'
import { AugmentIcon, matchesAugment } from './presentation'
import './augments.css'

type PickerSound = 'augmentFlip' | 'augmentTake' | 'augmentReroll' | 'confirm'
type Props = {
  challenge: Challenge | null
  reducedMotion?: boolean
  compact?: boolean
  offerCount?: AugmentOfferCount
  playSound?: (event: PickerSound) => void
}

const rankingNames = ['First', 'Second', 'Third', 'Fourth']
const catalogById = new Map(augments.map(augment => [augment.id, augment]))
const searchCatalog = [...augments].sort((first, second) => first.name.localeCompare(second.name))

export function AugmentPicker({ challenge, reducedMotion = false, compact = false, offerCount = 3, playSound }: Props) {
  const [selected, setSelected] = useState<(string | null)[]>([])
  const [activeSlot, setActiveSlot] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [rerollOverride, setRerollOverride] = useState<number | null>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const slotButtons = useRef<(HTMLButtonElement | null)[]>([])
  const resultsRef = useRef<HTMLDivElement>(null)
  const lastSound = useRef('')
  const pickerId = useId()
  const visibleOffers = useMemo(() => Array.from({ length: offerCount }, (_, index) => selected[index] ?? null), [offerCount, selected])
  const rerolls = Math.min(offerCount, rerollOverride ?? offerCount)
  const chosenIds = visibleOffers.filter((id): id is string => id !== null)
  const decision = recommendAugment(challenge?.augments ?? [], chosenIds, rerolls, offerCount)
  const { action, choice } = decision
  const ranked = choice ? decision.ranked : []
  const searchOpen = activeSlot !== null && activeSlot < offerCount && challenge !== null
  const results = useMemo(() => {
    if (!searchOpen) return []
    const excluded = new Set(visibleOffers.filter((_, index) => index !== activeSlot))
    return searchCatalog.filter(augment => !excluded.has(augment.id) && matchesAugment(augment, query))
  }, [activeSlot, query, searchOpen, visibleOffers])

  const soundKey = action ? JSON.stringify([challenge?.config.seed, action, chosenIds]) : ''
  useEffect(() => {
    if (activeSlot !== null && activeSlot >= offerCount) {
      setActiveSlot(null)
      setQuery('')
    }
  }, [activeSlot, offerCount])

  useEffect(() => {
    if (searchOpen) searchInput.current?.focus()
  }, [activeSlot, searchOpen])

  useEffect(() => {
    if (action && lastSound.current !== soundKey) playSound?.(action === 'take' ? 'augmentTake' : 'augmentReroll')
    lastSound.current = soundKey
  }, [action, playSound, soundKey])

  function openOffer(index: number) {
    setQuery('')
    setActiveSlot(index)
    playSound?.('augmentFlip')
  }

  function closeOffer() {
    setActiveSlot(null)
    if (activeSlot !== null) slotButtons.current[activeSlot]?.focus()
  }

  function selectOffer(id: string) {
    if (activeSlot === null) return
    const updated = visibleOffers.map((current, index) => index === activeSlot ? id : current)
    const nextEmpty = updated.findIndex(current => current === null)
    setSelected(updated)
    setQuery('')
    setActiveSlot(nextEmpty === -1 ? null : nextEmpty)
    playSound?.('augmentFlip')
    if (nextEmpty === -1) slotButtons.current[activeSlot]?.focus()
  }

  function removeOffer(index: number) {
    setSelected(previous => previous.map((current, slot) => index === slot ? null : current))
    slotButtons.current[index]?.focus()
  }

  function resetOffers() {
    setSelected([])
    setQuery('')
    setRerollOverride(null)
    setActiveSlot(null)
    slotButtons.current[0]?.focus()
    playSound?.('confirm')
  }

  function changeRerolls(amount: number) {
    setRerollOverride(previous => {
      const remaining = Math.min(offerCount, previous ?? offerCount)
      const updated = Math.min(offerCount, Math.max(0, remaining + amount))
      return updated === offerCount ? null : updated
    })
    playSound?.('confirm')
  }

  function handleSearchKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Enter' && results.length) {
      event.preventDefault()
      selectOffer(results[0].id)
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      resultsRef.current?.querySelector('button')?.focus()
    }
  }

  return (
    <section className={`augment-picker${compact ? ' augment-picker--compact' : ''}`} aria-labelledby={`${pickerId}-title`} data-reduced-motion={reducedMotion || undefined} data-ready={Boolean(challenge) || undefined}>
      <div className="augment-picker__body">
        <header className="augment-picker__header">
          <div className="augment-picker__emblem" aria-hidden="true"><Diamond size={25} /></div>
          <div>
            <h2 id={`${pickerId}-title`}>Augment Picker</h2>
            <p>{challenge ? `Enter the ${offerCount} augments offered in your match.` : 'Roll a build to unlock your augment decisions.'}</p>
          </div>
          {chosenIds.length > 0 && (
            <button className="augment-reset" type="button" onClick={resetOffers} aria-label={`Clear offers and restore ${offerCount} rerolls`}>
              <RotateCw size={13} aria-hidden="true" /> <span>Clear offers</span>
            </button>
          )}
        </header>

        <span className="augment-sr-only" role="status">{challenge && 'Augment decisions are ready.'}</span>
        {!coverage.augments && <p className="augment-empty augment-coverage">Live patch verification is incomplete. Unconfirmed offers are marked.</p>}

        <div className="augment-picker__workspace">
          <div className="augment-picker__offers">
            <div className="augment-picker__slots" data-count={offerCount}>
              {visibleOffers.map((id, index) => {
                const augment = id === null ? undefined : catalogById.get(id)
                const rank = ranked.findIndex(entry => entry.augment.id === id)
                const selectedRank = rank >= 0 ? ranked[rank] : null
                return (
                  <div className="augment-offer" key={index} data-rank={rank >= 0 ? rank + 1 : undefined}>
                    <button
                      ref={element => { slotButtons.current[index] = element }}
                      type="button"
                      className="augment-offer__button"
                      data-selected={activeSlot === index || undefined}
                      aria-label={augment ? `Replace offer ${index + 1}, ${augment.name}` : `Select offer ${index + 1}`}
                      aria-expanded={searchOpen && activeSlot === index}
                      aria-controls={searchOpen ? `${pickerId}-search` : undefined}
                      aria-describedby={selectedRank ? `${pickerId}-rank-${index}` : undefined}
                      disabled={!challenge}
                      onClick={() => activeSlot === index ? closeOffer() : openOffer(index)}
                    >
                      {augment ? (
                        <motion.span className="augment-offer__selection" key={augment.id}
                          initial={reducedMotion ? false : { opacity: 0, y: 9, rotateX: -27 }}
                          animate={{ opacity: 1, y: 0, rotateX: 0 }}
                          transition={{ duration: reducedMotion ? 0 : 0.19 }}>
                          <AugmentIcon augment={augment} />
                          <strong>{augment.name}</strong>
                          <span className="augment-offer__rarity" data-tier={augment.tier.toLowerCase()}>{augment.tier}</span>
                          {augment.availability === 'unconfirmed' && <span className="augment-unconfirmed">Unconfirmed</span>}
                        </motion.span>
                      ) : (
                        <>
                          <span className="augment-offer__placeholder" aria-hidden="true"><Plus size={22} strokeWidth={1.35} /></span>
                          <span>Offer {index + 1}</span>
                        </>
                      )}
                      {selectedRank && (
                        <motion.span key={`${rank}-${id}`} id={`${pickerId}-rank-${index}`} className="augment-offer__rank"
                          initial={reducedMotion ? false : { opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: reducedMotion ? 0 : 0.2, delay: reducedMotion ? 0 : rank * 0.05 }}>
                          {rankingNames[rank]} <span>#{selectedRank.priority}</span>
                        </motion.span>
                      )}
                    </button>
                    {augment && (
                      <button className="augment-offer__remove" type="button" aria-label={`Remove ${augment.name}`}
                        onClick={() => removeOffer(index)}>
                        <X size={13} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            {searchOpen && (
              <div className="augment-search" id={`${pickerId}-search`} onKeyDown={event => {
                if (event.key === 'Escape') {
                  event.stopPropagation()
                  closeOffer()
                }
              }}>
                <div className="augment-search__header">
                  <label className="augment-field augment-field--search">
                    <Search size={16} aria-hidden="true" />
                    <input ref={searchInput} type="search" placeholder={`Search for offer ${activeSlot + 1}`}
                      aria-label={`Search augments for offer ${activeSlot + 1}`}
                      value={query} onChange={event => setQuery(event.target.value)} onKeyDown={handleSearchKeys} />
                  </label>
                  <button type="button" className="augment-square" aria-label="Close augment search" onClick={closeOffer}>
                    <X size={17} aria-hidden="true" />
                  </button>
                </div>
                <div className="augment-search__results" ref={resultsRef}>
                  {results.map(augment => (
                    <button type="button" className="augment-search__result" key={augment.id} onClick={() => selectOffer(augment.id)}
                      title={augment.description}>
                      <AugmentIcon augment={augment} />
                      <span>{augment.name}</span>
                      <span className="augment-search__metadata">
                        <span className="augment-rarity" data-tier={augment.tier.toLowerCase()}>{augment.tier}</span>
                        {augment.availability === 'unconfirmed' && <span className="augment-unconfirmed">Unconfirmed</span>}
                      </span>
                    </button>
                  ))}
                  {results.length === 0 && <p className="augment-empty" role="status">No matching augments.</p>}
                </div>
              </div>
            )}

            <div className="augment-rerolls">
              <span id={`${pickerId}-rerolls`}>Rerolls remaining</span>
              <div className="augment-stepper" role="group" aria-labelledby={`${pickerId}-rerolls`}>
                <button type="button" aria-label="Decrease rerolls remaining" disabled={rerolls === 0 || !challenge}
                  onClick={() => changeRerolls(-1)}><Minus size={14} aria-hidden="true" /></button>
                <output aria-live="polite">{rerolls}</output>
                <button type="button" aria-label="Increase rerolls remaining" disabled={rerolls === offerCount || !challenge}
                  onClick={() => changeRerolls(1)}><Plus size={14} aria-hidden="true" /></button>
              </div>
            </div>
          </div>

          <div className="augment-recommendation" data-action={action ?? 'waiting'} aria-live="polite" aria-atomic="true">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div className="augment-recommendation__content" key={action ? `${action}-${choice?.augment.id}` : 'waiting'}
                initial={reducedMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reducedMotion ? undefined : { opacity: 0, y: -5 }}
                transition={{ duration: reducedMotion ? 0 : 0.15 }}>
                <span className="augment-recommendation__icon" aria-hidden="true">
                  {action === 'take' ? <Check size={20} /> : action === 'reroll' ? <RotateCw size={20} /> : <Diamond size={20} />}
                </span>
                <div>
                  <p className="augment-recommendation__label">Recommended action</p>
                  <h3>{action === 'take' ? 'Take it' : action === 'reroll' ? 'Reroll first' : <>{chosenIds.length}<span> / {offerCount}</span> entered</>}</h3>
                  {choice && (
                    <p className="augment-recommendation__detail">
                      {action === 'reroll'
                        ? <>Top offer <strong>{choice.augment.name}</strong>. Use a reroll, then update the changed offer.</>
                        : <>Pick <strong>{choice.augment.name}</strong>.{rerolls === 0 && ' No rerolls remain.'}</>}
                    </p>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
      {!compact && (
        <AugmentSheet decisions={challenge?.augments ?? []} />
      )}
    </section>
  )
}
