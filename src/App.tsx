import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  AudioLines, BookOpen, Check, ChevronDown, ChevronUp, ClipboardCopy, Coins, Crosshair, Dices, Flame,
  History, Link2, Monitor, RotateCw, Settings2, ShieldHalf, Shuffle, Sparkles, Star, Volume2, VolumeX, Zap,
} from 'lucide-react'
import { champions, items, spells, DATA_VERSION, type Champion } from './data'
import {
  challengeFromUrl, challengeKey, challengeSummary, challengeUrl, generateChallenge, loadLibrary, loadPreferences, newSeed, rememberChallenge, savePreferences,
  rerollChallenge, toggleFavorite, type Challenge, type Mode, type RerollAction, type Preferences,
} from './domain'
import { preloadArcade, Reel, useArcade, type ReelFace } from './arcade'
import { AugmentPicker } from './augments/AugmentPicker'
import { MAYHEM_START_LEVEL, skillNote } from './domain/skills'
import { Art, ChampionPicker, copyText, Modal, useReducedMotion } from './ui'

const artBase = import.meta.env.BASE_URL
const startingChampion = champions.find(({ id }) => id === 'Jinx') ?? champions[0]
const championFace = (champion: Champion): ReelFace => ({ id: champion.id, name: champion.name, image: champion.portrait })
const championSplash = (champion: Champion) => champion.id === 'Jinx' ? artBase + 'art/jinx.webp' : champion.splash
const faces = (entries: readonly { id: string; name: string; icon: string }[]): ReelFace[] =>
  entries.map(({ id, name, icon }) => ({ id, name, image: icon }))
const championPool = champions.filter((_, index) => index % Math.max(1, Math.floor(champions.length / 12)) === 0).slice(0, 12).map(championFace)
const itemPool = faces(items.filter((_, index) => index % Math.max(1, Math.floor(items.length / 12)) === 0).slice(0, 12))
const spellPool = faces(spells)
const reelImages = [...championPool, ...itemPool, ...spellPool].map(face => face.image).filter((url): url is string => Boolean(url))
const modes = [
  { id: 'little', title: 'A Little Bullshit', note: 'Controlled chaos', Icon: ShieldHalf },
  { id: 'straight', title: 'Straight Bullshit', note: 'Total chaos', Icon: Flame },
] as const
const stages = {
  idle: 'Machine ready', champion: 'Selecting champion', items: 'Spinning item reels', spells: 'Locking summoner spells',
  skills: 'Sequencing skill order', augments: 'Ranking augments', complete: 'Challenge complete',
}
const sparks = Array.from({ length: 23 }, (_, i) => ({
  left: (i * 43 + 7) % 100, top: (i * 29 + 14) % 100, delay: (i % 9) * -.64, size: i % 6 === 0 ? 3 : 2,
}))

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

function Settings({ prefs, update, systemReduced }: {
  prefs: Preferences
  update: (change: Partial<Preferences>) => void
  systemReduced: boolean
}) {
  return (
    <div className="dialog-content settings">
      <label className="setting"><span><strong>Roll animation</strong><small>{systemReduced ? 'Reduced motion is enabled on this device.' : 'Choose how long the machine takes to reveal a build.'}</small></span>
        <select value={prefs.motion} onChange={event => update({ motion: event.target.value as Preferences['motion'] })}>
          <option value="full">Cinematic</option><option value="short">Short</option><option value="off">Off</option>
        </select>
      </label>
      <label className="setting"><span><strong>Mute sound</strong></span>
        <input type="checkbox" checked={prefs.muted} onChange={event => update({ muted: event.target.checked })} />
      </label>
      <label className="setting"><span><strong>Master volume</strong><small>{Math.round(prefs.masterVolume * 100)}%</small></span>
        <input type="range" min={0} max={1} step={.01} value={prefs.masterVolume} onChange={event => update({ masterVolume: +event.target.value })} />
      </label>
      <label className="setting"><span><strong>Sound effects volume</strong><small>{Math.round(prefs.effectsVolume * 100)}%</small></span>
        <input type="range" min={0} max={1} step={.01} value={prefs.effectsVolume} onChange={event => update({ effectsVolume: +event.target.value })} />
      </label>
      <label className="setting"><span><strong>Second-monitor mode</strong><small>Keep the build, skill order, and augment picker in view.</small></span>
        <input type="checkbox" checked={prefs.compact} onChange={event => update({ compact: event.target.checked })} />
      </label>
    </div>
  )
}

