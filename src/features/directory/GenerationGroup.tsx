import type { ReactNode } from 'react'

type GenerationGroupProps = {
  label: string
  children: ReactNode
}

const TIER_LABELS: Record<number, string> = {
  [-3]: 'Great-grandparents',
  [-2]: 'Grandparents\' generation',
  [-1]: 'Parents\' generation',
  0: 'Your generation',
  1: 'Children\'s generation',
  2: 'Grandchildren\'s generation',
  3: 'Great-grandchildren',
}

export function tierLabel(tier: number): string {
  if (tier in TIER_LABELS) return TIER_LABELS[tier]
  if (tier < -3) return `${Math.abs(tier)} generations above`
  return `${tier} generations below`
}

export function GenerationGroup({ label, children }: GenerationGroupProps) {
  return (
    <div className="dir-generation-group" role="list" aria-label={label}>
      <div className="dir-generation-group__header">
        <span>{label}</span>
      </div>
      <div className="dir-generation-group__items">
        {children}
      </div>
    </div>
  )
}
