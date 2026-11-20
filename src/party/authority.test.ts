import { describe, expect, it } from 'vitest'
import { generateChallenge, validateItems } from '../domain'
import { isBoot } from '../domain/itemLegality'
import { PartyAuthority } from './authority'
import { resolvePartyBuild } from './build'
import { COUNTDOWN, MAX_PLAYERS, RECONNECT_GRACE, ROLL_LOCK, parseHostMessage } from './protocol'

function setup() {
  let tick = 50_000
  let id = 0
  let seeds = 0
  const options = {
    now: () => tick,
    createId: () => `identity-${++id}`,
    createToken: () => `private-key-number-${id}`,
    createSeed: () => `ROUND-SEED-${++seeds}`,
  }
  const authority = new PartyAuthority('abcdef', ' <Host> ', options)
  const guest = (nickname = 'Guest', token?: string) => {
    const result = authority.admit({ nickname, token })
    if (!result.ok) throw new Error(result.error)
    return result
  }
  return {
    authority, options, guest, host: authority.hostIdentity.playerId,
    advance: (milliseconds: number) => { tick += milliseconds },
  }
}

describe('party admission and identity', () => {
  it('normalizes nicknames, reserves unique names and hides tokens from public messages', () => {
    const { authority, guest } = setup()
    const joined = guest('  Ａｌｅｘ　<Ｘ>  ')
    expect(authority.snapshot().players.map(({ nickname }) => nickname)).toEqual(['Host', 'Alex X'])
    expect(authority.admit({ nickname: ' alex x ' })).toMatchObject({ ok: false })
    expect(authority.admit({ nickname: 'a' })).toMatchObject({ ok: false })
    const snapshot = authority.snapshot()
    expect(parseHostMessage({ type: 'snapshot', snapshot, now: 1 })).not.toBeNull()
    expect(JSON.stringify(snapshot)).not.toContain(joined.token)
    expect(JSON.stringify(snapshot)).not.toContain(authority.hostIdentity.token)
    expect(authority.admit({ nickname: 'Host copy', token: authority.hostIdentity.token })).toMatchObject({ ok: false })
  })

  it('admits five including the host, keeps a dropped seat during grace and opens it after expiry', () => {
    const { authority, guest, advance } = setup()
    const joined = guest('Player 1')
    for (let index = 2; index < MAX_PLAYERS; index += 1) guest(`Player ${index}`)
    expect(authority.snapshot().players).toHaveLength(MAX_PLAYERS)
    expect(authority.disconnect(joined.playerId)).toBe(true)
    expect(authority.admit({ nickname: 'Extra' })).toMatchObject({ ok: false, error: 'This party is full.' })
    advance(RECONNECT_GRACE - 1)
    expect(authority.prune()).toBe(false)
    advance(1)
    expect(authority.prune()).toBe(true)
    expect(guest('Extra').playerId).not.toEqual(joined.playerId)
  })

  it('reclaims the same identity and selection after a brief drop or a host refresh', () => {
    const { authority, guest, options, advance } = setup()
    const introducedToken = 'from-the-guest-browser'
    const joined = guest('Guest', introducedToken)
    authority.dispatch(joined.playerId, { type: 'champion', championId: 'Jinx' })
    authority.dispatch(joined.playerId, { type: 'ready', ready: true })
    authority.disconnect(joined.playerId)
    advance(200)
    expect(authority.admit({ nickname: 'Guest', token: introducedToken })).toEqual(joined)

    const saved = JSON.parse(JSON.stringify(authority.checkpoint()))
    const resumed = PartyAuthority.resume(saved, options)
    expect(resumed.hostIdentity).toEqual(authority.hostIdentity)
    expect(resumed.snapshot().revision).toBeGreaterThan(authority.snapshot().revision)
    expect(resumed.snapshot().players[1]).toMatchObject({ id: joined.playerId, championId: 'Jinx', ready: true, connected: false })
    expect(resumed.admit({ nickname: 'Guest', token: introducedToken })).toEqual(joined)
    expect(resumed.snapshot().players[1].connected).toBe(true)
    expect(JSON.stringify(resumed.snapshot())).not.toContain(introducedToken)
  })

  it('opens a seat immediately for an explicit guest leave', () => {
    const { authority, guest } = setup()
    const joined = guest()
    expect(authority.leave(joined.playerId)).toBe(true)
    expect(authority.snapshot().players).toHaveLength(1)
    expect(guest().playerId).not.toBe(joined.playerId)
    expect(authority.disconnect(joined.playerId)).toBe(false)
  })
})

