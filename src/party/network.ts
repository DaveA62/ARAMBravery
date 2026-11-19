import { useEffect, useState, useSyncExternalStore } from 'react'
import Peer, { type DataConnection, type PeerOptions } from 'peerjs'
import { PartyAuthority } from './authority'
import {
  PARTY_VERSION,
  RECONNECT_GRACE,
  acceptSnapshot,
  generateCode,
  normalizeCode,
  normalizeNickname,
  parseClientMessage,
  parseHostMessage,
  partyPeerId,
  validCode,
  validNickname,
  type PartyAction,
  type PartyMessage,
  type PartySnapshot,
} from './protocol'
import { receivePartyMessage, sendPartyMessage, type PartyLink, type PartyLinkHandlers } from './transport'

export type PartyStatus = 'idle' | 'connecting' | 'hosting' | 'joined' | 'reconnecting' | 'error' | 'disconnected'
export type PartyState = {
  status: PartyStatus
  role: 'host' | 'guest' | null
  method: 'online' | 'manual' | null
  inviteCode: string
  nickname: string
  playerId: string | null
  snapshot: PartySnapshot | null
  error: string | null
  clockOffset: number
}

type Timer = ReturnType<typeof setTimeout>
type HostConnection = {
  link: PartyLink
  unsubscribe: () => void
  playerId?: string
  lastSeen: number
}
type GuestConnection = {
  link: PartyLink
  unsubscribe: () => void
  greeted: boolean
  lastSeen: number
  lastPing: number
}

type Room = {
  role: NonNullable<PartyState['role']>
  method: NonNullable<PartyState['method']>
  code: string
  nickname: string
  token: string
  expectedHost?: string
  authority?: PartyAuthority
  peer?: Peer
  guest?: GuestConnection
  connections: Set<HostConnection>
  deadline?: number
  retries: number
  heartbeat?: ReturnType<typeof setInterval>
  timer?: Timer
  timeout?: Timer
  bestLatency?: number
}

type StoredGuest = { role: 'guest'; code: string; nickname: string; token: string; expectedHost: string }
type StoredHost = { role: 'host'; code: string; nickname: string; authority: ReturnType<PartyAuthority['checkpoint']> }
type StoredRoom = { version: string; room: StoredGuest | StoredHost }
const sessionKey = 'mayhem.party.session.v1'
const nicknameKey = 'mayhem.party.nickname.v1'
const heartbeatInterval = 4_000
const reconnectTimeout = 10_000
const handshakeTimeout = 13_000
const silentTimeout = 23_000
const manualTimeout = 120_000
const maxCodeAttempts = 5
const peerOptions: PeerOptions = {
  config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
}

function readStorage(kind: 'localStorage' | 'sessionStorage', key: string) {
  try { return globalThis[kind]?.getItem(key) ?? null } catch { return null }
}

function writeStorage(kind: 'localStorage' | 'sessionStorage', key: string, value: string | null) {
  try {
    if (value === null) globalThis[kind]?.removeItem(key)
    else globalThis[kind]?.setItem(key, value)
  } catch { /* Storage can be blocked or full. An active room still works. */ }
}

function token() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), byte => byte.toString(16).padStart(2, '0')).join('')
}

function startingState(nickname = ''): PartyState {
  return { status: 'idle', role: null, method: null, inviteCode: '', nickname,
    playerId: null, snapshot: null, error: null, clockOffset: 0 }
}

function peerLink(connection: DataConnection): PartyLink {
  return {
    get open() { return connection.open },
    send(message) { void connection.send(message)?.catch(() => connection.close()) },
    close() { connection.close() },
    subscribe(handlers: PartyLinkHandlers) {
      let subscribed = true
      const receive = receivePartyMessage(handlers.message)
      connection.on('open', handlers.open)
      connection.on('data', receive)
      connection.on('close', handlers.close)
      connection.on('error', handlers.error)
      if (connection.open) queueMicrotask(() => { if (subscribed) handlers.open() })
      return () => {
        subscribed = false
        connection.off('open', handlers.open)
        connection.off('data', receive)
        connection.off('close', handlers.close)
        connection.off('error', handlers.error)
      }
    },
  }
}

