import { champions } from '../data'
import { generateChallenge, newSeed, rerollChallenge, type Challenge } from '../domain'
import {
  COUNTDOWN, MAX_PLAYERS, PARTY_VERSION, RECONNECT_GRACE, ROLL_LOCK,
  normalizeCode, normalizeNickname, validCode, validNickname,
  type Allowance, type PartyAction, type PartyBuild, type PartyPlayer, type PartyRound,
  type PartyRules, type PartySnapshot,
} from './protocol'

const MAX_HISTORY = 8
const MAX_ACTIVITY = 12
const championIds = new Set(champions.map(({ id }) => id))
const allowances = new Set<Allowance>([0, 1, 2, 3, 5, null])

interface Identity {
  playerId: string
  token: string
}
interface Session extends Identity {
  disconnectedAt?: number
}
type Admission = ({ ok: true } & Identity) | { ok: false; error: string }
type Outcome = { ok: true; changed: boolean } | { ok: false; error: string }

export interface PartyAuthorityOptions {
  now?: () => number
  createId?: () => string
  createToken?: () => string
  createSeed?: () => string
}

export interface PartyAuthorityCheckpoint {
  version: string
  snapshot: PartySnapshot
  sessions: Session[]
  history: PartyRound[]
  rerollRequests: [playerId: string, requestIds: string[]][]
}

const changed = { ok: true, changed: true } as const
const unchanged = { ok: true, changed: false } as const
const reject = (error: string) => ({ ok: false, error } as const)
const privateToken = () => globalThis.crypto.randomUUID()
const nicknameKey = (value: string) => normalizeNickname(value).toUpperCase()
const validToken = (token: unknown): token is string =>
  typeof token === 'string' && token.length >= 16 && token.length <= 128 && /^[A-Za-z0-9_-]+$/.test(token)

function validRules(rules: unknown): rules is PartyRules {
  if (!rules || typeof rules !== 'object' || !('mode' in rules) || !('allowance' in rules)) return false
  return (rules.mode === 'little' || rules.mode === 'straight') && allowances.has(rules.allowance as Allowance)
}

export class PartyAuthority {
  private state: PartySnapshot
  private readonly sessions = new Map<string, Session>()
  private readonly history: PartyRound[] = []
  private readonly rerollRequests = new Map<string, Set<string>>()
  private readonly challenges = new Map<string, Challenge>()
  private readonly now: () => number
  private readonly createId: () => string
  private readonly createToken: () => string
  private readonly createSeed: () => string

  constructor(code: string, nickname: string, options: PartyAuthorityOptions = {}) {
    if (!validCode(code)) throw new Error('Enter a valid six-character party code.')
    if (!validNickname(nickname)) throw new Error('Use a nickname with 2 to 20 characters.')
    this.now = options.now ?? Date.now
    this.createId = options.createId ?? privateToken
    this.createToken = options.createToken ?? privateToken
    this.createSeed = options.createSeed ?? newSeed

    const hostId = this.createId()
    const host = { id: hostId, nickname: normalizeNickname(nickname), connected: true, ready: false }
    this.state = {
      code: normalizeCode(code),
      revision: 0,
      hostId,
      rules: { mode: 'little', allowance: 2 },
      players: [host],
      round: null,
      activity: [{ id: 1, text: `${host.nickname} opened the party.` }],
    }
    this.sessions.set(hostId, { playerId: hostId, token: this.createToken() })
  }

  get hostIdentity(): Identity {
    const { playerId, token } = this.sessions.get(this.state.hostId)!
    return { playerId, token }
  }

  snapshot(): PartySnapshot {
    return structuredClone(this.state)
  }

  checkpoint(): PartyAuthorityCheckpoint {
    return structuredClone({
      version: PARTY_VERSION,
      snapshot: this.state,
      sessions: [...this.sessions.values()],
      history: this.history,
      rerollRequests: [...this.rerollRequests].map(([playerId, ids]) => [playerId, [...ids]] as [string, string[]]),
    })
  }

