import type { ArcadePhase } from './timeline'
import './stage-effects.css'

const phases = [
  { phase: 'champion', title: 'Champion' },
  { phase: 'items', title: 'Items' },
  { phase: 'spells', title: 'Spells' },
  { phase: 'skills', title: 'Skills' },
  { phase: 'augments', title: 'Augments' },
] as const

export function StageProgress({ phase, fullRoll }: { phase: ArcadePhase; fullRoll: boolean }) {
  const current = phase === 'complete' ? phases.length : fullRoll ? phases.findIndex(stage => stage.phase === phase) : -1
  return (
    <div className="stage-progress" aria-hidden="true">
      {phases.map(({ title, phase }, index) => (
        <span key={phase} data-stage={index === current ? 'current' : index < current ? 'done' : undefined}>
          <i /><span>{title}</span>
        </span>
      ))}
    </div>
  )
}

export function StageAtmosphere({ phase, championImpact, reducedMotion }: {
  phase: ArcadePhase
  championImpact?: number
  reducedMotion: boolean
}) {
  if (reducedMotion || (phase === 'idle' && championImpact === undefined)) return null
  return (
    <div className="stage-atmosphere" aria-hidden="true" data-stage={phase}>
      {phase !== 'idle' && <span className="stage-scan" key={phase} />}
      {championImpact !== undefined && (
        <span className="stage-sigil" key={championImpact}>
          <i /><i /><i />
        </span>
      )}
    </div>
  )
}
