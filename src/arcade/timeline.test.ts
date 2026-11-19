import { describe, expect, it } from 'vitest'
import { applyArcadeEvents, planRoll, settledFrame } from './timeline'

describe('challenge reveal timeline', () => {
  it('reveals the champion, each individual item reel, spells, all skills and augments in order', () => {
    const { initial, events } = planRoll(1, 'full', 'full')
    const at = (ms: number) => applyArcadeEvents(initial, events, ms).frame

    expect(initial.tracks.champion?.phase).toBe('spinning')
    expect(initial.tracks.items.map((track) => track?.phase)).toEqual(Array(6).fill('queued'))
    expect(at(790).tracks.champion?.phase).toBe('landed')
    expect(at(915).tracks.items.map((track) => track?.phase)).toEqual(Array(6).fill('spinning'))

    for (let slot = 0; slot < 6; slot++) {
      const tracks = at(1725 + 185 * slot).tracks.items
      expect(tracks.filter((track) => track?.phase === 'landed')).toHaveLength(slot + 1)
      expect(tracks[slot]?.phase).toBe('landed')
    }

    const firstSpell = at(3095)
    expect(firstSpell.tracks.spells.map((track) => track?.phase)).toEqual(['landed', 'spinning'])

    const skillReveal = at(3600)
    expect(skillReveal.revealedSkills).toBeGreaterThan(0)
    expect(skillReveal.revealedSkills).toBeLessThan(18)
    expect(skillReveal.showAugments).toBe(false)

    const duration = events.at(-1)!.at
    expect(duration).toBeGreaterThanOrEqual(3000)
    expect(duration).toBeLessThanOrEqual(5000)
    expect(at(duration)).toMatchObject({
      phase: 'complete', busy: false, complete: true, revealedSkills: 18, showAugments: true,
    })
  })

  it('skips the champion reel when a champion was selected manually', () => {
    const manual = planRoll(1, 'full', 'full', { manualChampion: true, skillCount: 15 })
    expect(manual.initial.tracks.champion).toBeNull()
    expect(applyArcadeEvents(manual.initial, manual.events, 290).frame.tracks.champion?.phase).toBe('landed')
    expect(applyArcadeEvents(manual.initial, manual.events, Infinity).frame.revealedSkills).toBe(15)
  })

  it('spins only the requested item or spell on an individual reroll', () => {
    const item = planRoll(2, { item: 3 }, 'full')
    expect(item.initial.tracks.items.map((track) => track?.phase ?? null)).toEqual(
      [null, null, null, 'spinning', null, null],
    )
    expect(item.initial.tracks.spells).toEqual([null, null])

    const spell = planRoll(3, { spell: 1 }, 'full')
    expect(spell.initial.tracks.items).toEqual(Array(6).fill(null))
    expect(spell.initial.tracks.spells.map((track) => track?.phase ?? null)).toEqual([null, 'spinning'])
    expect(spell.initial.revealedSkills).toBe(Infinity)
    expect(spell.initial.showAugments).toBe(true)
    expect(applyArcadeEvents(spell.initial, spell.events, Infinity).frame.phase).toBe('idle')
  })

  it('shortens the sequence and settles instantly with motion off', () => {
    const full = planRoll(1, 'full', 'full')
    const short = planRoll(1, 'full', 'short')
    expect(short.events.at(-1)!.at).toBeLessThan(full.events.at(-1)!.at / 2)
    expect(planRoll(1, 'full', 'off')).toEqual({ initial: settledFrame(), events: [] })
  })

  it('settles after a background-tab pause without playing a backlog of effects', () => {
    const { initial, events } = planRoll(1, 'full', 'full')
    const resumed = applyArcadeEvents(initial, events, 20000)
    expect(resumed.frame.busy).toBe(false)
    expect(resumed.frame.complete).toBe(true)
    expect(resumed.frame.tracks.items.map((track) => track?.phase)).toEqual(Array(6).fill('landed'))
    expect(resumed.sound).toBeUndefined()
  })
})
