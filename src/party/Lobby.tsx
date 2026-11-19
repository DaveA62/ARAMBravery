import {
  Check, ChevronDown, CircleHelp, Clover, Copy, Crown, Dices, DoorOpen, History,
  Link2, LoaderCircle, LogOut, Radio, RefreshCw, Settings2, ShieldAlert, Sparkles, UserRound,
  UserRoundPlus, UsersRound, WifiOff, X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { ArcadeSound } from '../arcade'
import { champions } from '../data'
import type { Mode } from '../domain'
import { Art, ChampionPicker, Modal, copyText } from '../ui'
import { ManualConnect } from './ManualConnect'
import type { ManualRole } from './ManualConnect'
import type { useParty } from './network'
import {
  MAX_PLAYERS, normalizeCode, normalizeNickname, partyInvite, validCode, validNickname,
} from './protocol'
import type { Allowance, PartyPlayer, PartySnapshot } from './protocol'
import type { PartyLink } from './transport'
import './lobby.css'

type PartySession = ReturnType<typeof useParty>
type Props = {
  party: PartySession
  initialCode: string
  play: (sound: ArcadeSound) => void
  onSolo: () => void
}

const byChampion = new Map(champions.map(champion => [champion.id, champion]))
const allowances: Allowance[] = [0, 1, 2, 3, 5, null]
const displayStatus: Record<PartySession['status'], string> = {
  idle: 'Offline',
  connecting: 'Connecting',
  hosting: 'Hosting',
  joined: 'Connected',
  reconnecting: 'Reconnecting',
  error: 'Connection failed',
  disconnected: 'Disconnected',
}

function ConnectionPill({ party }: { party: PartySession }) {
  const { status, method } = party
  const live = status === 'hosting' || status === 'joined'
  const pending = status === 'connecting' || status === 'reconnecting'
  const error = status === 'error' || status === 'disconnected'
  const Icon = pending ? LoaderCircle : error ? WifiOff : Radio
  return (
    <span role="status" className="party-status" data-tone={live ? 'live' : pending ? 'pending' : error ? 'error' : undefined}>
      <Icon className={pending ? 'party-spin' : undefined} size={13} aria-hidden="true" />
      {displayStatus[status]}{live && method === 'manual' ? ' · Direct' : ''}
    </span>
  )
}

function PlayerCard({ player, hostId, ownId }: { player: PartyPlayer; hostId: string; ownId: string | null }) {
  const isHost = player.id === hostId
  const champion = player.championId ? byChampion.get(player.championId) : undefined
  return (
    <li className="party-player" data-host={isHost || undefined}
      data-ready={player.connected && player.ready || undefined} data-disconnected={!player.connected || undefined}>
      <span className="party-player__badge" aria-hidden="true">
        {champion ? <Art src={champion.portrait} /> : <span className="party-player__mystery">?</span>}
      </span>
      <div className="party-player__details">
        <span className="party-player__name">
          {player.nickname}{isHost && <Crown size={15} role="img" aria-label="Host" />}
          {player.id === ownId && <span className="party-player__you">You</span>}
        </span>
        <span className="party-player__champion">{champion?.name ?? 'Random champion'}</span>
        <span className="party-player__state">
          {!player.connected ? <><WifiOff size={13} aria-hidden="true" /> Disconnected</> :
            player.ready ? <><Check size={14} aria-hidden="true" /> Ready</> : 'Not ready'}
        </span>
      </div>
    </li>
  )
}

function Roster({ snapshot, ownId }: { snapshot: PartySnapshot; ownId: string | null }) {
  const players = snapshot.players
  const connected = players.filter(player => player.connected).length
  return (
    <section className="party-panel" aria-labelledby="party-roster-title">
      <div className="party-panel__heading">
        <div><h2 id="party-roster-title"><UsersRound size={23} aria-hidden="true" /> Players</h2></div>
        <span className="party-status">{connected} / {MAX_PLAYERS} connected</span>
      </div>
      <ul className="party-roster">
        {players.map(player => <PlayerCard key={player.id} player={player} hostId={snapshot.hostId} ownId={ownId} />)}
        {Array.from({ length: MAX_PLAYERS - players.length }, (_, index) => (
          <li className="party-player party-player--empty" key={index}>
            <span className="party-player__badge" aria-hidden="true"><UserRoundPlus size={18} /></span>
            <span className="party-player__champion party-player__vacant">WAITING FOR VICTIM…</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Activity({ entries }: { entries: PartySnapshot['activity'] }) {
  const newestFirst = [...entries].sort((a, b) => b.id - a.id)
  return entries.length ? (
    <ul className="party-activity" aria-label="Party activity" role="log">
      {newestFirst.map(entry => <li key={entry.id}><Sparkles size={14} aria-hidden="true" /><span>{entry.text}</span></li>)}
    </ul>
  ) : <p className="party-muted">Activity will appear here as players join and roll.</p>
}

export function PartyLobby({ party, initialCode, play, onSolo }: Props) {
  const [nickname, setNickname] = useState(party.nickname)
  const [roomCode, setRoomCode] = useState(() => normalizeCode(initialCode))
  const [dialog, setDialog] = useState<'champion' | 'nickname' | null>(null)
  const [copyStatus, setCopyStatus] = useState('')
  const [showInvite, setShowInvite] = useState(false)
  const backup = useRef<HTMLDetailsElement>(null)
  const { snapshot, playerId, role, status, method } = party
  const code = snapshot?.code ?? party.inviteCode
  const isHost = Boolean(snapshot && playerId === snapshot.hostId)
  const isLive = status === 'hosting' || status === 'joined'
  const busy = status === 'connecting' || status === 'reconnecting'
  const awaitingRound = Boolean(snapshot?.round && playerId && !Object.hasOwn(snapshot.round.builds, playerId))
  const inRound = Boolean(snapshot?.round)
  const ownPlayer = snapshot?.players.find(player => player.id === playerId)
  const canEdit = isLive && Boolean(ownPlayer?.connected) && !inRound
  const validName = validNickname(nickname)
  const validRoom = validCode(roomCode)
  const invite = validCode(code) ? partyInvite(code) : ''
  const manualHost = method === 'manual' && role === 'host'
  const manualGuestReconnect = method === 'manual' && role === 'guest' && !isLive && Boolean(snapshot)
  const showBackup = !snapshot || manualHost || manualGuestReconnect
  const connectedPlayers = snapshot?.players.filter(player => player.connected) ?? []
  const readyCount = connectedPlayers.filter(player => player.ready).length
  const canRoll = canEdit && isHost && connectedPlayers.length > 0 && readyCount === connectedPlayers.length

  useEffect(() => {
    if (!backup.current) return
    if ((status === 'error' && method === 'online') || method === 'manual') backup.current.open = true
  }, [method, status])

  function formatName() {
    const normalized = normalizeNickname(nickname)
    setNickname(normalized)
    return normalized
  }

  function createRoom() {
    if (!validName || busy) return
    play('tap')
    party.hostRoom(formatName())
  }

  function joinRoom(event: FormEvent) {
    event.preventDefault()
    if (!validName || !validRoom || busy) return
    play('tap')
    party.joinRoom(roomCode, formatName())
  }

  function directRoom() {
    if (!validName || busy) return
    play('tap')
    party.hostManual(formatName())
  }

  function directConnect(link: PartyLink, kind: ManualRole) {
    if (kind === 'host') {
      party.attachManualHost(link)
    } else {
      const reconnectCode = manualGuestReconnect ? code : roomCode
      const reconnectName = manualGuestReconnect ? party.nickname : formatName()
      party.joinManual(reconnectCode, reconnectName, link)
    }
  }

  function leave() {
    setCopyStatus('')
    setShowInvite(false)
    setDialog(null)
    party.leaveRoom()
    play('tap')
  }

  async function copyInvite(kind: 'link' | 'code') {
    try {
      await copyText(kind === 'link' ? invite : code)
      setCopyStatus(kind === 'link' ? 'Invite link copied.' : 'Party code copied.')
      setShowInvite(false)
      play('copy')
    } catch {
      setShowInvite(true)
      setCopyStatus('Select the link or party code to copy it manually.')
    }
  }

  function rename(event: FormEvent) {
    event.preventDefault()
    if (!validName || !canEdit) return
    party.send({ type: 'nickname', nickname: formatName() })
    play('confirm')
    setDialog(null)
  }

  function selectChampion(championId?: string) {
    if (!canEdit) return
    party.send({ type: 'champion', championId })
    play('confirm')
    setDialog(null)
  }

  const pendingManualGuest = method === 'manual' && role === 'guest' && !snapshot
  const Heading = inRound ? 'h2' : 'h1'

  return (
    <section className="party-lobby" aria-label="Party lobby">
      <div className={'party-banner' + (inRound ? ' party-banner--compact' : '')}>
        <span className="party-banner__ornament" aria-hidden="true"><UsersRound size={78} strokeWidth={1} /></span>
        <div className="shell party-banner__content">
          <div>
            <Heading className="party-banner__title">Party <em>Lobby</em></Heading>
            {!inRound && <p className="party-banner__description">Invite up to four friends and roll your Mayhem builds together.</p>}
          </div>
          <button type="button" className="party-btn party-banner__solo" onClick={onSolo}>
            <DoorOpen size={16} aria-hidden="true" /> Solo
          </button>
        </div>
      </div>
      <div className="shell party-workspace">
        {party.error && (
          <div className="party-panel__notice" role="alert" data-error>
            <ShieldAlert size={17} aria-hidden="true" /><span>{party.error}</span>
            <button type="button" className="party-notice-dismiss" aria-label="Dismiss party message" onClick={party.clearError}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )}

        {snapshot ? (
          <>
            <section className="party-panel" aria-label="Party connection">
              <div className="party-room-banner">
                <div className="party-room-banner__identity">
                  <div className="party-room-banner__code">
                    <Radio size={26} aria-hidden="true" />
                    <div><small>Party code</small><strong>{snapshot.code}</strong></div>
                  </div>
                  <ConnectionPill party={party} />
                </div>
                <div className="party-room-banner__actions">
                  <button type="button" className="party-btn party-btn--primary" disabled={!invite}
                    onClick={() => void copyInvite('link')}><Link2 size={16} aria-hidden="true" /> Copy invite</button>
                  <button type="button" className="party-btn" onClick={() => void copyInvite('code')}><Copy size={15} aria-hidden="true" /> Copy code</button>
                  {!isLive && !busy && method === 'online' && (
                    <button type="button" className="party-btn" onClick={party.reconnect}><RefreshCw size={15} aria-hidden="true" /> Reconnect</button>
                  )}
                  <button type="button" className="party-btn party-btn--leave" onClick={leave}>
                    <LogOut size={15} aria-hidden="true" /> Leave party
                  </button>
                </div>
              </div>
              {showInvite && <label className="party-field">Invite link
                <input value={invite} readOnly onFocus={event => event.target.select()} />
              </label>}
              {copyStatus && <p className="party-muted" role="status">{copyStatus}</p>}
              {awaitingRound && <p className="party-panel__notice" role="status">You’ll roll with the party next round.</p>}
            </section>
            {inRound ? (
              <details className="party-manual party-activity-compact">
                <summary>Party activity <ChevronDown size={15} aria-hidden="true" /></summary>
                <div className="party-manual__body"><Activity entries={snapshot.activity} /></div>
              </details>
            ) : (
              <div className="party-workspace__columns">
                <div className="party-workspace__stack">
                  <Roster snapshot={snapshot} ownId={playerId} />
                  <section className="party-panel" aria-labelledby="party-ready-title">
                    <div className="party-panel__heading">
                      <div><h2 id="party-ready-title"><Dices size={22} aria-hidden="true" /> Your Roll</h2></div>
                      <span className="party-status">{readyCount} / {connectedPlayers.length} ready</span>
                    </div>
                    <div className="party-controls" role="group" aria-label="Your champion">
                      <button type="button" className="party-btn" disabled={!canEdit} aria-pressed={!ownPlayer?.championId}
                        onClick={() => selectChampion()}><Dices size={16} aria-hidden="true" /> Random champion</button>
                      <button type="button" className="party-btn" disabled={!canEdit} aria-pressed={Boolean(ownPlayer?.championId)}
                        onClick={() => setDialog('champion')}><UserRound size={16} aria-hidden="true" />
                        {ownPlayer?.championId ? byChampion.get(ownPlayer.championId)?.name ?? 'Select champion' : 'Select champion'}
                      </button>
                      <button type="button" className="party-btn" disabled={!canEdit} onClick={() => {
                        setNickname(ownPlayer?.nickname ?? nickname)
                        setDialog('nickname')
                      }}>Edit nickname</button>
                    </div>
                    <div className="party-controls party-controls--ready">
                      <button type="button" className={'party-btn' + (ownPlayer?.ready ? '' : ' party-btn--primary')}
                        aria-pressed={Boolean(ownPlayer?.ready)} disabled={!canEdit} onClick={() => {
                          party.send({ type: 'ready', ready: !ownPlayer?.ready })
                          play('confirm')
                        }}><Check size={17} aria-hidden="true" /> {ownPlayer?.ready ? 'Unready' : 'Ready up'}</button>
                      {isHost && <button type="button" className="party-btn party-btn--gold party-btn--roll"
                        disabled={!canRoll} onClick={() => { party.send({ type: 'roll' }); play('tap') }}>
                        <Clover size={22} aria-hidden="true" /> ROLL THE WHOLE DAMN TEAM
                      </button>}
                      <p className="party-muted">
                        {isHost
                          ? canRoll ? 'Everyone connected is ready.' : 'All connected players must ready up to roll.'
                          : 'The host starts the roll after everyone connected is ready.'}
                      </p>
                    </div>
                  </section>
                </div>
                <div className="party-workspace__stack">
                  <section className="party-panel" aria-labelledby="party-settings-title">
                    <div className="party-panel__heading">
                      <div>
                        <h2 id="party-settings-title"><Settings2 size={20} aria-hidden="true" /> Party Rules</h2>
                        <p>{isHost ? 'Set the mode and item rerolls for every player.' : 'The host sets the mode and item rerolls.'}</p>
                      </div>
                    </div>
                    <div className="party-settings__fields">
                      <label className="party-field"><span>Randomness mode</span>
                        <select aria-label="Randomness mode" value={snapshot.rules.mode} disabled={!isHost || !canEdit}
                          onChange={event => {
                            party.send({ type: 'settings', rules: { ...snapshot.rules, mode: event.target.value as Mode } })
                            play('mode')
                          }}>
                          <option value="little">A Little Bullshit</option>
                          <option value="straight">Straight Bullshit</option>
                        </select>
                      </label>
                      <label className="party-field"><span>Item rerolls per player</span>
                        <select aria-label="Item rerolls per player" value={snapshot.rules.allowance ?? 'unlimited'} disabled={!isHost || !canEdit}
                          onChange={event => {
                            const value = event.target.value
                            const allowance = allowances.find(option => String(option ?? 'unlimited') === value)
                            if (allowance === undefined) return
                            party.send({ type: 'settings', rules: { ...snapshot.rules, allowance } })
                            play('confirm')
                          }}>
                          {allowances.map(option => <option key={option ?? 'unlimited'}
                            value={option ?? 'unlimited'}>{option ?? 'Unlimited'}</option>)}
                        </select>
                      </label>
                    </div>
                  </section>
                  <section className="party-panel" aria-labelledby="party-activity-title">
                    <div className="party-panel__heading">
                      <div><h2 id="party-activity-title"><History size={21} aria-hidden="true" /> Activity</h2></div>
                    </div>
                    <Activity entries={snapshot.activity} />
                  </section>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="party-workspace__columns">
            <section className="party-panel" aria-labelledby="party-entry-title">
              <div className="party-panel__heading">
                <div><h2 id="party-entry-title"><UsersRound size={23} aria-hidden="true" /> Create or Join</h2></div>
                {status !== 'idle' && <ConnectionPill party={party} />}
              </div>
              <form className="party-room-entry" onSubmit={joinRoom}>
                <label className="party-field">Nickname
                  <input autoComplete="nickname" type="text" placeholder="Your display name" maxLength={40}
                    aria-describedby="party-nickname-help" value={nickname} onChange={event => setNickname(event.target.value)} disabled={busy} />
                </label>
                <p className="party-muted party-name-helper" id="party-nickname-help">Use 2–20 characters.</p>
                <div className="party-room-entry__actions">
                  <button type="button" className="party-btn party-btn--gold" disabled={busy || !validName}
                    onClick={createRoom}><Sparkles size={17} aria-hidden="true" /> Create party</button>
                  <div className="party-room-entry__join">
                    <label className="party-field">Party code
                      <input type="text" className="party-field__code" autoComplete="off" autoCapitalize="characters" spellCheck={false}
                        placeholder="6 characters" maxLength={6} value={roomCode}
                        onChange={event => setRoomCode(normalizeCode(event.target.value))} disabled={busy} />
                    </label>
                    <button type="submit" className="party-btn party-btn--primary" disabled={busy || !validName || !validRoom}>Join party</button>
                  </div>
                </div>
              </form>
              {busy && <button type="button" className="party-btn party-btn--leave" onClick={leave}>Cancel connection</button>}
              {status === 'disconnected' && <button type="button" className="party-btn" onClick={leave}>Return to lobby menu</button>}
            </section>
            <section className="party-panel party-intro" aria-labelledby="party-intro-title">
              <div className="party-panel__heading">
                <div><h2 id="party-intro-title"><CircleHelp size={22} aria-hidden="true" /> How to Play</h2></div>
              </div>
              <ul className="party-intro__list">
                <li><Link2 size={17} aria-hidden="true" /> Create a party and send your friends the invite link or party code.</li>
                <li><Check size={17} aria-hidden="true" /> Pick a champion or leave it random, then ready up.</li>
                <li><Dices size={17} aria-hidden="true" /> The host rolls everyone’s build at once. Each player gets their own challenge.</li>
              </ul>
            </section>
          </div>
        )}

        {showBackup && (
          <details className="party-manual" ref={backup}>
            <summary>Direct connection <ChevronDown size={15} aria-hidden="true" /></summary>
            <div className="party-manual__body party-manual__layout">
              {manualHost ? (
                <p className="party-muted">Send the party code and one offer to each friend, then accept each answer separately.</p>
              ) : manualGuestReconnect ? (
                <p className="party-muted">Ask the host for a fresh offer and exchange codes to reconnect.</p>
              ) : (
                <>
                  <p className="party-muted">If the regular connection fails, create a direct party or enter your friend’s party code above.</p>
                  <div><button type="button" className="party-btn" disabled={!validName || busy} onClick={directRoom}>
                    <Radio size={16} aria-hidden="true" /> Create direct party
                  </button></div>
                </>
              )}
              <ManualConnect key={manualHost ? code : 'guest'} role={manualHost ? 'host' : 'guest'}
                disabled={manualHost ? connectedPlayers.length >= MAX_PLAYERS
                  : !manualGuestReconnect && (!validName || !validRoom || busy && !pendingManualGuest)}
                onLink={directConnect} />
            </div>
          </details>
        )}
      </div>

      {dialog === 'champion' && canEdit && (
        <Modal title="Select Champion" wide onClose={() => setDialog(null)}>
          <ChampionPicker selected={ownPlayer?.championId} onSelect={champion => selectChampion(champion.id)} />
        </Modal>
      )}
      {dialog === 'nickname' && canEdit && (
        <Modal title="Edit Nickname" onClose={() => setDialog(null)}>
          <form className="dialog-content party-nickname-edit" onSubmit={rename}>
            <label className="party-field">Nickname
              <input autoComplete="nickname" type="text" value={nickname} maxLength={40}
                onChange={event => setNickname(event.target.value)} autoFocus />
            </label>
            <button type="submit" className="party-btn party-btn--primary" disabled={!validName}>Save nickname</button>
          </form>
        </Modal>
      )}
    </section>
  )
}
