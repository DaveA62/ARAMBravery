import { useEffect, useState, type ReactNode } from 'react'
import { BookOpen, Coins, Crosshair, ExternalLink, LockKeyhole, RotateCw, Zap } from 'lucide-react'
import { champions, items, spells, type Champion } from './data'
import { modeName, type Challenge } from './domain'
import { preloadArcade, Reel, type ReelFace, type useArcade } from './arcade'
import { AugmentTools } from './augments/AugmentTools'
import { MAYHEM_START_LEVEL, skillNote } from './domain/skills'
import { Art } from './ui'

const artBase = import.meta.env.BASE_URL
export const championFace = (champion: Champion): ReelFace => ({ id: champion.id, name: champion.name, image: champion.portrait })
export const championSplash = (champion: Champion) => champion.id === 'Jinx' ? artBase + 'art/jinx.webp' : champion.splash
const faces = (entries: readonly { id: string; name: string; icon: string }[]): ReelFace[] =>
  entries.map(({ id, name, icon }) => ({ id, name, image: icon }))
export const championPool = champions.filter((_, index) => index % Math.max(1, Math.floor(champions.length / 12)) === 0).slice(0, 12).map(championFace)
const itemPool = faces(items.filter((_, index) => index % Math.max(1, Math.floor(items.length / 12)) === 0).slice(0, 12))
const spellPool = faces(spells)
export const reelImages = [...championPool, ...itemPool, ...spellPool].map(face => face.image).filter((url): url is string => Boolean(url))
export function preloadChallenge(challenge: Challenge) {
  preloadArcade([championSplash(challenge.champion), challenge.champion.portrait, ...challenge.items.map(item => item.icon), ...challenge.spells.map(spell => spell.icon)])
}

function SkillCard({ challenge, shown, active, onLevel }: {
  challenge: Challenge
  shown: number
  active: number
  onLevel: (level: number) => void
}) {
  const stats = challenge.champion.id === 'Aphelios'
  const statLabels = { Q: 'Attack Damage', W: 'Attack Speed', E: 'Lethality', R: 'Moonlight Vigil' }
  const statKeys = { Q: 'AD', W: 'AS', E: 'Leth', R: 'R' }
  const note = skillNote(challenge.champion.id)
  return (
    <section className={`board-panel skills${stats ? ' skill-stats' : ''}`} aria-labelledby="skill-title">
      <div className="panel-heading">
        <div className="panel-heading-title"><Crosshair size={17} /><h2 id="skill-title">Skill Order</h2></div>
        <span className="panel-aside">Spawn points S1–S3 at level {MAYHEM_START_LEVEL}</span>
      </div>
      <div className="skill-grid" data-revealed={shown === challenge.skills.length || undefined}>
        {challenge.skills.map(({ level, ability, rank, automatic }, index) => {
          const spawn = level <= MAYHEM_START_LEVEL
          const trackLevel = Math.max(level, MAYHEM_START_LEVEL)
          const skillName = ability && (stats ? statLabels[ability] : challenge.champion.abilityNames?.[ability] || ability)
          const skillKey = ability && (stats ? statKeys[ability] : ability)
          const alreadySpent = !stats && ability && automatic?.includes(ability)
          const innate = automatic?.filter((code) => stats || code !== ability)
          const label = skillName ? `${skillName} rank ${rank}${alreadySpent ? ', already assigned' : ''}` : 'No point to spend'
          const tooltip = innate?.length ? `${label} · Automatic ${innate.join(', ')}` : label
          const ready = index < shown
          return (
            <button type="button" key={level} className={'skill-cell' + (ready ? ' skill-ready' : '')}
              data-ability={ability ?? ''} data-spawn={spawn || undefined}
              aria-label={`${spawn ? `Spawn point ${level}` : `Level ${level}`} · ${ready ? tooltip : 'Pending'}`}
              aria-pressed={active === trackLevel} title={ready ? tooltip : undefined} disabled={!ready} onClick={() => onLevel(trackLevel)}>
              <span className="skill-level">{spawn ? `S${level}` : level}</span>
              <span className="skill-icon">
                {ready && ability && !stats && <Art src={challenge.champion.abilityIcons[ability]} />}
                <b>{ready ? skillKey ?? '–' : '·'}</b>
                {ready && rank > 0 && <small className="skill-rank">{rank}</small>}
                {ready && Boolean(automatic?.length) && <i aria-hidden="true">+</i>}
              </span>
            </button>
          )
        })}
      </div>
      {shown >= challenge.skills.length && note && <p className="skill-note">{note}</p>}
    </section>
  )
}

