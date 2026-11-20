import { describe, expect, it } from 'vitest'
import { PartyAuthority } from './authority'
import {
  acceptSnapshot, generateCode, normalizeNickname, parseClientMessage, parseHostMessage, PARTY_DRAFT_DURATION,
  PARTY_VERSION, partyInvite, partyPeerId, validCode, validNickname,
} from './protocol'

describe('party wire protocol', () => {
  it('generates short, readable codes and deterministically maps the same code to the same peer', () => {
    expect(generateCode(new Uint8Array([0, 1, 2, 3, 30, 31]))).toBe('ABCD89')
    const codes = Array.from({ length: 100 }, () => generateCode())
    expect(codes.every(validCode)).toBe(true)
    expect(new Set(codes).size).toBeGreaterThan(95)
    expect(partyPeerId(' abcD89 ')).toBe(partyPeerId('ABCD89'))
    expect(() => partyPeerId('ABCIO0')).toThrow()
  })

  it('uses the production repository path and replaces unrelated query parameters', () => {
    expect(partyInvite('abcd89', 'https://davea62.github.io/ARAMBravery/?seed=111#loadout'))
      .toBe('https://davea62.github.io/ARAMBravery/?party=ABCD89')
  })

  it('sanitizes nickname formatting and validates the Unicode length', () => {
    expect(normalizeNickname('  A<>\u0000   B  ')).toBe('A B')
    expect(validNickname('🧪💥')).toBe(true)
    expect(validNickname('x')).toBe(false)
    expect(validNickname('👻'.repeat(21))).toBe(false)
  })

  it('validates wire packets before changing state and rejects stale snapshots', () => {
    const snapshot = new PartyAuthority('ABCD89', 'Host').snapshot()
    expect(parseHostMessage({ type: 'snapshot', now: 100, snapshot })).not.toBeNull()
    expect(parseHostMessage({ type: 'welcome', version: PARTY_VERSION, now: 100, playerId: snapshot.hostId, snapshot })).not.toBeNull()
    expect(parseHostMessage({ type: 'snapshot', now: 100, snapshot: { ...snapshot, players: null } })).toBeNull()
    expect(parseClientMessage({ type: 'snapshot', snapshot })).toBeNull()
    expect(parseClientMessage({ type: 'action', id: 'req', action: { type: 'reroll', roundId: 'round', index: 99, requestId: 'req' } })).toBeNull()
    const updated = { ...snapshot, revision: snapshot.revision + 1 }
    expect(acceptSnapshot(snapshot, updated)).toBe(updated)
    expect(acceptSnapshot(updated, snapshot)).toBe(updated)
    expect(acceptSnapshot(updated, { ...updated, revision: 100, hostId: 'other' })).toBe(updated)
  })

  it('requires an exact one-minute draft deadline and still accepts completed round snapshots', () => {
    const authority = new PartyAuthority('ABCD89', 'Host', { now: () => 50_000 })
    const { playerId } = authority.hostIdentity
    authority.dispatch(playerId, { type: 'ready', ready: true })
    authority.dispatch(playerId, { type: 'roll' })
    const snapshot = authority.snapshot()
    const { draftEndsAt, ...withoutDeadline } = snapshot.round!
    expect(draftEndsAt - withoutDeadline.unlockAt).toBe(PARTY_DRAFT_DURATION)
    const wire = { type: 'snapshot', now: draftEndsAt + 1_000, snapshot }
    expect(parseHostMessage(wire)).not.toBeNull()
    expect(parseHostMessage({ ...wire, snapshot: { ...snapshot, round: withoutDeadline } })).toBeNull()
    for (const invalid of [draftEndsAt - 1, draftEndsAt + 1, Infinity, NaN, '60000']) {
      expect(parseHostMessage({ ...wire, snapshot: { ...snapshot, round: { ...withoutDeadline, draftEndsAt: invalid } } }))
        .toBeNull()
    }
  })
})

it('accepts veto requests and rejects malformed targets or slots', () => {
  const action = { type: 'veto', index: 2, roundId: 'round', requestId: 'request', targetId: 'player', itemId: '3124' } as const
  expect(parseClientMessage({ type: 'action', id: 'req', action })).not.toBeNull()
  expect(parseClientMessage({ type: 'action', id: 'req', action: { ...action, targetId: [] } })).toBeNull()
  expect(parseClientMessage({ type: 'action', id: 'req', action: { ...action, index: 6 } })).toBeNull()
  expect(parseClientMessage({ type: 'action', id: 'req', action: { ...action, itemId: '' } })).toBeNull()
})
