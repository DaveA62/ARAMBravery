import { Diamond } from 'lucide-react'
import { useState } from 'react'
import type { Augment } from '../data'

export function matchesAugment(augment: Augment, input: string): boolean {
  const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').replace(/['‘’]/g, '').toLowerCase()
  const name = normalize(augment.name)
  return normalize(input).trim().split(/\s+/).every(word => name.includes(word))
}

export function AugmentIcon({ augment }: { augment: Augment }) {
  const [broken, setBroken] = useState('')
  return (
    <span className="augment-icon" data-tier={augment.tier.toLowerCase()} aria-hidden="true">
      {augment.icon && broken !== augment.icon
        ? <img src={augment.icon} alt="" loading="lazy" decoding="async" onError={() => setBroken(augment.icon)} />
        : <Diamond size={22} />}
    </span>
  )
}