function safeSend(link: PartyLink, message: PartyMessage) {
  if (!link.open) return false
  try { link.send(message); return true } catch { return false }
}

function safeClose(link: PartyLink) {
  try { link.close() } catch { /* A failed channel is already unusable. */ }
}

export class PartyNetwork {
  private state = startingState(readStorage('localStorage', nicknameKey) ?? '')
  private room: Room | null = null
  private listeners = new Set<() => void>()
  private pendingCloses = new Map<Timer, () => void>()

  getSnapshot = () => this.state

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private update(change: Partial<PartyState>) {
    this.state = { ...this.state, ...change }
    for (const listener of this.listeners) listener()
  }

  private setRoom(role: Room['role'], method: Room['method'], code: string, nickname: string, credential = token(), restoring = false) {
    this.release(true)
    if (!restoring) writeStorage('sessionStorage', sessionKey, null)
    const room: Room = { role, method, code, nickname, token: credential, connections: new Set(), retries: 0 }
    this.room = room
    writeStorage('localStorage', nicknameKey, nickname)
    this.update({ ...startingState(nickname), role, method, status: 'connecting', inviteCode: role === 'guest' ? code : '' })
    return room
  }

  private storeRoom(room: Room) {
    if (room.method !== 'online') return
    let stored: StoredRoom['room']
    if (room.role === 'host' && room.authority) {
      stored = { role: 'host', code: room.code, nickname: room.nickname, authority: room.authority.checkpoint() }
    } else if (room.role === 'guest' && room.expectedHost) {
      stored = { role: 'guest', code: room.code, nickname: room.nickname, expectedHost: room.expectedHost, token: room.token }
    } else {
      return
    }
    writeStorage('sessionStorage', sessionKey, JSON.stringify({ version: PARTY_VERSION, room: stored } satisfies StoredRoom))
  }

  resume = () => {
    if (this.room) return
    try {
      const stored = JSON.parse(readStorage('sessionStorage', sessionKey) ?? 'null') as StoredRoom | null
      if (!stored || stored.version !== PARTY_VERSION) return

      const saved = stored.room
      if (!validCode(saved.code) || !validNickname(saved.nickname)) return
      if (saved.role === 'host') {
        const authority = PartyAuthority.resume(saved.authority)
        if (authority.snapshot().code !== saved.code) return
        const room = this.setRoom('host', 'online', saved.code, saved.nickname, undefined, true)
        room.authority = authority
        room.deadline = Date.now() + RECONNECT_GRACE
        this.update({ status: 'reconnecting', inviteCode: room.code, playerId: authority.hostIdentity.playerId, snapshot: authority.snapshot() })
        this.startPeer(room)
      } else if (saved.role === 'guest' && /^[a-f\d]{48}$/.test(saved.token) && typeof saved.expectedHost === 'string') {
        const room = this.setRoom('guest', 'online', saved.code, saved.nickname, saved.token, true)
        room.expectedHost = saved.expectedHost
        room.deadline = Date.now() + RECONNECT_GRACE
        this.update({ status: 'reconnecting' })
        this.startPeer(room)
      }
    } catch {
      writeStorage('sessionStorage', sessionKey, null)
    }
  }

  hostRoom = (nickname: string) => {
    if (!validNickname(nickname)) {
      this.update({ error: 'Enter a nickname with 2 to 20 characters.' })
      return
    }

    const room = this.setRoom('host', 'online', generateCode(), normalizeNickname(nickname))
    this.startPeer(room)
  }

  joinRoom = (code: string, nickname: string) => {
    if (!validCode(code) || !validNickname(nickname)) {
      this.update({ error: !validCode(code) ? 'Enter a valid six-character party code.' : 'Enter a nickname with 2 to 20 characters.' })
      return
    }

    const normalized = normalizeCode(code)
    const previous = this.room
    if (previous?.role === 'guest' && previous.method === 'online' && previous.code === normalized && previous.expectedHost) {
      this.reconnect()
      return
    }

    const room = this.setRoom('guest', 'online', normalized, normalizeNickname(nickname))
    this.startPeer(room)
  }

