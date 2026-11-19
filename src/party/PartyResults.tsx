import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Crown, Eye, Gauge, LockKeyhole, RotateCw, Sparkles, Swords, Users, Zap } from 'lucide-react'
import { Reel, type useArcade } from '../arcade'
import { challengeKey, generateChallenge, type Challenge } from '../domain'
import { championFace, championPool, championSplash, Loadout, preloadChallenge } from '../Loadout'
import { Art, Modal } from '../ui'
import type { PartyAction, PartyBuild, PartyRound, PartySnapshot } from './protocol'
import './results.css'

const stations = {
  idle: 'Ready', champion: 'Assigning champion', items: 'Spinning item reels', spells: 'Locking spells',
  skills: 'Sequencing skills', augments: 'Ranking augments', complete: 'Reels settled',
}
const allowanceLabel = (remaining: number | null) => remaining === null ? '∞' : String(remaining)
const burst = Array.from({ length: 14 }, (_, index) => index * (360 / 14))

type Props = {
  snapshot: PartySnapshot
  round: PartyRound
  playerId: string | null
  connected: boolean
  clockOffset: number
  send: (action: PartyAction) => void
  arcade: ReturnType<typeof useArcade>
  reducedMotion: boolean
  compact: boolean
}

export function PartyResults({ snapshot, round, playerId, connected, clockOffset, send, arcade, reducedMotion, compact }: Props) {
  const [tab, setTab] = useState<'mine' | 'team'>(playerId && round.builds[playerId] ? 'mine' : 'team')
  const [challenge, setChallenge] = useState<Challenge>()
  const [inspected, setInspected] = useState<string>()
  const [pending, setPending] = useState<string>()
  const [vetoPending, setVetoPending] = useState(false)
  const [now, setNow] = useState(() => Date.now() + clockOffset)
  const [animated, setAnimated] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const began = useRef(false)
  const lastApplied = useRef('')
  const readyBuild = playerId ? round.builds[playerId] : undefined
  const config = readyBuild?.config
  const generated = useMemo(() => config ? generateChallenge(config) : undefined, [config])
  const buildKey = config ? challengeKey(config) : ''
  const { run, skip, busy } = arcade
  const untilStart = Math.max(0, round.startsAt - now)
  const locked = now < round.unlockAt
  const host = snapshot.hostId === playerId
  const vetoUsed = Boolean(playerId && round.vetoedBy?.includes(playerId))
  const canVeto = Boolean(snapshot.rules.friendlyFire && readyBuild && connected && !locked && !busy && !vetoUsed && !vetoPending)

  useEffect(() => {
    if (!locked) return
    const tick = () => setNow(Date.now() + clockOffset)
    tick()
    const timer = window.setInterval(tick, 125)
    return () => window.clearInterval(timer)
  }, [locked, clockOffset])

  useEffect(() => {
    if (!generated || began.current) return
    preloadChallenge(generated)
    const start = () => {
      if (began.current) return
      began.current = true
      lastApplied.current = buildKey
      const elapsed = Date.now() + clockOffset - round.startsAt
      if (elapsed <= 600 && !reducedMotion && !generated.config.rerolls.length) {
        setAnimated(true)
        if (run('full', () => setChallenge(generated), {
          chaotic: generated.config.mode === 'straight',
          manualChampion: Boolean(generated.config.championId),
          skillCount: generated.skills.length,
        })) return
      }
      setChallenge(generated)
    }
    const delay = round.startsAt - (Date.now() + clockOffset)
    if (delay <= 0) { start(); return }
    const timer = window.setTimeout(start, delay)
    return () => window.clearTimeout(timer)
  }, [generated, buildKey, round.startsAt, clockOffset, reducedMotion, run])

  useEffect(() => {
    if (!generated || !began.current || lastApplied.current === buildKey || busy) return
    lastApplied.current = buildKey
    const reroll = readyBuild?.lastReroll
    const ownRequest = reroll?.requestId === pending && Boolean(pending)
    const incomingVeto = Boolean(reroll?.vetoBy && tab === 'mine' && challenge &&
      generated.config.rerolls.length === challenge.config.rerolls.length + 1)
    if (reroll && (ownRequest || incomingVeto)) {
      preloadChallenge(generated)
      if (ownRequest) setPending(undefined)
      if (incomingVeto) arcade.play('warning')
      if (run({ item: reroll.index }, () => setChallenge(generated), {
        chaotic: generated.config.mode === 'straight',
      })) return
    }
    setChallenge(generated)
  }, [busy, generated, buildKey, readyBuild?.lastReroll, pending, run, tab, challenge, arcade.play])

  useEffect(() => {
    if (!pending) return
    const timer = window.setTimeout(() => setPending(undefined), 3000)
    return () => window.clearTimeout(timer)
  }, [pending])

  useEffect(() => {
    if (!vetoPending || vetoUsed) return
    const timer = window.setTimeout(() => setVetoPending(false), 3000)
    return () => window.clearTimeout(timer)
  }, [vetoPending, vetoUsed])

  useEffect(() => {
    if (challenge && !busy) setRevealed(true)
  }, [challenge, busy])

  const rerollItem = (index: number) => {
    if (!readyBuild || !challenge || !connected || locked || busy || pending || readyBuild.remaining === 0 ||
        readyBuild.lockedItemSlots?.includes(index)) return
    const requestId = crypto.randomUUID()
    setPending(requestId)
    send({ type: 'reroll', roundId: round.id, index, requestId })
  }

  const vetoItem = (targetId: string, index: number, itemId: string) => {
    if (!canVeto || targetId === playerId) return
    setVetoPending(true)
    send({ type: 'veto', roundId: round.id, requestId: crypto.randomUUID(), targetId, index, itemId })
  }

  const finishNow = () => {
    skip()
    if (!generated) return
    began.current = true
    lastApplied.current = buildKey
    setChallenge(generated)
  }

  const complete = revealed || Boolean(challenge && !busy)
  const celebrated = animated && complete
  const championRolling = arcade.tracks.champion?.phase === 'spinning'
  const showTeam = tab === 'team' && !busy
  const rosterBuilds = useMemo(() => Object.entries(round.builds).map(([id, build]) => ({
    id, build, challenge: generateChallenge(build.config),
  })), [round.builds])
  const inspectedBuild = rosterBuilds.find(entry => entry.id === inspected)
  const canInspect = !busy && (!locked || complete)

  return (
    <section className="party-results" aria-label="Party round">
      <div className="party-round-header">
        {challenge && !championRolling && <Art src={championSplash(challenge.champion)} className="party-round-splash" />}
        <div className="party-round-glass" />
        <div className="party-round-title" data-celebrate={celebrated || undefined}>
          <p className="section-kicker"><Zap size={14} /> PARTY ROUND <span>{snapshot.code}</span></p>
          <h1>{!readyBuild ? 'THE CIRCUS IS IN SESSION' : !challenge ? 'THE MACHINE IS CHARGING' : complete ? 'THE TEAM IS COOKED.' : 'THE WHOLE DAMN TEAM'}</h1>
          <div className="party-round-readout" aria-live="polite">
            {!readyBuild ? 'You’re in the party. You’ll roll in the next round.'
              : !challenge ? untilStart > 0 ? 'Reels start in ' + Math.ceil(untilStart / 1000) + '…' : 'Preparing your reels…'
              : busy ? stations[arcade.phase] : 'Your challenge is ready.'}
          </div>
          {readyBuild && (!challenge || busy) && <button type="button" className="small-button party-skip" onClick={finishNow}>Skip animation</button>}
          {celebrated && <div className="party-burst" aria-hidden="true">{burst.map(angle => <i key={angle} style={{ transform: 'rotate(' + angle + 'deg)' }} />)}</div>}
        </div>
        {challenge && <div className="party-round-champion">
          <div className="party-round-portrait"><Reel face={championFace(challenge.champion)} pool={championPool} track={arcade.tracks.champion} variant="champion" /></div>
          <div><span>YOUR CHAMPION</span><strong>{championRolling ? 'Rolling…' : challenge.champion.name}</strong></div>
        </div>}
      </div>

      <div className="party-result-toolbar">
        <div className="party-result-tabs" role="group" aria-label="Party results view">
          <button type="button" aria-pressed={tab === 'mine'} onClick={() => { setTab('mine'); arcade.play('tap') }}><Zap size={16} /> My Build</button>
          <button type="button" aria-pressed={tab === 'team'} disabled={busy} onClick={() => { setTab('team'); arcade.play('tap') }}><Users size={16} /> The Whole Circus</button>
        </div>
        {host && <button type="button" className="small-button share-button" disabled={locked || !connected}
          onClick={() => { send({ type: 'next', roundId: round.id }); arcade.play('confirm') }}><RotateCw size={16} /> Run It Back</button>}
      </div>

      {!showTeam && readyBuild && <div className="party-allowance" aria-live="polite">
        <Gauge size={18} />
        <motion.strong key={String(readyBuild.remaining)} initial={reducedMotion ? false : { y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}>{allowanceLabel(readyBuild.remaining)}</motion.strong>
        <span>{readyBuild.remaining === 0 ? 'YOU’RE STUCK WITH IT.' : readyBuild.remaining === null ? 'Unlimited item rerolls' : 'Item rerolls remaining'}</span>
        {pending && <small>Requesting reroll…</small>}
        {readyBuild.lastReroll?.vetoBy && <small><LockKeyhole size={13} aria-hidden="true" /> {readyBuild.lastReroll.vetoBy} vetoed slot {readyBuild.lastReroll.index + 1}</small>}
      </div>}

      {!showTeam && challenge && <Loadout challenge={challenge} arcade={arcade} showHeading={false} compact={compact} reducedMotion={reducedMotion}
        onItemReroll={rerollItem} itemLocked={locked || !connected || Boolean(pending) || readyBuild?.remaining === 0}
        lockedItemSlots={readyBuild?.lockedItemSlots} />}
      {!showTeam && !readyBuild && <p className="party-results-note">Your build will appear when the host rolls the next round.</p>}

      {showTeam && canInspect && snapshot.rules.friendlyFire && readyBuild && (
        <div className="party-friendly-fire" aria-live="polite">
          <Swords size={18} aria-hidden="true" />
          <strong>Friendly Fire</strong>
          <span>{vetoUsed ? 'Veto spent.' : vetoPending ? 'Sending veto…' : 'You have one veto. Replace a teammate’s item and lock its slot for this round.'}</span>
        </div>
      )}
      {showTeam && (canInspect ? <Circus snapshot={snapshot} builds={rosterBuilds} playerId={playerId} onInspect={setInspected}
        onVeto={canVeto ? vetoItem : undefined} /> :
        <p className="party-results-note">The circus is rolling. Team builds will appear in a moment.</p>)}
      {showTeam && inspectedBuild && <Modal title={inspectedBuild.build.nickname + '’s Build'} wide onClose={() => setInspected(undefined)}>
        <div className="party-inspection">
          <p className="party-results-note">{inspectedBuild.challenge.champion.name} · {allowanceLabel(inspectedBuild.build.remaining)} item rerolls remaining</p>
          <Loadout challenge={inspectedBuild.challenge} arcade={arcade} showHeading={false} compact={compact} reducedMotion={reducedMotion}
            lockedItemSlots={inspectedBuild.build.lockedItemSlots} />
        </div>
      </Modal>}
    </section>
  )
}

type CircusBuild = { id: string; build: PartyBuild; challenge: Challenge }

function Circus({ snapshot, builds, playerId, onInspect, onVeto }: {
  snapshot: PartySnapshot
  builds: CircusBuild[]
  playerId: string | null
  onInspect: (id: string) => void
  onVeto?: (targetId: string, index: number, itemId: string) => void
}) {
  const itemCounts = new Map<string, number>()
  for (const { challenge } of builds) {
    for (const { name } of challenge.items) itemCounts.set(name, (itemCounts.get(name) ?? 0) + 1)
  }
  const common = Array.from(itemCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const mostFrequent = common[0]?.[1] > 1 ? common[0][0] + ' ×' + common[0][1] : 'No repeats'
  return (
    <>
      <dl className="party-stats">
        <div><dt>Rerolls used</dt><dd>{builds.reduce((sum, entry) => sum + entry.build.used, 0)}</dd></div>
        <div><dt>Players out of rerolls</dt><dd>{builds.filter(({ build }) => build.remaining === 0).length}</dd></div>
        <div><dt>Most frequent item</dt><dd>{mostFrequent}</dd></div>
      </dl>
      <div className="party-circus">
        {builds.map(({ id, build, challenge }) => {
          const veto = id !== playerId && snapshot.players.some(member => member.id === id && member.connected) ? onVeto : undefined
          return (
            <article key={id} className="board-panel party-circus-card">
              <div className="party-circus-heading">
                <Art src={challenge.champion.portrait} />
                <div><h2>{id === snapshot.hostId && <Crown size={15} aria-label="Host" />} {build.nickname}</h2><p>{challenge.champion.name}</p></div>
                <span className="party-circus-allowance" title="Item rerolls remaining"><Gauge size={14} /> {allowanceLabel(build.remaining)}</span>
              </div>
              <ol className="party-team-items" aria-label="Purchase order">{challenge.items.map((item, index) => {
                const slotLocked = Boolean(build.lockedItemSlots?.includes(index))
                return (
                  <li key={index}>
                    <div className="party-team-item-art" title={item.name + (slotLocked ? ' · Locked for this round' : '')} data-locked={slotLocked || undefined}>
                      <Art src={item.icon} alt={item.name} />
                      {slotLocked && <span className="party-team-lock" role="img" aria-label="Locked for this round"><LockKeyhole size={13} /></span>}
                    </div>
                    {veto && !slotLocked && <button type="button" className="party-veto"
                      aria-label={`Veto ${build.nickname}’s ${item.name}`}
                      onClick={() => veto(id, index, item.id)}>Veto</button>}
                  </li>
                )
              })}</ol>
              <div className="party-circus-footer">
                <div className="party-team-spells" aria-label="Summoner spells">{challenge.spells.map(spell => <Art key={spell.id} src={spell.icon} alt={spell.name} />)}</div>
                <button type="button" className="small-button" onClick={() => onInspect(id)}><Eye size={15} /> Inspect build</button>
              </div>
            </article>
          )
        })}
      </div>
      {snapshot.players.some(player => !snapshot.round?.builds[player.id]) &&
        <p className="party-results-note"><Sparkles size={15} /> Players who joined late or missed the roll will play in the next round.</p>}
    </>
  )
}