  static resume(checkpoint: PartyAuthorityCheckpoint, options: PartyAuthorityOptions = {}): PartyAuthority {
    if (checkpoint?.version !== PARTY_VERSION) throw new Error('The saved party uses an unsupported version.')
    const saved = structuredClone(checkpoint)
    const { snapshot, sessions, history, rerollRequests } = saved
    const host = snapshot?.players?.find(({ id }) => id === snapshot.hostId)
    if (!host || !validRules(snapshot.rules) || !Array.isArray(sessions) ||
        !Array.isArray(history) || !Array.isArray(rerollRequests) || snapshot.players.length > MAX_PLAYERS ||
        !snapshot.players.every((player) => sessions.some((session) => session.playerId === player.id && validToken(session.token)))) {
      throw new Error('The saved party is incomplete.')
    }
    const authority = new PartyAuthority(snapshot.code, host.nickname, options)
    const time = authority.now()
    const keep = sessions.filter((session) => session.playerId === host.id ||
      session.disconnectedAt === undefined || time - session.disconnectedAt < RECONNECT_GRACE)
    authority.sessions.clear()
    for (const session of keep) {
      authority.sessions.set(session.playerId, {
        ...session,
        disconnectedAt: session.playerId === host.id ? undefined : session.disconnectedAt ?? time,
      })
    }
    authority.state = {
      code: snapshot.code,
      revision: snapshot.revision,
      hostId: snapshot.hostId,
      rules: snapshot.rules,
      players: snapshot.players.filter((player) => authority.sessions.has(player.id))
        .map((player) => ({ ...player, connected: player.id === host.id })),
      round: snapshot.round,
      activity: snapshot.activity,
    }
    authority.history.push(...history.slice(-MAX_HISTORY))
    for (const [playerId, ids] of rerollRequests) authority.rerollRequests.set(playerId, new Set(ids))
    for (const [playerId, build] of Object.entries(snapshot.round?.builds ?? {})) {
      authority.challenges.set(playerId, generateChallenge(build.config))
    }
    authority.record(`${host.nickname} reconnected as host.`)
    return authority
  }

  admit({ nickname, token, resumeOnly = false }: { nickname: string; token?: string; resumeOnly?: boolean }): Admission {
    this.prune()
    if (token !== undefined && !validToken(token)) return reject('Invalid party identity. Reopen the invite and try again.')

    const session = token ? [...this.sessions.values()].find((entry) => entry.token === token) : undefined
    if (session) {
      if (session.playerId === this.state.hostId) return reject('This identity belongs to the party host.')
      if (session.disconnectedAt !== undefined) {
        const player = this.player(session.playerId)!
        session.disconnectedAt = undefined
        this.updatePlayer(player.id, { connected: true }, `${player.nickname} reconnected.`)
      }
      return { ok: true, playerId: session.playerId, token: session.token }
    }

    if (resumeOnly) return reject('Your reserved seat expired. Join again for a seat in the next round.')
    if (typeof nickname !== 'string' || !validNickname(nickname)) return reject('Use a nickname with 2 to 20 characters.')
    const name = normalizeNickname(nickname)
    if (this.nicknameTaken(name)) return reject('That nickname is already in this party.')
    if (this.state.players.length >= MAX_PLAYERS) return reject('This party is full.')

    const playerId = this.createId()
    const identity = { playerId, token: token ?? this.createToken() }
    this.sessions.set(playerId, identity)
    this.state.players.push({ id: playerId, nickname: name, ready: false, connected: true })
    this.record(this.state.round ? `${name} joined and will play the next round.` : `${name} joined the party.`)
    return { ok: true, ...identity }
  }

  disconnect(playerId: string): boolean {
    if (playerId === this.state.hostId) return false
    const session = this.sessions.get(playerId)
    const player = this.player(playerId)
    if (!session || !player?.connected) return false
    session.disconnectedAt = this.now()
    this.updatePlayer(playerId, { connected: false }, `${player.nickname} disconnected. Their seat is reserved briefly.`)
    return true
  }

