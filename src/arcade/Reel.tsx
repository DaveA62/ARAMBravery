import { useState, type CSSProperties } from 'react'
import type { ReelTrack } from './timeline'
import './reel.css'

export type ReelFace = {
  id: string
  name: string
  image?: string
}

type ReelProps = {
  face: ReelFace
  pool?: readonly ReelFace[]
  track?: ReelTrack | null
  variant?: 'item' | 'champion' | 'spell'
  className?: string
  decorative?: boolean
  vetoed?: boolean
}

type ReelStyle = CSSProperties & {
  '--arcade-reel-duration'?: string
  '--arcade-reel-travel'?: string
}

function FaceArt({ face, spinning }: { face: ReelFace; spinning?: boolean }) {
  const [failed, setFailed] = useState(false)
  if (!face.image || failed) {
    const initials = face.name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('')
    return <span className="arcade-reel__fallback">{initials || '?'}</span>
  }

  return (
    <img
      className="arcade-reel__image"
      src={face.image}
      alt=""
      decoding={spinning ? 'sync' : 'async'}
      draggable={false}
      onError={() => setFailed(true)}
    />
  )
}

function makeStrip(face: ReelFace, pool: readonly ReelFace[], track: ReelTrack) {
  const length = Math.min(21, Math.max(8, Math.round(track.duration / 95) + 6))
  const choices = pool.filter((entry) => entry.id !== face.id)
  if (!choices.length) return Array<ReelFace>(length + 1).fill(face)
  const offset = track.id * 19 + track.lane * 11
  const strip = Array.from({ length }, (_, index) => choices[(offset + index) % choices.length])
  return [...strip, face]
}

export function Reel({ face, pool = [], track, variant = 'item', className, decorative = false, vetoed = false }: ReelProps) {
  const state = track?.phase ?? 'idle'
  const spinning = track?.phase === 'spinning'
  const strip = spinning ? makeStrip(face, pool, track) : undefined
  const style: ReelStyle = {
    '--arcade-reel-duration': track ? `${track.duration}ms` : undefined,
    '--arcade-reel-travel': strip ? `-${(strip.length - 1) * 100}%` : undefined,
  }
  const label = spinning || state === 'queued' ? undefined : face.name

  return (
    <span
      className={['arcade-reel', `arcade-reel--${variant}`, className].filter(Boolean).join(' ')}
      data-reel-state={state}
      data-chaotic={track?.chaotic || undefined}
      data-vetoed={vetoed || undefined}
      role={!decorative && label ? 'img' : undefined}
      aria-label={!decorative ? label : undefined}
      aria-hidden={decorative || !label || undefined}
      style={style}
    >
      {strip && (
        <span className="arcade-reel__strip" key={`strip-${track?.id}`}>
          {strip.map((entry, index) => (
            <span className="arcade-reel__cell" key={index}>
              <FaceArt key={entry.image ?? entry.id} face={entry} spinning />
            </span>
          ))}
        </span>
      )}
      {state === 'queued' && <span className="arcade-reel__marker" />}
      {(state === 'idle' || state === 'landed') && (
        <span className="arcade-reel__result" key={`${state}-${track?.id ?? 0}-${face.id}`}>
          <FaceArt key={face.image ?? face.id} face={face} />
          {state === 'landed' && <>
            <span className="arcade-reel__flare" />
            <span className="arcade-reel__shock" />
            <span className="arcade-reel__sparks" aria-hidden="true">
              <i /><i /><i /><i /><i /><i />
            </span>
          </>}
        </span>
      )}
      {spinning && <span className="arcade-reel__shutter" />}
    </span>
  )
}
