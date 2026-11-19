import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PartyNetwork } from './network'
import { PARTY_VERSION, RECONNECT_GRACE, partyPeerId, type PartyMessage } from './protocol'
import type { PartyLink, PartyLinkHandlers } from './transport'

const broker = vi.hoisted(() => {
  type EventHandler = (...args: any[]) => void

  class Emitter {
    private handlers = new Map<string, Set<EventHandler>>()
    on(event: string, listener: EventHandler) {
      const listeners = this.handlers.get(event) ?? new Set<EventHandler>()
      listeners.add(listener)
      this.handlers.set(event, listeners)
    }
    off(event: string, listener: EventHandler) { this.handlers.get(event)?.delete(listener) }
    emit(event: string, ...value: unknown[]) {
      for (const listener of this.handlers.get(event) ?? []) listener(...value)
    }
  }

  class Connection extends Emitter {
    open = false
    silent = false
    other?: Connection

    send(message: unknown) {
      queueMicrotask(() => {
        if (this.open && !this.silent && this.other?.open) this.other.emit('data', structuredClone(message))
      })
    }

    close() {
      if (!this.open) return
      this.open = false
      if (this.other) this.other.open = false
      this.emit('close')
      this.other?.emit('close')
    }
  }

  const peers = new Map<string, FakePeer>()
  const links: Connection[] = []
  const claimed: string[] = []
  let id = 0
  let nextCollision = false

  class FakePeer extends Emitter {
    id: string
    destroyed = false
    disconnected = false
    connections = new Set<Connection>()

    constructor(idOrOptions: unknown) {
      super()
      this.id = typeof idOrOptions === 'string' ? idOrOptions : `guest-${++id}`
      if (typeof idOrOptions === 'string') claimed.push(this.id)
      queueMicrotask(() => {
        if (this.destroyed) return
        if (peers.has(this.id) || (nextCollision && typeof idOrOptions === 'string')) {
          nextCollision = false
          this.emit('error', { type: 'unavailable-id' })
          return
        }
        peers.set(this.id, this)
        this.emit('open', this.id)
      })
    }

    connect(target: string) {
      const local = new Connection()
      const remote = new Connection()
      local.other = remote
      remote.other = local
      links.push(local)
      queueMicrotask(() => {
        if (this.destroyed) return
        const host = peers.get(target)
        if (!host) {
          this.emit('error', { type: 'peer-unavailable' })
          return
        }
        this.connections.add(local)
        host.connections.add(remote)
        host.emit('connection', remote)
        remote.open = true
        local.open = true
        remote.emit('open')
        local.emit('open')
      })
      return local
    }

    destroy() {
      if (this.destroyed) return
      this.destroyed = true
      if (peers.get(this.id) === this) peers.delete(this.id)
      for (const connection of this.connections) connection.close()
      this.emit('close')
    }

    reconnect() { this.disconnected = false; this.emit('open', this.id) }
  }

  return { FakePeer, Connection, peers, links, claimed, collide: () => { nextCollision = true } }
})

vi.mock('peerjs', () => ({ default: broker.FakePeer }))

const networks: PartyNetwork[] = []
const flush = () => vi.advanceTimersByTimeAsync(0)
function createNetwork() {
  const network = new PartyNetwork()
  networks.push(network)
  return network
}

function stubStorage() {
  const storage = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
  return storage
}

function wrapLink(connection: InstanceType<typeof broker.Connection>): PartyLink {
  return {
    get open() { return connection.open },
    send(message: PartyMessage) { connection.send(message) },
    close() { connection.close() },
    subscribe(handlers: PartyLinkHandlers) {
      connection.on('close', handlers.close)
      connection.on('data', handlers.message)
      let subscribed = true
      if (connection.open) queueMicrotask(() => { if (subscribed) handlers.open() })
      return () => {
        subscribed = false
        connection.off('close', handlers.close)
        connection.off('data', handlers.message)
      }
    },
  }
}