  hostManual = (nickname: string) => {
    if (!validNickname(nickname)) throw new Error('Enter a nickname with 2 to 20 characters.')
    const normalized = normalizeNickname(nickname)
    if (this.room?.role === 'host' && this.room.method === 'manual' && this.room.nickname === normalized) return this.room.code

    const room = this.setRoom('host', 'manual', generateCode(), normalized)
    room.authority = new PartyAuthority(room.code, room.nickname)
    this.hostReady(room)
    return room.code
  }

  attachManualHost = (link: PartyLink) => {
    const room = this.room
    if (!room || room.role !== 'host' || room.method !== 'manual' || !room.authority) {
      safeClose(link)
      return
    }
    this.attachHostLink(room, link)
  }

  joinManual = (code: string, nickname: string, link: PartyLink) => {
    if (!validCode(code) || !validNickname(nickname)) {
      safeClose(link)
      this.update({ error: !validCode(code) ? 'Enter a valid six-character party code.' : 'Enter a nickname with 2 to 20 characters.' })
      return
    }

    const normalized = normalizeCode(code)
    const prior = this.room?.method === 'manual' && this.room.role === 'guest' && this.room.code === normalized ? this.room : null
    if (prior?.deadline && Date.now() >= prior.deadline) {
      safeClose(link)
      this.reconnectExpired(prior)
      return
    }
    const { snapshot, playerId, clockOffset } = this.state
    if (prior) this.release(false)
    const room = this.setRoom('guest', 'manual', normalized, normalizeNickname(nickname), prior?.token)
    room.expectedHost = prior?.expectedHost
    room.deadline = prior?.deadline
    if (prior?.expectedHost) this.update({ status: 'reconnecting', snapshot, playerId, clockOffset })
    this.attachGuestLink(room, link)
  }

  clearError = () => this.update({ error: null })

  send = (action: PartyAction) => {
    const room = this.room
    if (!room || !(this.state.status === 'hosting' || this.state.status === 'joined')) return
    this.clearError()

    if (room.authority) {
      const outcome = room.authority.dispatch(room.authority.hostIdentity.playerId, action)
      if (!outcome.ok) this.update({ error: outcome.error })
      else if (outcome.changed) this.publish(room)
      return
    }

    const guest = room.guest
    if (guest && safeSend(guest.link, { type: 'action', id: token(), action })) return
    this.onLost(room, 'The connection to the host was interrupted.')
  }

  leaveRoom = () => {
    this.release(true)
    writeStorage('sessionStorage', sessionKey, null)
    this.update(startingState(this.state.nickname))
  }

  suspend = () => {
    this.release(false)
    for (const [timer, close] of this.pendingCloses) {
      clearTimeout(timer)
      close()
    }
    this.pendingCloses.clear()
  }

  reconnect = () => {
    const room = this.room
    if (!room || room.method !== 'online' || this.state.status === 'joined' || this.state.status === 'hosting') return
    clearTimeout(room.timer)
    if (room.expectedHost || room.authority) room.deadline ??= Date.now() + RECONNECT_GRACE
    if (room.deadline && Date.now() >= room.deadline) {
      this.reconnectExpired(room)
      return
    }
    room.retries = 0
    this.update({ error: null, status: room.deadline ? 'reconnecting' : 'connecting' })
    this.startPeer(room)
  }

  private release(announce: boolean) {
    const room = this.room
    if (!room) return
    this.room = null
    clearTimeout(room.timer)
    clearTimeout(room.timeout)
    clearInterval(room.heartbeat)

    const connections = [...room.connections]
    for (const binding of connections) {
      binding.unsubscribe()
      if (announce) safeSend(binding.link, { type: 'ended', message: 'The host ended this party.' })
    }
    if (room.guest) {
      room.guest.unsubscribe()
      if (announce) safeSend(room.guest.link, { type: 'leave' })
    }
    const close = () => {
      for (const binding of connections) safeClose(binding.link)
      if (room.guest) safeClose(room.guest.link)
      room.peer?.destroy()
    }

    if (!announce || (!room.guest && connections.length === 0)) {
      close()
      return
    }

    this.closeAfterNotice(close)
  }

