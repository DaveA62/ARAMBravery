import { describe, expect, it } from 'vitest'
import { PartyAuthority } from './authority'
import { receivePartyMessage, sendPartyMessage } from './transport'
import type { HostMessage } from './protocol'

describe('party data-channel framing', () => {
  it('reassembles an authoritative snapshot that exceeds the PeerJS JSON limit', () => {
    const authority = new PartyAuthority('ABCD89', '🦊 Captain')
    const host = authority.hostIdentity.playerId
    authority.dispatch(host, { type: 'ready', ready: true })
    authority.dispatch(host, { type: 'roll' })
    const snapshot = authority.snapshot()
    const build = snapshot.round!.builds[host]
    build.config.rerolls = Array.from({ length: 1000 }, () => ({ type: 'item', index: 2 }))
    const message: HostMessage = { type: 'snapshot', now: 100, snapshot }
    const received: unknown[] = []
    const read = receivePartyMessage(packet => received.push(packet))
    const sizes: number[] = []

    sendPartyMessage(message, frame => {
      const wire = JSON.stringify(frame)
      sizes.push(new TextEncoder().encode(wire).length)
      read(JSON.parse(wire))
    })

    expect(sizes.length).toBeGreaterThan(1)
    expect(sizes.every(size => size < 16_300)).toBe(true)
    expect(received).toEqual([JSON.parse(JSON.stringify(message))])
  })

  it('discards a truncated sequence and still accepts fresh packets', () => {
    const received: unknown[] = []
    const read = receivePartyMessage(packet => received.push(packet))
    read(['party-segment', 0, 'x'.repeat(4096), false])
    read(['party-segment', 8192, 'x', true])
    read({ type: 'pong', now: 200, sentAt: 140 })
    expect(received).toEqual([{ type: 'pong', now: 200, sentAt: 140 }])
  })
})
