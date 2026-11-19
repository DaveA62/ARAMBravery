import { describe, expect, it } from 'vitest'
import { PartyAuthority } from './authority'
import { acceptSnapshot, generateCode, normalizeNickname, parseClientMessage, parseHostMessage, PARTY_VERSION, partyInvite, partyPeerId, validCode, validNickname } from './protocol'

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
})