  private closeAfterNotice(close: () => void) {
    const timeout = setTimeout(() => { this.pendingCloses.delete(timeout); close() }, 115)
    this.pendingCloses.set(timeout, close)
  }

  private startPeer(room: Room) {
    if (this.room !== room) return
    this.clearAttempt(room)

    let peer: Peer
    try {
      peer = room.role === 'host' ? new Peer(partyPeerId(room.code), peerOptions) : new Peer(peerOptions)
    } catch {
      this.onLost(room, 'Unable to start peer connections. Try manual connection.')
      return
    }
    room.peer = peer

    const current = () => this.room === room && room.peer === peer
    const failure = (error: Error & { type?: string }) => {
      if (!current()) return
      if (error.type === 'unavailable-id' && room.role === 'host' && !room.authority) {
        if (++room.retries < maxCodeAttempts) {
          room.code = generateCode()
          this.startPeer(room)
        } else this.onLost(room, 'The signaling service could not reserve a party code. Try creating a new room or use manual connection.')
        return
      }
      if (error.type === 'peer-unavailable' && room.role === 'guest') {
        this.onLost(room, 'No live host was found for this party code. Check the code or ask the host to reopen the room.')
        return
      }

      const message = 'The online connection service could not be reached. Try again or use a manual connection.'
      if (room.role === 'host' && this.state.status === 'hosting' && error.type !== 'unavailable-id') {
        this.update({ error: message })
        return
      }
      if (room.role === 'guest' && this.state.status === 'joined') return
      this.onLost(room, message)
    }

    peer.on('error', failure)
    peer.on('connection', connection => {
      if (!current() || !room.authority || room.role !== 'host') connection.close()
      else this.attachHostLink(room, peerLink(connection))
    })
    peer.on('open', () => {
      if (!current()) return
      if (room.deadline && Date.now() >= room.deadline) {
        this.reconnectExpired(room)
        return
      }
      clearTimeout(room.timeout)
      if (room.role === 'host') {
        room.authority ??= new PartyAuthority(room.code, room.nickname)
        this.hostReady(room)
      } else if (!room.guest) {
        try {
          const connection = peer.connect(partyPeerId(room.code), { reliable: true, serialization: 'json' })
          this.attachGuestLink(room, peerLink(connection))
        } catch {
          this.onLost(room, 'Unable to connect to the host. Try again or use a manual connection.')
        }
      }
    })
    peer.on('disconnected', () => {
      if (!current() || peer.destroyed) return
      if (this.state.status !== 'hosting' && this.state.status !== 'joined') {
        this.onLost(room, 'The online connection service disconnected. Try again or use a manual connection.')
        return
      }

      // Established data channels work without the signaling broker. Reconnect
      // the broker in place so a brief outage does not interrupt a live party.
      clearTimeout(room.timer)
      room.timer = setTimeout(() => {
        if (current() && peer.disconnected && !peer.destroyed) {
          try { peer.reconnect() } catch { /* An existing data channel can still carry the room. */ }
        }
      }, 1_000)
    })
    peer.on('close', () => {
      if (current()) this.onLost(room, 'The peer connection closed.')
    })
    room.timeout = setTimeout(() => {
      if (current()) this.onLost(room, 'The online connection service did not respond. Try a manual connection.')
    }, this.attemptTimeout(room, room.deadline ? reconnectTimeout : handshakeTimeout))
  }

  private hostReady(room: Room) {
    const authority = room.authority
    if (!authority) return
    room.deadline = undefined
    room.retries = 0
    this.update({ status: 'hosting', inviteCode: room.code, playerId: authority.hostIdentity.playerId, error: null, clockOffset: 0 })
    this.publish(room)
    this.startHeartbeat(room)
  }