function manualPair() {
  const left = new broker.Connection()
  const right = new broker.Connection()
  left.open = right.open = true
  left.other = right
  right.other = left
  return { hostLink: wrapLink(left), guestLink: wrapLink(right) }
}

async function createRoom() {
  const host = createNetwork()
  host.hostRoom('Host')
  await flush()
  return { host, code: host.getSnapshot().inviteCode }
}

describe('party transport lifecycle', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    for (const network of networks.splice(0)) network.suspend()
    for (const peer of broker.peers.values()) peer.destroy()
    broker.links.length = 0
    broker.claimed.length = 0
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('waits for host liveness, retries a collided code, and discovers the live deterministic host', async () => {
    broker.collide()
    const host = createNetwork()
    host.hostRoom('Host')
    expect(host.getSnapshot().status).toBe('connecting')
    expect(host.getSnapshot().inviteCode).toBe('')
    await flush()
    expect(host.getSnapshot().status).toBe('hosting')
    const code = host.getSnapshot().inviteCode
    expect(broker.claimed).toHaveLength(2)
    expect(broker.claimed[0]).not.toBe(broker.claimed[1])
    expect(broker.claimed[1]).toBe(partyPeerId(code))

    const guest = createNetwork()
    guest.joinRoom(code, 'Guest')
    expect(guest.getSnapshot().status).toBe('connecting')
    await flush()
    expect(guest.getSnapshot().status).toBe('joined')
    expect(guest.getSnapshot().snapshot?.players.map(({ nickname }) => nickname)).toEqual(['Host', 'Guest'])
  })

  it('reports a missing host and rejects mismatched generator clients before admission', async () => {
    const missing = createNetwork()
    missing.joinRoom('AAAAAA', 'Visitor')
    await flush()
    expect(missing.getSnapshot()).toMatchObject({ status: 'error', error: expect.stringMatching(/No live host/) })

    const { host, code } = await createRoom()
    const second = new broker.FakePeer(undefined)
    const errors: unknown[] = []
    second.on('open', () => {
      const link = second.connect(partyPeerId(code))
      link.on('open', () => {
        link.send({ type: 'hello', version: `stale-${PARTY_VERSION}`, nickname: 'Visitor', token: 'mismatched-client-token' })
      })
      link.on('data', data => errors.push(data))
    })
    await flush()
    expect(errors).toEqual([expect.objectContaining({ type: 'error', fatal: true, message: expect.stringMatching(/different party/) })])
    expect(host.getSnapshot().snapshot?.players).toHaveLength(1)
  })

  it('routes guest actions through the host and broadcasts the authoritative snapshot', async () => {
    const { host, code } = await createRoom()
    const guest = createNetwork()
    guest.joinRoom(code, 'Guest')
    await flush()

    guest.send({ type: 'settings', rules: { mode: 'straight', allowance: 0 } })
    await flush()
    expect(guest.getSnapshot().error).toMatch(/Only the host/)
    expect(host.getSnapshot().snapshot?.rules.mode).toBe('little')
    guest.send({ type: 'ready', ready: true })
    await flush()
    expect(guest.getSnapshot().snapshot?.players[1].ready).toBe(true)
    expect(guest.getSnapshot().snapshot).toEqual(host.getSnapshot().snapshot)
  })

  it('reconnects an interrupted guest with the same identity and removes a clean departure', async () => {
    const { host, code } = await createRoom()
    const guest = createNetwork()
    guest.joinRoom(code, 'Guest')
    await flush()
    const original = guest.getSnapshot().playerId

    broker.links.at(-1)?.close()
    expect(guest.getSnapshot().status).toBe('reconnecting')
    expect(host.getSnapshot().snapshot?.players[1].connected).toBe(false)
    await vi.advanceTimersByTimeAsync(650)
    expect(guest.getSnapshot().status).toBe('joined')
    expect(guest.getSnapshot().playerId).toBe(original)
    expect(host.getSnapshot().snapshot?.players[1].connected).toBe(true)

    guest.leaveRoom()
    await flush()
    expect(guest.getSnapshot().status).toBe('idle')
    expect(host.getSnapshot().snapshot?.players).toHaveLength(1)
  })

  it('restores a refreshed host from a tab checkpoint and ends the party explicitly', async () => {
    stubStorage()

    const { host, code } = await createRoom()
    host.send({ type: 'settings', rules: { mode: 'straight', allowance: 3 } })
    const id = host.getSnapshot().playerId
    host.suspend()
    const refreshed = createNetwork()
    refreshed.resume()
    expect(refreshed.getSnapshot().status).toBe('reconnecting')
    await flush()
    expect(refreshed.getSnapshot()).toMatchObject({ status: 'hosting', inviteCode: code, playerId: id })
    expect(refreshed.getSnapshot().snapshot?.rules).toEqual({ mode: 'straight', allowance: 3 })

    const guest = createNetwork()
    guest.joinRoom(code, 'Guest')
    await flush()
    refreshed.leaveRoom()
    await flush()
    expect(guest.getSnapshot()).toMatchObject({ status: 'disconnected', snapshot: null, playerId: null, error: 'The host ended this party.' })
  })

  it('replaces an already connected tab without starting a reconnect loop', async () => {
    stubStorage()
    const { host, code } = await createRoom()
    const original = createNetwork()
    original.joinRoom(code, 'Guest')
    await flush()
    const id = original.getSnapshot().playerId
    const duplicate = createNetwork()
    duplicate.resume()
    await flush()
    expect(duplicate.getSnapshot()).toMatchObject({ status: 'joined', playerId: id })
    expect(original.getSnapshot()).toMatchObject({ status: 'disconnected', snapshot: null, error: 'This party identity moved to another tab.' })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(host.getSnapshot().snapshot?.players).toHaveLength(2)
    expect(broker.links).toHaveLength(2)
  })

  it('preserves a manual guest seat during recovery and clears the room when the grace expires', async () => {
    const host = createNetwork()
    const guest = createNetwork()
    const code = host.hostManual('Host')
    const first = manualPair()
    host.attachManualHost(first.hostLink)
    guest.joinManual(code, 'Guest', first.guestLink)
    await flush()
    const id = guest.getSnapshot().playerId
    first.guestLink.close()
    expect(guest.getSnapshot()).toMatchObject({ status: 'disconnected', playerId: id })

    await vi.advanceTimersByTimeAsync(10_000)
    const second = manualPair()
    host.attachManualHost(second.hostLink)
    guest.joinManual(code, 'Guest', second.guestLink)
    await flush()
    expect(guest.getSnapshot()).toMatchObject({ status: 'joined', playerId: id })

    second.guestLink.close()
    await vi.advanceTimersByTimeAsync(RECONNECT_GRACE - 500)
    guest.joinManual(code, 'Guest', wrapLink(new broker.Connection()))
    expect(guest.getSnapshot()).toMatchObject({ status: 'reconnecting', playerId: id })
    await vi.advanceTimersByTimeAsync(500)
    expect(guest.getSnapshot()).toMatchObject({ status: 'disconnected', snapshot: null, playerId: null,
      error: expect.stringMatching(/reconnect window expired/) })
  })

  it('uses heartbeat replies to detect a silent link and resumes without duplicating seats', async () => {
    const { host, code } = await createRoom()
    const guest = createNetwork()
    guest.joinRoom(code, 'Guest')
    await flush()
    const id = guest.getSnapshot().playerId

    const link = broker.links.at(-1)
    if (!link?.other) throw new Error('Missing test link')
    link.other.silent = true
    await vi.advanceTimersByTimeAsync(24_700)
    expect(guest.getSnapshot()).toMatchObject({ status: 'joined', playerId: id })
    expect(host.getSnapshot().snapshot?.players).toHaveLength(2)
    expect(broker.links).toHaveLength(2)
  })
})