describe('authoritative rounds', () => {
  it('requires the host and every connected participant to be ready', () => {
    const { authority, host, guest } = setup()
    const joined = guest()
    expect(authority.dispatch(joined.playerId, { type: 'settings', rules: { mode: 'straight', allowance: 1 } })).toMatchObject({ ok: false })
    expect(authority.dispatch(joined.playerId, { type: 'roll' })).toMatchObject({ ok: false })
    expect(authority.dispatch(host, { type: 'ready', ready: true })).toEqual({ ok: true, changed: true })
    expect(authority.dispatch(host, { type: 'roll' })).toMatchObject({ ok: false })
    authority.disconnect(joined.playerId)
    expect(authority.dispatch(host, { type: 'roll' })).toEqual({ ok: true, changed: true })
    expect(Object.keys(authority.snapshot().round!.builds)).toEqual([host])
  })

  it('generates replayable builds upfront with one synchronized start and keeps late arrivals waiting', () => {
    const { authority, host, guest, options } = setup()
    const joined = guest()
    authority.dispatch(host, { type: 'settings', rules: { mode: 'straight', allowance: 5 } })
    authority.dispatch(joined.playerId, { type: 'champion', championId: 'Ezreal' })
    authority.dispatch(host, { type: 'ready', ready: true })
    authority.dispatch(joined.playerId, { type: 'ready', ready: true })
    authority.dispatch(host, { type: 'roll' })

    const round = authority.snapshot().round!
    const late = guest('Late Arrival')
    expect(round.startsAt).toBe(options.now() + COUNTDOWN)
    expect(round.unlockAt).toBe(round.startsAt + ROLL_LOCK)
    expect(round.builds[host].config.seed).not.toBe(round.builds[joined.playerId].config.seed)
    expect(round.builds[joined.playerId]).toMatchObject({ config: { championId: 'Ezreal', mode: 'straight' }, remaining: 5, used: 0 })
    for (const { config } of Object.values(round.builds)) {
      const challenge = generateChallenge(config)
      expect(validateItems(challenge.champion, challenge.items, config.mode)).toBe(true)
    }
    expect(round.builds[late.playerId]).toBeUndefined()
    expect(authority.dispatch(late.playerId, { type: 'ready', ready: true })).toMatchObject({ ok: false })
    expect(authority.dispatch(late.playerId, { type: 'reroll', index: 0, roundId: round.id, requestId: 'late' })).toMatchObject({ ok: false })
    expect(authority.dispatch(joined.playerId, { type: 'next', roundId: round.id })).toMatchObject({ ok: false })
    expect(authority.snapshot().activity.at(-1)?.text).toContain('next round')
  })

  it('updates only the requested player and item, and deduplicates through host resume', () => {
    const { authority, host, guest, advance, options } = setup()
    const joined = guest()
    authority.dispatch(host, { type: 'settings', rules: { mode: 'straight', allowance: 5 } })
    for (const id of [host, joined.playerId]) authority.dispatch(id, { type: 'ready', ready: true })
    authority.dispatch(host, { type: 'roll' })

    const round = authority.snapshot().round!
    const request = { type: 'reroll', index: 2, roundId: round.id, requestId: 'reel-two' } as const
    expect(authority.dispatch(joined.playerId, request)).toMatchObject({ ok: false })
    advance(COUNTDOWN + ROLL_LOCK)
    expect(authority.dispatch(joined.playerId, request)).toEqual({ ok: true, changed: true })
    const rerolled = authority.snapshot().round!
    expect(rerolled.builds[host]).toEqual(round.builds[host])
    expect(rerolled.builds[joined.playerId]).toMatchObject({ remaining: 4, used: 1 })
    const before = generateChallenge(round.builds[joined.playerId].config)
    const after = generateChallenge(rerolled.builds[joined.playerId].config)
    expect(after.items.map((item, index) => index === 2 ? '' : item.id)).toEqual(
      before.items.map((item, index) => index === 2 ? '' : item.id),
    )
    expect(after.items[2].id).not.toBe(before.items[2].id)
    expect(after.spells).toEqual(before.spells)
    expect(after.skills).toEqual(before.skills)
    const revision = authority.snapshot().revision
    expect(authority.dispatch(joined.playerId, request)).toEqual({ ok: true, changed: false })
    expect(authority.snapshot().revision).toBe(revision)

    const restored = PartyAuthority.resume(authority.checkpoint(), options)
    restored.admit({ nickname: 'Guest', token: joined.token })
    expect(restored.dispatch(joined.playerId, request)).toEqual({ ok: true, changed: false })
    expect(restored.snapshot().round!.builds[joined.playerId].used).toBe(1)
  })

  it('enforces a zero allowance and rejects stale and malformed rerolls', () => {
    const { authority, host, advance } = setup()
    authority.dispatch(host, { type: 'settings', rules: { mode: 'little', allowance: 0 } })
    authority.dispatch(host, { type: 'ready', ready: true })
    authority.dispatch(host, { type: 'roll' })
    const { id } = authority.snapshot().round!
    advance(COUNTDOWN + ROLL_LOCK)
    expect(authority.dispatch(host, { type: 'reroll', index: 0, roundId: id, requestId: 'valid' })).toMatchObject({ ok: false })
    expect(authority.dispatch(host, { type: 'reroll', index: -1, roundId: id, requestId: 'invalid' })).toMatchObject({ ok: false })
    expect(authority.dispatch(host, { type: 'reroll', index: 0, roundId: 'stale', requestId: 'old' })).toMatchObject({ ok: false })
    expect(authority.snapshot().round!.builds[host].used).toBe(0)
  })

  it('resets the lobby without leaking private history and retains only eight previous rounds', () => {
    const { authority, host, advance } = setup()
    const rounds: string[] = []
    authority.dispatch(host, { type: 'champion', championId: 'Jinx' })
    for (let index = 0; index < 10; index += 1) {
      authority.dispatch(host, { type: 'ready', ready: true })
      authority.dispatch(host, { type: 'roll' })
      const round = authority.snapshot().round!
      rounds.push(round.id)
      expect(authority.dispatch(host, { type: 'next', roundId: round.id })).toMatchObject({ ok: false })
      advance(COUNTDOWN + ROLL_LOCK)
      expect(authority.dispatch(host, { type: 'next', roundId: round.id })).toEqual({ ok: true, changed: true })
      expect(authority.snapshot().players[0]).toMatchObject({ championId: 'Jinx', ready: false })
    }
    expect(authority.checkpoint().history.map(({ id }) => id)).toEqual(rounds.slice(-8))
    expect(authority.snapshot()).not.toHaveProperty('history')
  })
})