  private publish(room: Room) {
    const snapshot = room.authority?.snapshot()
    if (!snapshot || this.room !== room) return

    const nickname = snapshot.players.find(player => player.id === snapshot.hostId)?.nickname ?? room.nickname
    room.nickname = nickname
    writeStorage('localStorage', nicknameKey, nickname)
    this.update({ snapshot, nickname })
    this.storeRoom(room)
    for (const binding of room.connections) {
      if (binding.playerId) safeSend(binding.link, { type: 'snapshot', snapshot, now: Date.now() })
    }
  }

  private attachHostLink(room: Room, link: PartyLink) {
    const authority = room.authority
    if (!authority || room.connections.size >= 12) {
      safeClose(link)
      return
    }

    const binding: HostConnection = { link, unsubscribe: () => {}, lastSeen: Date.now() }
    room.connections.add(binding)
    const current = () => this.room === room && room.connections.has(binding)
    const reject = (message: string) => {
      safeSend(link, { type: 'error', message, fatal: true })
      // Keep the channel alive briefly so the peer can read the reason.
      room.connections.delete(binding)
      binding.unsubscribe()
      this.closeAfterNotice(() => safeClose(link))
    }
    const disconnected = () => {
      if (current()) this.dropHostLink(room, binding, 'disconnect')
    }

    binding.unsubscribe = link.subscribe({
      open: () => { binding.lastSeen = Date.now() },
      close: disconnected,
      error: disconnected,
      message: raw => {
        if (!current()) return
        const message = parseClientMessage(raw)
        if (!message) return
        binding.lastSeen = Date.now()

        if (message.type === 'hello' && !binding.playerId) {
          if (message.version !== PARTY_VERSION) {
            reject('The host and guest use different party, game data, or generator versions. Reload both pages.')
            return
          }
          const before = authority.snapshot()
          if (message.expectedHost && message.expectedHost !== before.hostId) {
            reject('This room belongs to a different host. Start a fresh join to connect.')
            return
          }
          const admitted = authority.admit({ nickname: message.nickname, token: message.token, resumeOnly: Boolean(message.expectedHost) })
          if (!admitted.ok) {
            if (authority.snapshot().revision !== before.revision) this.publish(room)
            reject(admitted.error)
            return
          }

          for (const other of room.connections) {
            if (other !== binding && other.playerId === admitted.playerId) this.dropHostLink(room, other, 'replace')
          }
          binding.playerId = admitted.playerId
          const snapshot = authority.snapshot()
          safeSend(link, { type: 'welcome', version: PARTY_VERSION, playerId: admitted.playerId, snapshot, now: Date.now() })
          this.publish(room)
          return
        }

        const playerId = binding.playerId
        if (!playerId) return
        if (message.type === 'hello' && message.version === PARTY_VERSION) {
          safeSend(link, { type: 'welcome', version: PARTY_VERSION, playerId, snapshot: authority.snapshot(), now: Date.now() })
        } else if (message.type === 'action') {
          const outcome = authority.dispatch(playerId, message.action)
          if (!outcome.ok) safeSend(link, { type: 'error', message: outcome.error, requestId: message.id })
          else if (outcome.changed) this.publish(room)
        } else if (message.type === 'ping') {
          safeSend(link, { type: 'pong', sentAt: message.sentAt, now: Date.now() })
        } else if (message.type === 'leave') {
          this.dropHostLink(room, binding, 'leave')
        }
      },
    })
  }

  private dropHostLink(room: Room, binding: HostConnection, reason: 'disconnect' | 'leave' | 'replace') {
    room.connections.delete(binding)
    binding.unsubscribe()
    if (reason === 'replace') {
      safeSend(binding.link, { type: 'ended', message: 'This party identity moved to another tab.' })
      this.closeAfterNotice(() => safeClose(binding.link))
      return
    }
    safeClose(binding.link)
    if (!binding.playerId || !room.authority) return

    const changed = reason === 'leave' ? room.authority.leave(binding.playerId) : room.authority.disconnect(binding.playerId)
    if (changed) this.publish(room)
  }

