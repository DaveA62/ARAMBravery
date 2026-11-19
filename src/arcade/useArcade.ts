import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ArcadeAudio, type ArcadeSound, type AudioPreferences } from './audio'
import { applyArcadeEvents, planRoll, settledFrame, type MotionPreference, type RollKind, type RollOptions } from './timeline'

type ActiveRoll = {
  timer: ReturnType<typeof setTimeout> | undefined
}

function motionMedia() {
  return typeof window === 'undefined' || !window.matchMedia
    ? undefined
    : window.matchMedia('(prefers-reduced-motion: reduce)')
}

function subscribeMotion(listener: () => void) {
  const media = motionMedia()
  media?.addEventListener('change', listener)
  return () => media?.removeEventListener('change', listener)
}

const reducedMotionSnapshot = () => motionMedia()?.matches ?? false
const reducedMotionServer = () => false

export function useArcade(preferences: AudioPreferences & { motion: MotionPreference }) {
  const { motion, muted, master, effects } = preferences
  const reducedMotion = useSyncExternalStore(subscribeMotion, reducedMotionSnapshot, reducedMotionServer)
  const effectiveMotion = reducedMotion ? 'off' : motion
  const [audio] = useState(() => new ArcadeAudio(preferences))
  const [frame, setFrame] = useState(settledFrame)
  const active = useRef<ActiveRoll | null>(null)
  const nextId = useRef(0)

  const play = useCallback((sound: ArcadeSound, chaotic = false) => {
    if (sound !== 'hover') audio.unlock()
    audio.play(sound, chaotic)
  }, [audio])

  const unlock = useCallback(() => audio.unlock(), [audio])

  const skip = useCallback(() => {
    if (active.current) {
      clearTimeout(active.current.timer)
      active.current = null
      audio.stop()
    }
    setFrame(settledFrame())
  }, [audio])

  useEffect(() => {
    audio.configure({ muted, master, effects })
  }, [audio, muted, master, effects])

  useEffect(() => {
    if (effectiveMotion === 'off') skip()
  }, [effectiveMotion, skip])

  useEffect(() => () => {
    clearTimeout(active.current?.timer)
    active.current = null
    audio.dispose()
  }, [audio])

  const run = useCallback((kind: RollKind, commit: () => void, options: RollOptions = {}) => {
    if (active.current) return false

    const roll: ActiveRoll = { timer: undefined }
    active.current = roll
    const { initial, events } = planRoll(++nextId.current, kind, effectiveMotion, options)

    try {
      commit()
    } catch (error) {
      active.current = null
      throw error
    }

    audio.unlock()
    const isFull = kind === 'full'
    const soundOptions = { championRoles: options.championRoles, short: effectiveMotion === 'short' }
    audio.play(events.length ? (isFull ? 'roll' : 'spin') : (isFull ? 'complete' : 'tap'), options.chaotic, soundOptions)
    setFrame(initial)

    if (!events.length) {
      active.current = null
      return true
    }

    const start = performance.now()
    let current = initial
    let cursor = 0

    const advance = () => {
      if (active.current !== roll) return
      const next = applyArcadeEvents(current, events, performance.now() - start, cursor)
      if (next.frame !== current) setFrame(next.frame)
      if (next.sound) audio.play(next.sound, options.chaotic, { ...soundOptions, lane: next.lane })
      current = next.frame
      cursor = next.cursor

      if (cursor === events.length) {
        active.current = null
        return
      }

      schedule()
    }

    const schedule = () => {
      const delay = events[cursor].at - (performance.now() - start)
      roll.timer = setTimeout(advance, Math.max(1, Math.ceil(delay)))
    }

    schedule()
    return true
  }, [audio, effectiveMotion])

  return { ...frame, effectiveMotion, run, skip, play, unlock }
}
