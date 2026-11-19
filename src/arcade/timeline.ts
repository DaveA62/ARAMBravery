import type { ArcadeSound } from './audio'

export type MotionPreference = 'full' | 'short' | 'off'
export type ArcadePhase = 'idle' | 'champion' | 'items' | 'spells' | 'skills' | 'augments' | 'complete'
export type RollKind = 'full' | 'items' | { item: number } | { spell: number }
export type RollOptions = { manualChampion?: boolean; chaotic?: boolean; skillCount?: number; championRoles?: readonly string[] }

export type ReelTrack = {
  id: number
  lane: number
  duration: number
  phase: 'queued' | 'spinning' | 'landed'
  chaotic: boolean
}

export type ArcadeFrame = {
  phase: ArcadePhase
  busy: boolean
  tracks: {
    champion: ReelTrack | null
    items: (ReelTrack | null)[]
    spells: (ReelTrack | null)[]
  }
  revealedSkills: number
  showAugments: boolean
  complete: boolean
}

export type ArcadeEvent = {
  at: number
  update?: (frame: ArcadeFrame) => ArcadeFrame
  sound?: ArcadeSound
  lane?: number
}

export function settledFrame(): ArcadeFrame {
  return {
    phase: 'idle',
    busy: false,
    tracks: { champion: null, items: Array<null>(6).fill(null), spells: Array<null>(2).fill(null) },
    revealedSkills: Infinity,
    showAugments: true,
    complete: true,
  }
}

function replaceTrack(tracks: ArcadeFrame['tracks'], group: 'items' | 'spells', track: ReelTrack) {
  return { ...tracks, [group]: tracks[group].map((current, lane) => lane === track.lane ? track : current) }
}

export function planRoll(id: number, kind: RollKind, motion: MotionPreference, options: RollOptions = {}) {
  const initial = settledFrame()
  const events: ArcadeEvent[] = []
  if (motion === 'off') return { initial, events }

  const scale = motion === 'short' ? 0.39 : 1
  const time = (at: number) => Math.round(at * scale)
  const event = (at: number, update?: ArcadeEvent['update'], sound?: ArcadeSound, lane?: number) =>
    events.push({ at: time(at), update, sound, lane })

  const track = (lane: number, duration: number, phase: ReelTrack['phase']): ReelTrack => ({
    id, lane, duration: time(duration), phase, chaotic: options.chaotic ?? false,
  })

  const groupTracks = (
    group: 'items' | 'spells', lanes: number[], begins: number, firstStop: number, stopInterval: number,
  ) => {
    for (const [index, lane] of lanes.entries()) {
      const duration = firstStop + index * stopInterval
      if (begins > 0) {
        initial.tracks[group][lane] = track(lane, duration, 'queued')
        event(begins, (frame) => ({
          ...frame, tracks: replaceTrack(frame.tracks, group, track(lane, duration, 'spinning')),
        }))
      } else {
        initial.tracks[group][lane] = track(lane, duration, 'spinning')
      }

      event(begins + duration, (frame) => ({
        ...frame, tracks: replaceTrack(frame.tracks, group, track(lane, duration, 'landed')),
      }), group === 'items' ? 'stop' : 'spell', lane)
    }
    return begins + firstStop + (lanes.length - 1) * stopInterval
  }

  const finish = (at: number, sound?: ArcadeSound) =>
    event(at, (frame) => ({ ...frame, phase: kind === 'full' ? 'complete' : 'idle', busy: false, complete: true }), sound)

  initial.busy = true

  if (kind !== 'full') {
    if (typeof kind === 'object' && 'spell' in kind) {
      initial.phase = 'spells'
      finish(groupTracks('spells', [kind.spell], 0, 560, 0) + 100)
    } else {
      initial.phase = 'items'
      const lanes = kind === 'items' ? [0, 1, 2, 3, 4, 5] : [kind.item]
      if (kind === 'items') event(370, undefined, 'brake')
      finish(groupTracks('items', lanes, 0, kind === 'items' ? 670 : 620, 130) + 100)
    }
    return { initial, events: events.sort((a, b) => a.at - b.at) }
  }

  initial.phase = 'champion'
  initial.revealedSkills = 0
  initial.showAugments = false
  initial.complete = false
  const championEnd = options.manualChampion ? 290 : 790
  if (!options.manualChampion) initial.tracks.champion = track(0, championEnd, 'spinning')
  event(championEnd, (frame) => ({
    ...frame, tracks: { ...frame.tracks, champion: track(0, championEnd, 'landed') },
  }), 'champion')

  const itemsStart = championEnd + 125
  event(itemsStart, (frame) => ({ ...frame, phase: 'items' }), 'spin')
  if (motion === 'full') {
    event(itemsStart + 395, undefined, 'spin')
    event(itemsStart + 740, undefined, 'brake')
  }
  const itemsEnd = groupTracks('items', [0, 1, 2, 3, 4, 5], itemsStart, 810, 185)

  const spellsStart = itemsEnd + 60
  event(spellsStart, (frame) => ({ ...frame, phase: 'spells' }))
  const spellsEnd = groupTracks('spells', [0, 1], spellsStart, 385, 145)

  let cursor = spellsEnd + 66
  const count = options.skillCount ?? 18
  event(cursor, (frame) => ({ ...frame, phase: 'skills' }))
  for (let level = 1; level <= count; level++) {
    cursor += 29
    event(cursor, (frame) => ({ ...frame, revealedSkills: level }), level % 3 === 1 ? 'skill' : undefined)
  }

  cursor += 70
  event(cursor, (frame) => ({ ...frame, phase: 'augments', showAugments: true }), 'cards')
  finish(cursor + 320, 'complete')
  return { initial, events: events.sort((a, b) => a.at - b.at) }
}

export function applyArcadeEvents(frame: ArcadeFrame, events: ArcadeEvent[], elapsed: number, from = 0) {
  let next = frame
  let cursor = from
  let sound: ArcadeSound | undefined
  let lane: number | undefined
  while (cursor < events.length && events[cursor].at <= elapsed) {
    const event = events[cursor++]
    if (event.update) next = event.update(next)
    if (event.sound && elapsed - event.at < 70) {
      sound = event.sound
      lane = event.lane
    }
  }
  return { frame: next, cursor, sound, lane }
}