  private attachGuestLink(room: Room, link: PartyLink) {
    const guest: GuestConnection = { link, unsubscribe: () => {}, greeted: false, lastSeen: Date.now(), lastPing: 0 }
    room.guest = guest
    const current = () => this.room === room && room.guest === guest
    const noDirectLink = 'A direct WebRTC connection could not be made. Try manual connection or use the same network as the host.'
    const gone = () => {
      if (!current()) return
      this.onLost(room, guest.greeted ? 'The host connection dropped. Check that the host still has the party open.' : noDirectLink)
    }

    guest.unsubscribe = link.subscribe({
      open: () => {
        if (!current() || guest.greeted) return
        guest.greeted = true
        guest.lastSeen = Date.now()
        if (!this.greet(room, guest)) gone()
      },
      close: gone,
      error: gone,
      message: raw => {
        if (!current()) return
        const message = parseHostMessage(raw)
        if (!message) return
        guest.lastSeen = Date.now()

        if (message.type === 'welcome') {
          if (this.state.status === 'joined') return
          if (room.deadline && Date.now() >= room.deadline) {
            this.reconnectExpired(room)
            return
          }
          if (message.version !== PARTY_VERSION) {
            this.terminal(room, 'The host and guest use different party, game data, or generator versions. Reload both pages.')
            return
          }

          const snapshot = message.snapshot
          const player = snapshot.players.find(entry => entry.id === message.playerId)
          if (snapshot.code !== room.code || (room.expectedHost && room.expectedHost !== snapshot.hostId) || !player) {
            this.terminal(room, 'The host returned an unexpected room or player identity.')
            return
          }

          clearTimeout(room.timeout)
          room.expectedHost = snapshot.hostId
          room.nickname = player.nickname
          room.deadline = undefined
          room.retries = 0
          room.bestLatency = undefined
          this.update({ status: 'joined', snapshot: acceptSnapshot(this.state.snapshot, snapshot), playerId: player.id,
            nickname: player.nickname, error: null, clockOffset: message.now - Date.now() })
          this.storeRoom(room)
          this.ping(guest)
          this.startHeartbeat(room)
        } else if (message.type === 'snapshot' && this.state.status === 'joined') {
          const snapshot = acceptSnapshot(this.state.snapshot, message.snapshot)
          if (snapshot === this.state.snapshot) return
          const before = room.nickname
          room.nickname = snapshot.players.find(player => player.id === this.state.playerId)?.nickname ?? before
          this.update({ snapshot, nickname: room.nickname })
          if (before !== room.nickname) {
            writeStorage('localStorage', nicknameKey, room.nickname)
            this.storeRoom(room)
          }
        } else if (message.type === 'pong' && message.sentAt === guest.lastPing) {
          const now = Date.now()
          const elapsed = now - message.sentAt
          if (elapsed >= 0 && elapsed <= (room.bestLatency ?? Infinity) + 20) {
            room.bestLatency = Math.min(room.bestLatency ?? Infinity, elapsed)
            this.update({ clockOffset: Math.round(message.now - (message.sentAt + elapsed / 2)) })
          }
        } else if (message.type === 'ended' || (message.type === 'error' && message.fatal)) {
          this.terminal(room, message.message)
        } else if (message.type === 'error') {
          this.update({ error: message.message })
        }
      },
    })
    clearTimeout(room.timeout)
    room.timeout = setTimeout(() => {
      if (current() && this.state.status !== 'joined') {
        this.onLost(room, guest.greeted ? 'The host did not confirm a live connection. Check that the host still has the party open.' : noDirectLink)
      }
    }, this.attemptTimeout(room, room.method === 'manual' ? manualTimeout : room.deadline ? reconnectTimeout : handshakeTimeout))
    this.startHeartbeat(room)
  }

  private greet(room: Room, guest: GuestConnection) {
    return safeSend(guest.link, { type: 'hello', version: PARTY_VERSION, nickname: room.nickname, token: room.token, expectedHost: room.expectedHost })
  }