  leave(playerId: string): boolean {
    if (playerId === this.state.hostId) return false
    const player = this.player(playerId)
    if (!player) return false
    this.removePlayers([playerId])
    this.record(`${player.nickname} left the party.`)
    return true
  }

  prune(): boolean {
    const now = this.now()
    const expired = [...this.sessions.values()].filter(({ disconnectedAt }) =>
      disconnectedAt !== undefined && now - disconnectedAt >= RECONNECT_GRACE)
    if (!expired.length) return false
    const names = expired.map(({ playerId }) => this.player(playerId)!.nickname)
    this.removePlayers(expired.map(({ playerId }) => playerId))
    this.record(`${names.join(', ')} ${names.length === 1 ? 'lost their reserved seat' : 'lost their reserved seats'}.`)
    return true
  }

  dispatch(playerId: string, action: PartyAction): Outcome {
    const player = this.player(playerId)
    if (!player?.connected) return reject('Your connection to the party has ended.')
    if (!action || typeof action !== 'object') return reject('Unknown party action.')
    const host = playerId === this.state.hostId
    const { round } = this.state

    switch (action.type) {
      case 'nickname': {
        if (round) return reject('Nicknames can change in the lobby between rounds.')
        if (typeof action.nickname !== 'string' || !validNickname(action.nickname)) return reject('Use a nickname with 2 to 20 characters.')
        const nickname = normalizeNickname(action.nickname)
        if (this.nicknameTaken(nickname, playerId)) return reject('That nickname is already in this party.')
        if (nickname === player.nickname) return unchanged
        this.updatePlayer(playerId, { nickname }, `${player.nickname} is now ${nickname}.`)
        return changed
      }

      case 'champion': {
        if (round) return reject('Champion selection opens for the next round.')
        if (action.championId !== undefined && !championIds.has(action.championId)) return reject('This champion is unavailable.')
        if (player.championId === action.championId) return unchanged
        this.updatePlayer(playerId, { championId: action.championId, ready: false })
        return changed
      }

      case 'ready': {
        if (round) return reject('Get ready when the next lobby opens.')
        if (typeof action.ready !== 'boolean') return reject('Invalid ready state.')
        if (player.ready === action.ready) return unchanged
        this.updatePlayer(playerId, { ready: action.ready }, player.nickname + (action.ready ? ' is ready for disaster.' : ' is no longer ready.'))
        return changed
      }

      case 'settings': {
        if (!host) return reject('Only the host can change the rules.')
        if (round) return reject('Rules can change in the lobby between rounds.')
        if (!validRules(action.rules)) return reject('Choose a supported chaos mode and item reroll allowance.')
        if (action.rules.mode === this.state.rules.mode && action.rules.allowance === this.state.rules.allowance) return unchanged
        const modeChanged = this.state.rules.mode !== action.rules.mode
        this.state.rules = { mode: action.rules.mode, allowance: action.rules.allowance }
        this.state.players = this.state.players.map(member => ({ ...member, ready: false }))
        const rule = modeChanged ? (action.rules.mode === 'straight' ? 'Straight Bullshit' : 'A Little Bullshit') :
          action.rules.allowance === null ? 'unlimited rerolls' : String(action.rules.allowance) + ' rerolls per player'
        this.record(player.nickname + ' set ' + rule + '.')
        return changed
      }

      case 'roll':
        if (!host) return reject('Only the host can start a roll.')
        return this.roll()

      case 'reroll':
        return this.reroll(playerId, action)

      case 'next':
        if (!host) return reject('Only the host can open the next round.')
        if (!round || action.roundId !== round.id) return reject('That round has already ended.')
        if (this.now() < round.unlockAt) return reject('Wait for the builds to lock in.')
        this.history.push(round)
        if (this.history.length > MAX_HISTORY) this.history.shift()
        this.challenges.clear()
        this.rerollRequests.clear()
        this.state.round = null
        this.state.players = this.state.players.map((member) => ({ ...member, ready: false }))
        this.record('The host opened the next lobby.')
        return changed

      default:
        return reject('Unknown party action.')
    }
  }