export default function App() {
  const [initial] = useState(() => {
    const fromLink = challengeFromUrl(window.location.href)
    return { fromLink, challenge: fromLink ?? generateChallenge({ seed: 'MAYHEM', mode: 'little', championId: startingChampion.id }) }
  })
  const [challenge, setChallenge] = useState(initial.challenge)
  const [mode, setMode] = useState<Mode>(initial.challenge.config.mode)
  const [selected, setSelected] = useState<string | undefined>(initial.fromLink?.config.championId)
  const [preferences, setPreferences] = useState(() => loadPreferences(window.matchMedia('(max-width: 640px)').matches ? 'short' : 'full'))
  const [library, setLibrary] = useState(loadLibrary)
  const [dialog, setDialog] = useState<'champions' | 'settings' | 'library' | 'share' | null>(null)
  const [toast, setToast] = useState(() => !initial.fromLink && new URLSearchParams(location.search).has('seed') ? 'This challenge link uses an unsupported or invalid version.' : '')
  const [skillLevel, setSkillLevel] = useState(0)
  const [lastChampion, setLastChampion] = useState(challenge.champion)
  const [controlsOpen, setControlsOpen] = useState(!preferences.compact)
  const reduced = useReducedMotion()
  const motionSetting = reduced ? 'off' : preferences.motion
  const arcade = useArcade({ muted: preferences.muted, master: preferences.masterVolume, effects: preferences.effectsVolume, motion: motionSetting })
  const chaotic = mode === 'straight'
  const championTrack = arcade.tracks.champion
  const spinningChampion = championTrack?.phase === 'spinning' || championTrack?.phase === 'queued'
  const preview = !arcade.busy && selected && selected !== challenge.champion.id ? champions.find(({ id }) => id === selected) : undefined
  const displayedChampion = preview ?? (spinningChampion ? lastChampion : challenge.champion)
  const compact = preferences.compact
  const isFavorite = library.favorites.some(saved => challengeKey(saved) === challengeKey(challenge))

  useEffect(() => { preloadArcade(reelImages) }, [])
  useEffect(() => { savePreferences(preferences) }, [preferences])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2800)
    return () => window.clearTimeout(timer)
  }, [toast])

  const updatePreferences = (change: Partial<Preferences>) => {
    if (change.compact !== undefined) setControlsOpen(!change.compact)
    setPreferences(current => ({ ...current, ...change }))
  }

  const commit = (next: Challenge) => {
    setChallenge(next)
    setLibrary(rememberChallenge(next))
  }

  const roll = () => {
    if (arcade.busy) return
    try {
      const next = generateChallenge({ seed: newSeed(), mode, championId: selected })
      setLastChampion(displayedChampion)
      preloadArcade([championSplash(next.champion), next.champion.portrait, ...next.items.map(item => item.icon), ...next.spells.map(spell => spell.icon)])
      arcade.run('full', () => { setSkillLevel(0); commit(next) }, {
        chaotic, manualChampion: Boolean(selected), skillCount: next.skills.length,
      })
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'The machine could not generate a legal build.')
    }
  }

  const reroll = (action: RerollAction) => {
    if (arcade.busy) return
    try {
      const next = rerollChallenge(challenge, action)
      if (action.type === 'spells') return
      const kind = action.type === 'items' ? 'items' : action.type === 'item' ? { item: action.index } : { spell: action.index }
      preloadArcade([...next.items.map(item => item.icon), ...next.spells.map(spell => spell.icon)])
      arcade.run(kind, () => commit(next), { chaotic: challenge.config.mode === 'straight' })
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'No legal replacement is available.')
    }
  }

  const load = (next: Challenge) => {
    arcade.skip()
    setMode(next.config.mode)
    setSelected(next.config.championId)
    setSkillLevel(0)
    commit(next)
    setDialog(null)
    arcade.play('confirm')
    setToast('Challenge loaded')
  }

  const copy = async (text: string, message: string) => {
    try {
      await copyText(text)
      setToast(message)
      arcade.play('copy')
    } catch {
      setToast('Clipboard unavailable. Select and copy the challenge link.')
      setDialog('share')
    }
  }

  const favorite = () => {
    setLibrary(toggleFavorite(challenge))
    arcade.play('confirm')
    setToast(isFavorite ? 'Favorite removed' : 'Challenge saved to favorites')
  }

  const headerControls = (
    <>
      <button type="button" className="icon-button" aria-label="Saved challenges" title="Saved challenges" onClick={() => setDialog('library')}><History size={19} /></button>
      <button type="button" className="icon-button desktop-icon" aria-label={compact ? 'Full view' : 'Second-monitor mode'} aria-pressed={compact} title="Second-monitor mode"
        onClick={() => updatePreferences({ compact: !compact })}><Monitor size={19} /></button>
      <button type="button" className="icon-button" aria-label={preferences.muted ? 'Unmute sound' : 'Mute sound'} aria-pressed={preferences.muted}
        title={preferences.muted ? 'Unmute sound' : 'Mute sound'} onClick={() => updatePreferences({ muted: !preferences.muted })}>
        {preferences.muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
      </button>
      <button type="button" className="icon-button" aria-label="Settings" title="Settings" onClick={() => setDialog('settings')}><Settings2 size={19} /></button>
    </>
  )

  return (
    <div className={`app ${chaotic ? 'chaotic' : ''} ${compact ? 'compact' : ''} ${motionSetting === 'off' ? 'no-motion' : ''}`} data-phase={arcade.phase} onPointerDownCapture={arcade.unlock}>
      <header className="topbar">
        <div className="shell topbar-inner">
          <a href="#top" className="brand">
            <span className="brand-emblem"><Sparkles size={19} strokeWidth={1.7} /></span>
            <span><strong>ARAM <em>MAYHEM</em></strong><small>ULTIMATE BRAVERY</small></span>
          </a>
          <nav className="top-nav" aria-label="Page sections">
            <a href="#loadout">The Loadout</a><a href="#augment-picker">Augment Picker</a>
          </nav>
          <div className="top-controls">{headerControls}</div>
        </div>
      </header>
      <main id="top">
        <section className="hero" aria-label="Challenge machine">
          <div className="hero-backdrop" aria-hidden="true">
            <AnimatePresence initial={false}>
              <motion.div className="hero-image" key={displayedChampion.id} initial={motionSetting === 'off' ? false : { opacity: 0, scale: 1.045 }}
                animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: motionSetting === 'off' ? 0 : .43 }}>
                <Art src={championSplash(displayedChampion)} />
              </motion.div>
            </AnimatePresence>
            <div className="hero-shading" /><div className="hero-gridlines" />
            <div className="hero-orbit hero-orbit--outer" /><div className="hero-orbit hero-orbit--inner" />
            <div className="sparkfield">{sparks.map((spark, i) => <i key={i} style={{ left: spark.left + '%', top: spark.top + '%', animationDelay: spark.delay + 's', width: spark.size, height: spark.size }} />)}</div>
          </div>
          <div className="shell hero-inner">
            <div className="machine">
              <p className="hero-kicker"><span /> THE ULTIMATE BRAVERY MACHINE</p>
              <h1>ARAM <em>MAYHEM</em></h1>
              <p className="hero-description">Roll your champion, build, and augments.<br className="desktop-break" /> Leave the good decisions to someone else.</p>
              {compact && <button type="button" className="small-button compact-toggle" aria-expanded={controlsOpen} onClick={() => setControlsOpen(!controlsOpen)}>
                {controlsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />} Roll controls
              </button>}
              {controlsOpen && <>
                <div className="machine-controls">
                  <div className="control-line">
                    <span className="control-label">Champion</span>
                    <div className="control-buttons">
                      <button type="button" disabled={arcade.busy} className="machine-option" aria-pressed={!selected} onClick={() => { setSelected(undefined); arcade.play('tap') }}>
                        <Shuffle size={15} /><span>Random</span>
                      </button>
                      <button type="button" disabled={arcade.busy} className="machine-option" aria-pressed={Boolean(selected)} onClick={() => setDialog('champions')}>
                        <Crosshair size={15} /><span>{selected ? champions.find(champion => champion.id === selected)?.name : 'Select Champion'}</span><ChevronDown className="option-caret" size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="control-line">
                    <span className="control-label">Build mode</span>
                    <div className="control-buttons">
                      {modes.map(({ id, title, note, Icon }) => (
                        <button type="button" disabled={arcade.busy} key={id} className={`machine-option option-${id}`} aria-pressed={mode === id}
                          title={note} onClick={() => { setMode(id); arcade.play('mode', id === 'straight') }}>
                          <Icon size={15} /><span>{title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="roll-zone">
                  <button type="button" className="roll-button" disabled={arcade.busy} onClick={roll}
                    onPointerEnter={(event) => { if (event.pointerType === 'mouse') arcade.play('hover', chaotic) }}>
                    <span className="roll-content"><Dices size={28} strokeWidth={2.1} /><span>{arcade.busy ? 'MACHINE RUNNING' : 'ROLL MY BUILD'}</span><span className="roll-flare">✦</span></span>
                  </button>
                  <div className="machine-readout" aria-live="polite">
                    <span><i />{stages[arcade.phase]}</span>
                    {arcade.busy && <button type="button" onClick={arcade.skip}>Skip animation</button>}
                  </div>
                </div>
              </>}
              {compact && <div className="compact-champion">
                <div className="compact-portrait"><Reel face={championFace(preview ?? challenge.champion)} pool={championPool} track={championTrack} variant="champion" /></div>
                <strong>{spinningChampion ? 'Rolling…' : displayedChampion.name}</strong>
              </div>}
            </div>
            <div className="champion-nameplate" data-revealed={championTrack?.phase === 'landed'}>
              <div className="champion-label">
                <Reel face={championFace(preview ?? challenge.champion)} pool={championPool} track={championTrack} variant="champion" />
              </div>
              <div className="champion-name-text">
                <span>{preview ? 'Selected champion' : 'Your champion'}</span>
                <strong>{spinningChampion ? 'Rolling…' : displayedChampion.name}</strong>
                <small>{spinningChampion ? 'CHAMPION REEL ACTIVE' : displayedChampion.title}</small>
              </div>
              <div className="champion-ornament" aria-hidden="true">✦</div>
            </div>
          </div>
        </section>

        <div className="shell gameplay">
          <section id="loadout" className="loadout" aria-labelledby="loadout-title">
            <div className="section-header">
              <div>
                <p className="section-kicker"><Zap size={13} /> YOUR CHALLENGE</p>
                <h2 id="loadout-title">THE LOADOUT</h2>
              </div>
              <div className="challenge-actions">
                <button type="button" className="small-button" disabled={arcade.busy} aria-pressed={isFavorite} onClick={favorite}><Star size={15} /> <span>Favorite</span></button>
                <button type="button" className="small-button share-button" disabled={arcade.busy} onClick={() => setDialog('share')}><Link2 size={16} /> <span>Share</span></button>
              </div>
            </div>
            <div className="loadout-grid">
              <section className="board-panel items-panel" aria-labelledby="item-title">
                <div className="panel-heading">
                  <div className="panel-heading-title"><Coins size={17} /><h3 id="item-title">Item Build</h3><span className="panel-aside">Purchase order</span></div>
                  <button type="button" className="small-button" disabled={arcade.busy} onClick={() => reroll({ type: 'items' })}><RotateCw size={14} /> Reroll Items</button>
                </div>
                <div className="items-grid">
                  {challenge.items.map((item, i) => {
                    const track = arcade.tracks.items[i]
                    const hidden = track?.phase === 'queued' || track?.phase === 'spinning'
                    return (
                      <div className="item-cell" key={i}>
                        <div className="item-window" tabIndex={hidden ? undefined : 0} aria-label={hidden ? 'Rolling item ' + (i + 1) : item.name + ', ' + item.price + ' gold'}>
                          <Reel face={{ id: item.id, name: item.name, image: item.icon }} pool={itemPool} track={track} variant="item" />
                          <span className="slot-number">{String(i + 1).padStart(2, '0')}</span>
                          {!hidden && <span className="item-tooltip" role="tooltip"><strong>{item.name}</strong><span>{item.description}</span><small>{item.price.toLocaleString()} gold</small>{item.upgradesTo && <small>Upgrades to {item.upgradesTo} when fully stacked.</small>}</span>}
                        </div>
                        <span className="item-name" title={hidden ? undefined : item.name}>{hidden ? 'Rolling…' : item.name}</span>
                        <button type="button" className="reel-reroll" disabled={arcade.busy} onClick={() => reroll({ type: 'item', index: i })}
                          aria-label={`Reroll item slot ${i + 1}`} title={`Reroll item slot ${i + 1}`}><RotateCw size={14} /></button>
                      </div>
                    )
                  })}
                </div>
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
                        <button type="button" className="reel-reroll" disabled={arcade.busy} title={`Reroll spell slot ${i + 1}`}
                          aria-label={`Reroll spell slot ${i + 1}`} onClick={() => reroll({ type: 'spell', index: i })}><RotateCw size={14} /></button>
                      </div>
                    )
                  })}
                </div>
              </section>
            </div>
            <SkillCard challenge={challenge} shown={arcade.revealedSkills} active={skillLevel} onLevel={(level) => { setSkillLevel(level); arcade.play('level') }} />
            <div className="seed-row">
              <span><span className="seed-caption">CHALLENGE SEED</span> <b>{arcade.complete ? challenge.config.seed : '······'}</b></span>
              <span>{challenge.champion.name} · {modes.find(({ id }) => id === challenge.config.mode)?.title}</span>
            </div>
          </section>
          <div id="augment-picker" className="augment-anchor">
            <AugmentPicker challenge={arcade.showAugments ? challenge : null} reducedMotion={motionSetting === 'off'} compact={compact}
              playSound={event => arcade.play(event === 'augmentReroll' ? 'warning' : event === 'augmentFlip' ? 'tap' : 'confirm')} />
          </div>
        </div>
      </main>
      <footer className="footer">
        <div className="shell footer-inner"><span><Sparkles size={15} /> ARAM MAYHEM · ULTIMATE BRAVERY</span><span>Patch data {DATA_VERSION} · Unofficial Riot Games fan project</span><a href="https://github.com/DaveA62/ARAMBravery"><BookOpen size={15} /> Source &amp; data notes</a></div>
      </footer>

      {dialog === 'champions' && <Modal title="Select Champion" wide onClose={() => setDialog(null)}>
        <ChampionPicker selected={selected} onSelect={champion => { setSelected(champion.id); setDialog(null); arcade.play('confirm') }} />
      </Modal>}
      {dialog === 'settings' && <Modal title="Machine Settings" onClose={() => setDialog(null)}>
        <Settings prefs={preferences} update={updatePreferences} systemReduced={reduced} />
      </Modal>}
      {dialog === 'share' && <Modal title="Share Challenge" onClose={() => setDialog(null)}>
        <div className="dialog-content share-content">
          <p>{challenge.champion.name} · {challenge.config.seed}</p>
          <input className="share-field" aria-label="Challenge URL" value={challengeUrl(challenge)} readOnly onFocus={event => event.target.select()} />
          <div className="share-actions">
            <button type="button" className="small-button share-button" onClick={() => void copy(challengeUrl(challenge), 'Challenge link copied')}><Link2 size={16} /> Copy link</button>
            <button type="button" className="small-button" onClick={() => void copy(challengeSummary(challenge), 'Build summary copied')}><ClipboardCopy size={16} /> Copy summary</button>
          </div>
          <div className="dialog-feedback" role="status">{toast}</div>
        </div>
      </Modal>}
      {dialog === 'library' && <Modal title="Saved Challenges" onClose={() => setDialog(null)}>
        <div className="dialog-content"><Library library={library} onLoad={load} /></div>
      </Modal>}
      <div className={`toast ${toast && dialog !== 'share' ? 'toast-visible' : ''}`} role="status"><Check size={17} />{dialog !== 'share' ? toast : ''}</div>
      <div className="completion-flash" aria-hidden="true" />
    </div>
  )
}

function Library({ library, onLoad }: { library: ReturnType<typeof loadLibrary>; onLoad: (challenge: Challenge) => void }) {
  return (
    <div className="library">
      <p className="quiet"><AudioLines size={16} /> Favorites and recent rolls are stored on this device.</p>
      {([['Favorites', library.favorites], ['Recent rolls', library.history]] as const).map(([label, list]) => (
        <section key={label}>
          <h3>{label}</h3>
          {list.length ? list.map(config => {
            try {
              const entry = generateChallenge(config)
              return <button type="button" className="library-row" key={JSON.stringify(config)} onClick={() => onLoad(entry)}>
                <Art src={entry.champion.portrait} />
                <span><strong>{entry.champion.name}</strong><small>{entry.config.seed} · {modes.find(({ id }) => id === entry.config.mode)?.title}</small></span>
                <span>Load</span>
              </button>
            } catch { return null }
          }) : <p className="quiet">No challenges yet.</p>}
        </section>
      ))}
    </div>
  )
}