it('clears ready states when the host changes rules and locks nicknames during a round', () => {
  const { authority, host, guest } = setup()
  const teammate = guest()
  for (const id of [host, teammate.playerId]) authority.dispatch(id, { type: 'ready', ready: true })
  expect(authority.dispatch(host, { type: 'settings', rules: { mode: 'straight', allowance: 2 } })).toMatchObject({ ok: true })
  expect(authority.snapshot().players.every(player => !player.ready)).toBe(true)
  expect(authority.snapshot().activity.at(-1)?.text).toContain('Straight Bullshit')
  for (const id of [host, teammate.playerId]) authority.dispatch(id, { type: 'ready', ready: true })
  expect(authority.dispatch(host, { type: 'roll' })).toMatchObject({ ok: true })
  expect(authority.dispatch(teammate.playerId, { type: 'nickname', nickname: 'Renamed' })).toMatchObject({ ok: false })
  authority.leave(teammate.playerId)
  expect(authority.snapshot().round!.builds[teammate.playerId].nickname).toBe('Guest')
})

describe('friendly fire', () => {
  function hostileParty(friendlyFire = true) {
    const party = setup()
    const { authority, guest, host } = party
    const teammate = guest('Teammate')
    const observer = guest('Observer')
    authority.dispatch(host, { type: 'settings', rules: { mode: 'straight', allowance: 0, friendlyFire } })
    for (const id of [host, teammate.playerId, observer.playerId]) authority.dispatch(id, { type: 'ready', ready: true })
    expect(authority.dispatch(host, { type: 'roll' })).toMatchObject({ ok: true })
    const round = authority.snapshot().round!
    const before = generateChallenge(round.builds[teammate.playerId].config)
    const veto = {
      type: 'veto', roundId: round.id, requestId: 'first-veto',
      targetId: teammate.playerId, index: 1, itemId: before.items[1].id,
    } as const
    return { ...party, teammate, observer, round, before, veto }
  }

  it('forces one legal replacement, keeps personal rerolls, and locks the slot for the round', () => {
    const { authority, host, teammate, observer, round, before, veto, advance, options } = hostileParty()
    expect(authority.dispatch(host, veto)).toMatchObject({ ok: false })
    advance(COUNTDOWN + ROLL_LOCK)
    expect(authority.dispatch(host, veto)).toEqual({ ok: true, changed: true })
    const next = authority.snapshot().round!
    const replacement = next.builds[teammate.playerId]
    const after = generateChallenge(replacement.config)
    expect(validateItems(after.champion, after.items)).toBe(true)
    expect(after.items[1].id).not.toBe(before.items[1].id)
    expect(after.items.filter((_, index) => index !== 1)).toEqual(before.items.filter((_, index) => index !== 1))
    expect(next.builds[host]).toEqual(round.builds[host])
    expect(replacement).toMatchObject({ remaining: 0, used: 0, lockedItemSlots: [1], lastReroll: { vetoBy: 'Host' } })
    expect(next.vetoedBy).toEqual([host])
    expect(authority.snapshot().activity.at(-1)?.text).toContain('vetoed Teammate')
    expect(authority.dispatch(host, veto)).toEqual({ ok: true, changed: false })
    expect(authority.dispatch(teammate.playerId, { type: 'reroll', index: 1, roundId: round.id, requestId: 'self-reroll' }))
      .toMatchObject({ ok: false, error: 'That slot is locked for this round.' })
    expect(authority.dispatch(observer.playerId, { ...veto, requestId: 'other-player' })).toMatchObject({ ok: false, error: 'That slot is locked for this round.' })
    expect(authority.dispatch(host, { ...veto, requestId: 'second-veto', index: 2, itemId: after.items[2].id }))
      .toMatchObject({ ok: false, error: 'You have already used your veto this round.' })

    const restored = PartyAuthority.resume(authority.checkpoint(), options)
    expect(restored.snapshot().round).toEqual(next)
    expect(restored.dispatch(host, { type: 'next', roundId: round.id })).toMatchObject({ ok: true })
    restored.dispatch(host, { type: 'ready', ready: true })
    restored.dispatch(host, { type: 'roll' })
    expect(restored.snapshot().round?.vetoedBy).toBeUndefined()
    expect(restored.snapshot().round?.builds[host].lockedItemSlots).toBeUndefined()
    expect(restored.snapshot().rules.friendlyFire).toBe(true)
  })

  it('rejects invalid, stale, disabled, and self-targeted vetoes without using the allowance', () => {
    const { authority, host, guest, veto, advance, round } = hostileParty()
    advance(COUNTDOWN + ROLL_LOCK)
    const late = guest('Late')
    expect(authority.dispatch(late.playerId, veto)).toMatchObject({ ok: false })
    expect(authority.dispatch(host, { ...veto, roundId: 'previous-round' })).toMatchObject({ ok: false })
    expect(authority.dispatch(host, { ...veto, index: 6 })).toMatchObject({ ok: false })
    expect(authority.dispatch(host, { ...veto, itemId: 'stale-item' })).toMatchObject({ ok: false })
    expect(authority.dispatch(host, { ...veto, targetId: host })).toMatchObject({ ok: false })
    expect(authority.snapshot().round).toEqual(round)

    const harmless = hostileParty(false)
    harmless.advance(COUNTDOWN + ROLL_LOCK)
    expect(harmless.authority.dispatch(harmless.host, harmless.veto)).toMatchObject({ ok: false, error: 'Friendly Fire is off.' })
  })
})