type Props = {
  challenge: Challenge
  arcade: ReturnType<typeof useArcade>
  compact: boolean
  showHeading?: boolean
  headingActions?: ReactNode
  onItemReroll?: (index: number) => void
  onSpellReroll?: (index: number) => void
  onRerollAll?: () => void
  itemLocked?: boolean
  lockedItemSlots?: readonly number[]
}

export function Loadout({ challenge, arcade, compact, showHeading = true, headingActions, onItemReroll, onSpellReroll, onRerollAll, itemLocked, lockedItemSlots }: Props) {
  const [skillLevel, setSkillLevel] = useState(0)
  useEffect(() => { setSkillLevel(0) }, [challenge.config.seed])
  const curation = challenge.curation
  return (
    <>
      <section id="loadout" className="loadout" aria-labelledby={showHeading ? "loadout-title" : undefined} aria-label={showHeading ? undefined : "The Loadout"} data-item-controls={Boolean(onItemReroll)} data-spell-controls={Boolean(onSpellReroll)}>
        {showHeading && <div className="section-header">
          <div>
            <p className="section-kicker"><Zap size={13} /> YOUR CHALLENGE</p>
            <h2 id="loadout-title">THE LOADOUT</h2>
          </div>
          {headingActions}
        </div>}
        <div className="loadout-grid">
          <section className="board-panel items-panel" aria-labelledby="item-title">
            <div className="panel-heading">
              <div className="panel-heading-title"><Coins size={17} /><h3 id="item-title">Item Build</h3><span className="panel-aside">Purchase order</span></div>
              {onRerollAll && <button type="button" className="small-button" disabled={arcade.busy} onClick={onRerollAll}><RotateCw size={14} /> Reroll Items</button>}
            </div>
            <div className="items-grid">
              {challenge.items.map((item, i) => {
                const track = arcade.tracks.items[i]
                const hidden = track?.phase === 'queued' || track?.phase === 'spinning'
                const slotLocked = Boolean(lockedItemSlots?.includes(i))
                const guideItem = Boolean(curation?.status === 'applied' && curation.itemIds?.includes(item.id))
                const itemLabel = [
                  item.name, `${item.price} gold`,
                  guideItem && 'From a MOBAFire guide',
                  slotLocked && 'Locked by Friendly Fire',
                ].filter(Boolean).join(', ')
                return (
                  <div className="item-cell" key={i} data-slot-locked={slotLocked && !hidden || undefined}>
                    <div className="item-window" tabIndex={hidden ? undefined : 0} aria-label={hidden ? 'Rolling item ' + (i + 1) : itemLabel}>
                      <Reel face={{ id: item.id, name: item.name, image: item.icon }} pool={itemPool} track={track} variant="item" vetoed={slotLocked} />
                      <span className="slot-number">{String(i + 1).padStart(2, '0')}</span>
                      {!hidden && (guideItem || slotLocked) && (
                        <div className="item-markers" aria-hidden="true">
                          {guideItem && <span className="item-marker item-marker--guide"><BookOpen size={13} /></span>}
                          {slotLocked && <span className="item-marker item-marker--lock"><LockKeyhole size={13} /></span>}
                        </div>
                      )}
                      {!hidden && (
                        <span className="item-tooltip" role="tooltip">
                          <strong>{item.name}</strong><span>{item.description}</span><small>{item.price.toLocaleString()} gold</small>
                          {item.upgradesTo && <small>Upgrades to {item.upgradesTo} when fully stacked.</small>}
                          {guideItem && <small className="item-tooltip__guide">MOBAFire guide item</small>}
                          {slotLocked && <small className="item-tooltip__lock">Locked by Friendly Fire</small>}
                        </span>
                      )}
                    </div>
                    <span className="item-name" title={hidden ? undefined : item.name}>{hidden ? 'Rolling…' : item.name}</span>
                    {onItemReroll && <button type="button" className="reel-reroll" disabled={arcade.busy || itemLocked || slotLocked} onClick={() => onItemReroll(i)}
                      aria-label={`Reroll item slot ${i + 1}`} aria-description={slotLocked ? 'Locked by Friendly Fire' : undefined}
                      title={slotLocked ? 'Locked by Friendly Fire' : `Reroll item slot ${i + 1}`}>
                      {slotLocked && !hidden ? <LockKeyhole size={14} aria-hidden="true" /> : <RotateCw size={14} aria-hidden="true" />}
                    </button>}
                  </div>
                )
              })}
            </div>
            {arcade.showAugments && curation && (
              <div className="item-provenance" data-status={curation.status}>
                <BookOpen size={17} aria-hidden="true" />
                <div>
                  <strong>{curation.status === 'applied' ? 'Curated Bullshit' : 'Standard Build'}</strong>
                  {curation.status === 'applied' && curation.source ? (
                    <p>
                      <a href={curation.source.url} target="_blank" rel="noopener noreferrer">
                        {curation.source.title} <ExternalLink size={12} aria-hidden="true" />
                      </a> · {curation.source.name} {curation.source.mode === 'aram' ? 'ARAM' : 'Summoner’s Rift'} guide by {curation.source.author}.
                      {curation.adapted && ` ${curation.itemIds?.length ?? 0} of ${challenge.items.length} items from the guide.`}
                    </p>
                  ) : <p>{curation.reason ?? 'A verified guide was unavailable. This roll used the standard item pool.'}</p>}
                </div>
              </div>
            )}
          </section>

          <section className="board-panel spells-panel" aria-labelledby="spell-title">
            <div className="panel-heading"><div className="panel-heading-title"><Zap size={17} /><h3 id="spell-title">Summoner Spells</h3></div></div>
            <div className="spells-grid">
              {challenge.spells.map((spell, i) => {
                const track = arcade.tracks.spells[i]
                const hidden = track?.phase === 'queued' || track?.phase === 'spinning'
                return (
                  <div className="item-cell" key={i}>
                    <div className="item-window spell-window" tabIndex={hidden ? undefined : 0} aria-label={hidden ? 'Rolling spell ' + (i + 1) : spell.name}>
                      <Reel face={{ id: spell.id, name: spell.name, image: spell.icon }} pool={spellPool} track={track} variant="spell" />
                      {!hidden && <span className="item-tooltip" role="tooltip"><strong>{spell.name}</strong><span>{spell.description}</span></span>}
                    </div>
                    <span className="item-name">{hidden ? 'Rolling…' : spell.name}</span>
                    {onSpellReroll && <button type="button" className="reel-reroll" disabled={arcade.busy} title={`Reroll spell slot ${i + 1}`}
                      aria-label={`Reroll spell slot ${i + 1}`} onClick={() => onSpellReroll(i)}><RotateCw size={14} /></button>}
                  </div>
                )
              })}
            </div>
          </section>
        </div>
        <SkillCard challenge={challenge} shown={arcade.revealedSkills} active={skillLevel} onLevel={(level) => { setSkillLevel(level); arcade.play('level') }} />
        <div className="seed-row">
          <span><span className="seed-caption">CHALLENGE SEED</span> <b>{arcade.complete ? challenge.config.seed : '······'}</b></span>
          <span>{challenge.champion.name} · {modeName(challenge.config.mode)}</span>
        </div>
      </section>
      <div id="augment-picker" className="augment-anchor">
        <AugmentTools key={challenge.config.seed} seed={arcade.showAugments ? challenge.config.seed : undefined}
          compact={compact} onChoose={() => arcade.play('confirm')} />
      </div>
    </>
  )
}
