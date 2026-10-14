import { SECTIONS, type Section } from '../constants/academics'

// End-of-session promotion rules (docs/features/10-dashboards-promotion.md).

export const PROMOTION_OUTCOMES = ['promoted', 'repeated', 'graduated', 'withdrawn'] as const
export type PromotionOutcome = typeof PROMOTION_OUTCOMES[number]

export const PROMOTION_OUTCOME_LABELS: Record<PromotionOutcome, string> = {
  promoted: 'Promote',
  repeated: 'Repeat',
  graduated: 'Graduate',
  withdrawn: 'Withdraw',
}

type Level = { id: string, section: Section, sortOrder: number, name: string }
type Arm = { id: string, classLevelId: string, name: string }
export type PromotionRow = { studentId: string, outcome: PromotionOutcome, toClassArmId?: string | null }

/** The school's levels in class order: by section (Nursery → SSS), then the school's order within it. */
function ordered<L extends Level>(levels: readonly L[]) {
  return [...levels].sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || a.sortOrder - b.sortOrder)
}

/** The level after this one (across sections), or null for the last level (or an unknown one). */
export function nextLevel<L extends Level>(levels: readonly L[], levelId: string): L | null {
  const order = ordered(levels)
  const i = order.findIndex(l => l.id === levelId)
  return i === -1 ? null : order[i + 1] ?? null
}

/** Default for a student of `fromArm`: the next level's arm with the same name (null if none), or graduate after the last level. */
export function defaultPlacement({ levels, arms, fromArm }: { levels: readonly Level[], arms: readonly Arm[], fromArm: Arm }): { outcome: PromotionOutcome, toClassArmId: string | null } {
  const next = nextLevel(levels, fromArm.classLevelId)
  if (!next) return { outcome: 'graduated', toClassArmId: null }
  return { outcome: 'promoted', toClassArmId: arms.find(a => a.classLevelId === next.id && a.name === fromArm.name)?.id ?? null }
}

/** Per-row problems: a class for promoted/repeating students (same level to repeat, a later one to promote), none otherwise. */
export function validatePromotion(rows: readonly PromotionRow[], { levels, arms, fromArm }: { levels: readonly Level[], arms: readonly Arm[], fromArm: Arm }) {
  const order = ordered(levels)
  const rank = (levelId: string) => order.findIndex(l => l.id === levelId)
  const fromLevel = order.find(l => l.id === fromArm.classLevelId)
  const errors: { studentId: string, message: string }[] = []

  for (const row of rows) {
    const target = row.toClassArmId ? arms.find(a => a.id === row.toClassArmId) : undefined
    let message: string | null = null
    if (row.outcome === 'graduated' || row.outcome === 'withdrawn') {
      if (row.toClassArmId) message = `A ${row.outcome === 'graduated' ? 'graduating' : 'withdrawn'} student doesn't get a class`
    }
    else if (!target) message = 'Choose a class'
    else if (row.outcome === 'repeated' && target.classLevelId !== fromArm.classLevelId) message = `A repeating student stays in ${fromLevel?.name ?? 'the same class'}`
    else if (row.outcome === 'promoted' && rank(target.classLevelId) <= rank(fromArm.classLevelId)) message = 'Promote to a later class'
    if (message) errors.push({ studentId: row.studentId, message })
  }
  return errors
}
