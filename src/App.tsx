import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  AudioLines, BookOpen, Check, ChevronDown, ChevronUp, ClipboardCopy, Crosshair, Dices, Flame,
  History, Link2, Monitor, Settings2, ShieldHalf, Shuffle, Sparkles, Star, Users, Volume2, VolumeX,
} from 'lucide-react'
import { champions, DATA_VERSION } from './data'
import {
  challengeFromUrl, challengeKey, challengeSummary, challengeUrl, generateChallenge, loadLibrary, loadPreferences, newSeed, rememberChallenge, savePreferences,
  rerollChallenge, toggleFavorite, type Challenge, type Mode, type RerollAction, type Preferences,
} from './domain'
import { preloadArcade, Reel, useArcade } from './arcade'
import { StageAtmosphere, StageProgress } from './arcade/StageEffects'
import { championFace, championPool, championSplash, Loadout, preloadChallenge, reelImages } from './Loadout'
import { Art, ChampionPicker, copyText, Modal, useReducedMotion } from './ui'
import { PartyLobby } from './party/Lobby'
import { useParty } from './party/network'
import { PartyResults } from './party/PartyResults'

const startingChampion = champions.find(({ id }) => id === 'Jinx') ?? champions[0]
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
  const [initialCode] = useState(() => new URLSearchParams(window.location.search).get('party') ?? '')
  const party = useParty()
  const [partyView, setPartyView] = useState(Boolean(initialCode))
  const showParty = (show: boolean) => {
    if (show === partyView) return
    arcade.skip()
    setPartyView(show)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  const [initial] = useState(() => {
    const fromLink = challengeFromUrl(window.location.href)
    return { fromLink, challenge: fromLink ?? generateChallenge({ seed: 'MAYHEM', mode: 'little', championId: startingChampion.id }) }
  })
  const [challenge, setChallenge] = useState(initial.challenge)
  const [mode, setMode] = useState<Mode>(initial.challenge.config.mode)
  const [curated, setCurated] = useState(Boolean(initial.challenge.config.curated))
  const [selected, setSelected] = useState<string | undefined>(initial.fromLink?.config.championId)
  const [preferences, setPreferences] = useState(() => loadPreferences(window.matchMedia('(max-width: 640px)').matches ? 'short' : 'full'))
  const [library, setLibrary] = useState(loadLibrary)
  const [dialog, setDialog] = useState<'champions' | 'settings' | 'library' | 'share' | null>(null)
  const [toast, setToast] = useState(() => !initial.fromLink && new URLSearchParams(location.search).has('seed') ? 'This challenge link uses an unsupported or invalid version.' : '')
  const [lastChampion, setLastChampion] = useState(challenge.champion)
  const [controlsOpen, setControlsOpen] = useState(!preferences.compact)
  const reduced = useReducedMotion()
  const motionSetting = reduced ? 'off' : preferences.motion
  const arcade = useArcade({ muted: preferences.muted, master: preferences.masterVolume, effects: preferences.effectsVolume, motion: motionSetting })
  const chaotic = (partyView ? party.snapshot?.rules.mode : mode) === 'straight'
  const partyRound = party.snapshot?.round
  const partyConnected = party.status === 'hosting' || party.status === 'joined'

  useEffect(() => {
    if (party.snapshot?.code) setPartyView(true)
  }, [party.snapshot?.code])

  useEffect(() => {
    if (partyView && !partyRound) arcade.skip()
  }, [partyView, partyRound?.id, arcade.skip])

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
      const next = generateChallenge({ seed: newSeed(), mode, championId: selected, curated: curated || undefined })
      setLastChampion(displayedChampion)
      preloadChallenge(next)
      arcade.run('full', () => commit(next), {
        chaotic, manualChampion: Boolean(selected), skillCount: next.skills.length, championRoles: next.champion.roles,
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
    setCurated(Boolean(next.config.curated))
    setSelected(next.config.championId)
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
      {!partyView && <button type="button" className="icon-button" aria-label="Saved challenges" title="Saved challenges" onClick={() => setDialog('library')}><History size={19} /></button>}
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
    <div className={`app ${chaotic ? 'chaotic' : ''} ${compact ? 'compact' : ''} ${partyView ? 'app-party' : ''} ${motionSetting === 'off' ? 'no-motion' : ''}`} data-phase={arcade.phase} onPointerDownCapture={arcade.unlock}>
      <header className="topbar">
        <div className="shell topbar-inner">
          <a href="#top" className="brand">
            <span className="brand-emblem"><Sparkles size={19} strokeWidth={1.7} /></span>
            <span><strong>ARAM <em>MAYHEM</em></strong><small>ULTIMATE BRAVERY</small></span>
          </a>
          <nav className="mode-nav" aria-label="Game mode">
            <button type="button" aria-pressed={!partyView} onClick={() => showParty(false)}><Dices size={16} /> Solo Mayhem</button>
            <button type="button" aria-pressed={partyView} onClick={() => showParty(true)}><Users size={16} /> Party Mayhem</button>
          </nav>
          <div className="top-controls">{headerControls}</div>
        </div>
      </header>
      <main id="top">
        {partyView ? <>
          <PartyLobby party={party} initialCode={initialCode} play={arcade.play} onSolo={() => showParty(false)} />
          {party.snapshot && partyRound && <PartyResults key={partyRound.id} snapshot={party.snapshot} round={partyRound}
            playerId={party.playerId} clockOffset={party.clockOffset} connected={partyConnected} send={party.send} arcade={arcade}
            reducedMotion={motionSetting === 'off'} compact={compact} />}
        </> : <>
        <section className="hero" aria-label="Challenge machine">
          <div className="hero-backdrop" aria-hidden="true">
            <AnimatePresence initial={false}>
              <motion.div className="hero-image" key={displayedChampion.id} initial={motionSetting === 'off' ? false : { opacity: 0, scale: 1.045 }}
                animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: motionSetting === 'off' ? 0 : .43 }}>
                <Art src={championSplash(displayedChampion)} />
              </motion.div>
            </AnimatePresence>
            <div className="hero-shading" /><div className="hero-gridlines" />
            <StageAtmosphere phase={arcade.phase} championImpact={championTrack?.phase === 'landed' ? championTrack.id : undefined}
              reducedMotion={motionSetting === 'off'} />
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
                  <label className="rule-toggle machine-curated">
                    <input type="checkbox" aria-label="Curated Bullshit" aria-describedby="solo-curated-note"
                      checked={curated} disabled={arcade.busy} onChange={event => {
                        setCurated(event.target.checked)
                        arcade.play('mode', chaotic)
                      }} />
                    <span>
                      <strong>Curated Bullshit</strong>
                      <small id="solo-curated-note">Each full item roll has a 50% chance to try a MOBAFire guide. A miss uses the usual item pool.</small>
                    </span>
                  </label>
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
                  <StageProgress phase={arcade.phase} fullRoll={!arcade.complete} />
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
          <Loadout challenge={challenge} arcade={arcade} compact={compact}
            onItemReroll={index => reroll({ type: 'item', index })}
            onSpellReroll={index => reroll({ type: 'spell', index })}
            onRerollAll={() => reroll({ type: 'items' })}
            headingActions={<div className="challenge-actions">
              <button type="button" className="small-button" disabled={arcade.busy} aria-pressed={isFavorite} onClick={favorite}><Star size={15} /> <span>Favorite</span></button>
              <button type="button" className="small-button share-button" disabled={arcade.busy} onClick={() => setDialog('share')}><Link2 size={16} /> <span>Share</span></button>
            </div>}
          />
        </div>
        </>}
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