  private ping(guest: GuestConnection) {
    guest.lastPing = Date.now()
    safeSend(guest.link, { type: 'ping', sentAt: guest.lastPing })
  }

  private startHeartbeat(room: Room) {
    clearInterval(room.heartbeat)
    room.heartbeat = setInterval(() => {
      if (this.room !== room) return
      const now = Date.now()
      if (room.authority) {
        for (const binding of room.connections) {
          const limit = binding.playerId ? silentTimeout : room.method === 'manual' ? manualTimeout : handshakeTimeout
          if (now - binding.lastSeen > limit) this.dropHostLink(room, binding, 'disconnect')
        }
        if (room.authority.prune()) this.publish(room)
      } else if (room.guest) {
        if (this.state.status !== 'joined') {
          if (room.guest.greeted) this.greet(room, room.guest)
        } else if (now - room.guest.lastSeen > silentTimeout) this.onLost(room, 'The host stopped responding.')
        else this.ping(room.guest)
      }
    }, heartbeatInterval)
  }

  private clearAttempt(room: Room) {
    clearTimeout(room.timeout)
    clearTimeout(room.timer)
    if (room.guest) {
      const guest = room.guest
      room.guest = undefined
      guest.unsubscribe()
      safeClose(guest.link)
    }
    const peer = room.peer
    room.peer = undefined
    peer?.destroy()
  }

  private attemptTimeout(room: Room, limit: number) {
    return room.deadline ? Math.max(1, Math.min(limit, room.deadline - Date.now())) : limit
  }

  private reconnectExpired(room: Room) {
    this.terminal(room, 'The reconnect window expired. Ask for a fresh party invitation.')
  }

  private onLost(room: Room, message: string) {
    if (this.room !== room) return
    this.clearAttempt(room)
    if (room.authority) {
      for (const binding of room.connections) this.dropHostLink(room, binding, 'disconnect')
    }

    if (room.method === 'online' && (room.authority || room.expectedHost)) {
      room.deadline ??= Date.now() + RECONNECT_GRACE
      if (Date.now() < room.deadline) {
        this.update({ status: 'reconnecting', error: message })
        const delay = Math.min(4_000, 600 * 1.55 ** room.retries++)
        room.timer = setTimeout(() => {
          if (Date.now() >= (room.deadline ?? 0)) this.reconnectExpired(room)
          else this.startPeer(room)
        }, this.attemptTimeout(room, delay))
        return
      }
      this.reconnectExpired(room)
      return
    }

    clearInterval(room.heartbeat)
    if (room.method === 'manual' && room.expectedHost) {
      room.deadline ??= Date.now() + RECONNECT_GRACE
      if (Date.now() >= room.deadline) {
        this.reconnectExpired(room)
        return
      }
      this.update({ status: 'disconnected', error: message })
      room.timer = setTimeout(() => this.reconnectExpired(room), room.deadline - Date.now())
      return
    }
    this.update({ status: 'error', error: message })
  }

  private terminal(room: Room, message: string) {
    if (this.room !== room) return
    this.release(false)
    writeStorage('sessionStorage', sessionKey, null)
    this.update({ ...startingState(this.state.nickname), status: 'disconnected', error: message })
  }
}

export function useParty() {
  const [network] = useState(() => new PartyNetwork())
  const state = useSyncExternalStore(network.subscribe, network.getSnapshot, network.getSnapshot)
  useEffect(() => {
    const resume = setTimeout(network.resume, 0)
    return () => { clearTimeout(resume); network.suspend() }
  }, [network])
  return {
    ...state,
    hostRoom: network.hostRoom,
    joinRoom: network.joinRoom,
    hostManual: network.hostManual,
    attachManualHost: network.attachManualHost,
    joinManual: network.joinManual,
    clearError: network.clearError,
    leaveRoom: network.leaveRoom,
    reconnect: network.reconnect,
    send: network.send,
  }
}

export type PartyConnection = ReturnType<typeof useParty>