  private roll(): Outcome {
    if (this.state.round) return reject('Open the next lobby before rolling again.')
    const participants = this.state.players.filter((player) => player.connected)
    if (participants.some((player) => !player.ready)) return reject('Every connected player must be ready.')
    const { mode, allowance } = this.state.rules
    try {
      const roundSeed = this.createSeed()
      const generated = participants.map((player, slot) => ({ player, challenge: generateChallenge({
        seed: `${roundSeed}-${slot + 1}`,
        mode,
        championId: player.championId,
      }) }))
      const builds = Object.fromEntries(generated.map(({ player, challenge: { config } }) =>
        [player.id, { nickname: player.nickname, config, remaining: allowance, used: 0 }]))
      const startsAt = this.now() + COUNTDOWN
      const round = { id: this.createId(), startsAt, unlockAt: startsAt + ROLL_LOCK, builds }
      for (const { player, challenge } of generated) this.challenges.set(player.id, challenge)
      this.state.round = round
      this.record(`The host rolled for ${participants.length} connected ${participants.length === 1 ? 'player' : 'players'}.`)
      return changed
    } catch {
      return reject('A legal build could not be generated for every player. The lobby is still open.')
    }
  }

  private reroll(playerId: string, action: Extract<PartyAction, { type: 'reroll' }>): Outcome {
    const { round } = this.state
    if (!round || round.id !== action.roundId) return reject('That round has already ended.')
    const challenge = this.challenges.get(playerId)
    const build = round.builds[playerId]
    if (!build || !challenge) return reject('You can roll with the group in the next lobby.')
    const requests = this.rerollRequests.get(playerId)
    if (requests?.has(action.requestId)) return unchanged
    if (this.now() < round.unlockAt) return reject('Wait for the builds to lock in.')
    if (!Number.isInteger(action.index) || action.index < 0 || action.index > 5 ||
        typeof action.requestId !== 'string' || !action.requestId || action.requestId.length > 128) {
      return reject('Invalid item reroll request.')
    }
    if (build.remaining === 0) return reject('You have no item rerolls left.')

    try {
      const updated = rerollChallenge(challenge, { type: 'item', index: action.index })
      if (updated.items[action.index].id === challenge.items[action.index].id) return reject('This slot has no legal replacement.')
      const nextBuild: PartyBuild = {
        nickname: build.nickname,
        config: updated.config,
        remaining: build.remaining === null ? null : build.remaining - 1,
        used: build.used + 1,
        lastReroll: { index: action.index, requestId: action.requestId },
      }
      this.challenges.set(playerId, updated)
      round.builds[playerId] = nextBuild
      if (requests) requests.add(action.requestId)
      else this.rerollRequests.set(playerId, new Set([action.requestId]))
      this.record(build.nickname + (nextBuild.remaining === 0 ? ' burned their last reroll.' : ' burned a reroll.'))
      return changed
    } catch {
      return reject('This slot could not be rerolled.')
    }
  }

  private player(playerId: string): PartyPlayer | undefined {
    return this.state.players.find(({ id }) => id === playerId)
  }

  private nicknameTaken(nickname: string, except?: string): boolean {
    const key = nicknameKey(nickname)
    return this.state.players.some((player) => player.id !== except && nicknameKey(player.nickname) === key)
  }

  private updatePlayer(playerId: string, changes: Partial<PartyPlayer>, text?: string) {
    this.state.players = this.state.players.map((player) => player.id === playerId ? { ...player, ...changes } : player)
    this.record(text)
  }

  private removePlayers(playerIds: readonly string[]) {
    for (const playerId of playerIds) this.sessions.delete(playerId)
    this.state.players = this.state.players.filter(({ id }) => !playerIds.includes(id))
  }

  private record(text?: string) {
    this.state.revision += 1
    if (!text) return
    const id = (this.state.activity.at(-1)?.id ?? 0) + 1
    this.state.activity = [...this.state.activity, { id, text }].slice(-MAX_ACTIVITY)
  }
}