it('passes the optional MOBAFire source rule through either party build mode', () => {
  for (const mode of ['little', 'straight'] as const) {
    const { authority, host } = setup()
    expect(authority.dispatch(host, { type: 'settings', rules: { mode, allowance: 2, curated: true } }))
      .toEqual({ ok: true, changed: true })
    authority.dispatch(host, { type: 'ready', ready: true })
    expect(authority.dispatch(host, { type: 'roll' })).toMatchObject({ ok: true })
    const snapshot = authority.snapshot()
    expect(snapshot.round!.builds[host].config).toMatchObject({ mode, curated: true })
    const challenge = generateChallenge(snapshot.round!.builds[host].config)
    expect(challenge.curation).toMatchObject({ status: 'applied', source: { name: 'MOBAFire' } })
    expect(parseHostMessage({ type: 'snapshot', now: 1, snapshot })).not.toBeNull()
  }
})

describe('Unique Mayhem', () => {
  it('rolls five legal distinct inventories, keeps boots where legal, and preserves uniqueness through rerolls and vetoes', () => {
    const { authority, host, guest, advance, options } = setup()
    const otherIds = Array.from({ length: 4 }, (_, index) => guest('Player ' + (index + 2)).playerId)
    const ids = [host, ...otherIds]
    const rules = { mode: 'little', allowance: 2, curated: true, friendlyFire: true, uniqueMayhem: true } as const
    expect(authority.dispatch(otherIds[0], { type: 'settings', rules })).toMatchObject({ ok: false })
    expect(authority.dispatch(host, { type: 'settings', rules })).toMatchObject({ ok: true, changed: true })
    const selections = ['Nautilus', 'Lux', 'Lux', 'Yuumi', 'Cassiopeia']
    selections.forEach((championId, index) => {
      authority.dispatch(ids[index], { type: 'champion', championId })
      authority.dispatch(ids[index], { type: 'ready', ready: true })
    })
    expect(authority.dispatch(host, { type: 'roll' })).toMatchObject({ ok: true, changed: true })
    const first = authority.snapshot()
    const round = first.round!
    const assertUnique = (snapshot: ReturnType<PartyAuthority['snapshot']>) => {
      const builds = Object.values(snapshot.round!.builds).map(resolvePartyBuild)
      const items = builds.flatMap(build => build.items.map(item => item.id))
      expect(items).toHaveLength(30)
      expect(new Set(items).size).toBe(items.length)
      for (const build of builds) expect(validateItems(build.champion, build.items, build.config.mode)).toBe(true)
      expect(parseHostMessage({ type: 'snapshot', now: 1, snapshot })).not.toBeNull()
      return builds
    }
    const firstBuilds = assertUnique(first)
    expect(firstBuilds.map(build => build.items.filter(isBoot).length)).toEqual([1, 1, 1, 1, 0])
    const spoofed = structuredClone(first)
    spoofed.round!.builds[otherIds[0]].itemIds![0] = round.builds[host].itemIds![0]
    expect(parseHostMessage({ type: 'snapshot', now: 1, snapshot: spoofed })).toBeNull()

    advance(COUNTDOWN + ROLL_LOCK)
    const hostBootSlot = firstBuilds[0].items.findIndex(isBoot)
    expect(authority.dispatch(host, { type: 'reroll', roundId: round.id, requestId: 'remove-boots', index: hostBootSlot }))
      .toMatchObject({ ok: true, changed: true })
    const afterReroll = assertUnique(authority.snapshot())
    expect(afterReroll[0].items.some(isBoot)).toBe(false)
    expect(afterReroll.slice(1)).toEqual(firstBuilds.slice(1))

    const vetoSlot = afterReroll[1].items.findIndex(isBoot)
    expect(authority.dispatch(host, { type: 'veto', roundId: round.id, requestId: 'unique-veto',
      targetId: otherIds[0], index: vetoSlot, itemId: afterReroll[1].items[vetoSlot].id }))
      .toMatchObject({ ok: true, changed: true })
    const afterVeto = assertUnique(authority.snapshot())
    expect(afterVeto[1].items.some(isBoot)).toBe(false)
    expect(authority.snapshot().round!.builds[otherIds[0]]).toMatchObject({ used: 0, remaining: 2, lockedItemSlots: [vetoSlot] })
    expect(afterVeto.slice(2)).toEqual(firstBuilds.slice(2))

    const restored = PartyAuthority.resume(authority.checkpoint(), options)
    expect(assertUnique(restored.snapshot())).toEqual(afterVeto)
  })
})
